import crypto from "node:crypto";

const DEFAULT_SETTINGS = {
  storeName: "Strawping",
  tagline: "Thoughtfully crafted lifestyle essentials and aesthetic goods.",
  announcement: "✨ Free express doorstep delivery on all orders!",
  announcementActive: true,
  currency: "$",
  contactTelegram: "@didaoeng"
};

const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "strict-transport-security": "max-age=63072000; includeSubDomains",
    ...extraHeaders
  },
  body: JSON.stringify(body)
});

const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const SESSION_TTL_SECONDS = 60 * 60 * 2;
const SESSION_ISSUER = "strawping-store";
const SESSION_AUDIENCE = "strawping-admin";
const MIN_ADMIN_PASSWORD_LENGTH = 12;
const PRODUCT_IMAGE_BUCKET = "product-images";
const MAX_PRODUCT_IMAGE_BYTES = 1_500_000;
const MAX_IMAGE_UPLOAD_REQUEST_BYTES = 2_100_000;

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanLine(value, max, required = false) {
  if (value == null && !required) return "";
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if ((required && !cleaned) || cleaned.length > max) return null;
  return cleaned;
}

function cleanSettings(value = {}) {
  const source = isRecord(value) ? value : {};
  const text = (key, fallback, max) => {
    const input = source[key];
    if (input === undefined || input === null || input === "") return fallback;
    const result = cleanLine(input, max);
    return result === null ? fallback : result;
  };
  return {
    storeName: text("storeName", DEFAULT_SETTINGS.storeName, 80) || DEFAULT_SETTINGS.storeName,
    tagline: text("tagline", DEFAULT_SETTINGS.tagline, 240),
    announcement: text("announcement", DEFAULT_SETTINGS.announcement, 300),
    announcementActive: typeof source.announcementActive === "boolean"
      ? source.announcementActive
      : DEFAULT_SETTINGS.announcementActive,
    currency: text("currency", DEFAULT_SETTINGS.currency, 8) || DEFAULT_SETTINGS.currency,
    contactTelegram: text("contactTelegram", DEFAULT_SETTINGS.contactTelegram, 80)
  };
}

async function db(path, opts = {}) {
  const url = env("SUPABASE_URL").replace(/\/+$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: opts.prefer || "return=representation",
      ...(opts.headers || {})
    },
    signal: AbortSignal.timeout(8000)
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // A non-JSON database response is handled as a generic server error.
  }
  if (!response.ok) throw new Error(`Database operation failed (${response.status})`);
  return data;
}

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function adminSessionSecret() {
  const secret = env("ADMIN_SESSION_SECRET");
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("ADMIN_SESSION_SECRET must contain at least 32 characters");
  }
  return secret;
}

// ---- Admin credential (STP-001, STP-004) ---------------------------------
// Preferred: STRAWPING_ADMIN_PASSWORD_HASH = "scrypt$N$r$p$<salt b64>$<hash b64>"
// (create one with: node scripts/hash-password.mjs). Legacy fallback: the plain
// STRAWPING_ADMIN_PASSWORD variable, which still works but is warned about.
const SCRYPT_MAX_N = 2 ** 17;
let warnedLegacyCredential = false;

function scryptAsync(password, salt, keylen, options) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

function parseScryptHash(stored) {
  const parts = String(stored).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [, n, r, p, salt, hash] = parts;
  const params = { N: Number(n), r: Number(r), p: Number(p) };
  const saltBuf = Buffer.from(salt, "base64");
  const hashBuf = Buffer.from(hash, "base64");
  if (
    !Number.isInteger(params.N) || params.N < 2 ** 14 || params.N > SCRYPT_MAX_N ||
    (params.N & (params.N - 1)) !== 0 ||
    !Number.isInteger(params.r) || params.r < 1 || params.r > 16 ||
    !Number.isInteger(params.p) || params.p < 1 || params.p > 4 ||
    saltBuf.length < 16 || hashBuf.length < 32
  ) {
    return null;
  }
  return { params, saltBuf, hashBuf };
}

function adminCredential() {
  const storedHash = process.env.STRAWPING_ADMIN_PASSWORD_HASH;
  if (storedHash) {
    const parsed = parseScryptHash(storedHash);
    if (!parsed) throw new Error("STRAWPING_ADMIN_PASSWORD_HASH is not a valid scrypt hash");
    return { kind: "scrypt", ...parsed, fingerprintSource: storedHash };
  }
  const plain = env("STRAWPING_ADMIN_PASSWORD");
  if (!warnedLegacyCredential) {
    warnedLegacyCredential = true;
    console.warn(
      "Strawping: using the plain STRAWPING_ADMIN_PASSWORD variable. Switch to STRAWPING_ADMIN_PASSWORD_HASH (node scripts/hash-password.mjs)."
    );
    if (plain.length < MIN_ADMIN_PASSWORD_LENGTH) {
      console.warn(
        `Strawping: the admin password is shorter than ${MIN_ADMIN_PASSWORD_LENGTH} characters. Use a longer passphrase.`
      );
    }
  }
  return { kind: "plain", plain, fingerprintSource: plain };
}

async function verifyAdminPassword(supplied, credential) {
  if (credential.kind === "scrypt") {
    const { params, saltBuf, hashBuf } = credential;
    const derived = await scryptAsync(supplied.normalize("NFKC"), saltBuf, hashBuf.length, {
      ...params,
      maxmem: 256 * 1024 * 1024
    });
    return crypto.timingSafeEqual(derived, hashBuf);
  }
  // Legacy plain-text variable. HMAC both sides so the comparison is constant-time
  // and independent of password length. (This is not password storage.)
  const key = adminSessionSecret();
  const a = crypto.createHmac("sha256", key).update(supplied).digest();
  const b = crypto.createHmac("sha256", key).update(credential.plain).digest();
  return crypto.timingSafeEqual(a, b);
}

// Changing the admin password changes this value, which invalidates every
// session that was issued before the change.
function credentialVersion(credential) {
  return crypto
    .createHmac("sha256", adminSessionSecret())
    .update(`credential-version:${credential.fingerprintSource}`)
    .digest("hex")
    .slice(0, 24);
}

// ---- Server-side admin sessions (STP-002, STP-003) -------------------------
// The bearer token is a signed handle. The session row in public.store_sessions
// is the source of truth, so a session can be revoked and ends immediately.
function signSessionPayload(encodedPayload) {
  return crypto.createHmac("sha256", adminSessionSecret()).update(encodedPayload).digest("base64url");
}

function hashSessionId(sessionId) {
  return crypto.createHash("sha256").update(`session:${sessionId}`).digest("hex");
}

async function createAdminSession(credential) {
  const now = Math.floor(Date.now() / 1000);
  const sessionId = crypto.randomBytes(32).toString("hex");
  const csrfToken = crypto.randomBytes(32).toString("hex");
  const payload = {
    typ: "strawping-admin-session",
    iss: SESSION_ISSUER,
    aud: SESSION_AUDIENCE,
    role: "admin",
    v: 1,
    cv: credentialVersion(credential),
    sessionId,
    csrfToken,
    iat: now,
    nbf: now,
    exp: now + SESSION_TTL_SECONDS
  };
  await db("store_sessions", {
    method: "POST",
    body: JSON.stringify({
      session_id_hash: hashSessionId(sessionId),
      expires_at: new Date(payload.exp * 1000).toISOString()
    }),
    prefer: "return=minimal"
  });
  // Best-effort housekeeping of expired rows; never blocks a login.
  db(`store_sessions?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, {
    method: "DELETE",
    prefer: "return=minimal"
  }).catch(() => {});
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    token: `${encodedPayload}.${signSessionPayload(encodedPayload)}`,
    csrfToken,
    expiresIn: SESSION_TTL_SECONDS
  };
}

async function verifyAdminSession(event) {
  const header = event.headers?.authorization || event.headers?.Authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const expected = Buffer.from(signSessionPayload(parts[0]), "base64url");
  let actual;
  try {
    actual = Buffer.from(parts[1], "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const now = Date.now() / 1000;
  if (
    !isRecord(payload) ||
    payload.typ !== "strawping-admin-session" ||
    payload.iss !== SESSION_ISSUER ||
    payload.aud !== SESSION_AUDIENCE ||
    payload.role !== "admin" ||
    payload.v !== 1 ||
    typeof payload.sessionId !== "string" ||
    !/^[0-9a-f]{64}$/.test(payload.sessionId) ||
    !Number.isFinite(payload.exp) ||
    !Number.isFinite(payload.iat) ||
    !Number.isFinite(payload.nbf) ||
    payload.nbf > now + 5 ||
    payload.exp <= now ||
    typeof payload.csrfToken !== "string" ||
    payload.csrfToken.length < 32 ||
    !safeEqual(payload.cv, credentialVersion(adminCredential()))
  ) {
    return null;
  }

  // Server-side check: the session must still exist and must not be revoked.
  // A database failure throws, so the request fails closed (never "allowed").
  const sessionHash = hashSessionId(payload.sessionId);
  const rows = await db(
    `store_sessions?session_id_hash=eq.${sessionHash}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=session_id_hash`,
    { method: "GET" }
  );
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  return { ...payload, sessionHash };
}

async function revokeAdminSession(session) {
  await db(`store_sessions?session_id_hash=eq.${session.sessionHash}`, {
    method: "PATCH",
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    prefer: "return=minimal"
  });
}

function verifyCsrfToken(event, bodyToken, session) {
  const headerToken = event.headers?.["x-csrf-token"] || event.headers?.["X-CSRF-Token"] || "";
  return Boolean(
    session &&
    safeEqual(bodyToken, session.csrfToken) &&
    safeEqual(headerToken, session.csrfToken)
  );
}

async function rateLimit(event, context, resource, limit, windowSec) {
  // The hosting adapter supplies a platform-verified client IP. Never trust a
  // client-provided IP header directly.
  const clientIp = typeof context?.ip === "string" && context.ip ? context.ip : "unknown";
  const ipHash = crypto.createHash("sha256").update(clientIp).digest("hex");
  const rateKey = `${resource}:${ipHash}`;
  let response;
  try {
    response = await fetch(
      `${env("SUPABASE_URL").replace(/\/+$/, "")}/rest/v1/rpc/consume_rate_limit`,
      {
        method: "POST",
        headers: {
          apikey: env("SUPABASE_SERVICE_ROLE_KEY"),
          authorization: `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          p_key: rateKey,
          p_limit: limit,
          p_window_seconds: windowSec
        }),
        signal: AbortSignal.timeout(5000)
      }
    );
  } catch (error) {
    console.error("Strawping rate-limit RPC connection failed", {
      errorName: typeof error?.name === "string" ? error.name.slice(0, 60) : "Error"
    });
    throw Object.assign(new Error("Rate limiter unavailable"), { status: 503 });
  }

  if (!response.ok) {
    let errorCode = "";
    let errorMessage = "";
    try {
      const details = await response.json();
      if (isRecord(details)) {
        errorCode = typeof details.code === "string" ? details.code.slice(0, 40) : "";
        errorMessage = typeof details.message === "string" ? details.message.slice(0, 240) : "";
      }
    } catch {
      // Do not log an unstructured upstream response body.
    }
    console.error("Strawping rate-limit RPC rejected", {
      status: response.status,
      errorCode,
      errorMessage
    });
    throw Object.assign(new Error("Rate limiter unavailable"), { status: 503 });
  }

  let allowed;
  try {
    allowed = await response.json();
  } catch {
    console.error("Strawping rate-limit RPC returned invalid JSON", {
      status: response.status
    });
    throw Object.assign(new Error("Rate limiter unavailable"), { status: 503 });
  }
  if (allowed !== true) {
    throw Object.assign(new Error("Too many requests"), { status: 429 });
  }
}

// ---- Product variants -----------------------------------------------------
// A variant is one buyable combination, e.g. { size: "M", color: "Red" }.
// Products without variants keep their original shape (no extra fields).
const VARIANT_FIELDS = ["size", "color", "type"];
const MAX_VARIANTS_PER_PRODUCT = 100;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function variantLabel(variant) {
  return VARIANT_FIELDS.map(field => variant[field]).filter(Boolean).join(" / ");
}

function normalizeVariants(value, basePriceCents) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_VARIANTS_PER_PRODUCT) return null;
  const ids = new Set();
  const combinations = new Set();
  const variants = [];

  for (const raw of value) {
    if (!isRecord(raw) || typeof raw.id !== "string" || !ID_PATTERN.test(raw.id) || ids.has(raw.id)) {
      return null;
    }
    const attributes = {};
    for (const field of VARIANT_FIELDS) {
      const cleaned = cleanLine(raw[field] ?? "", 40);
      if (cleaned === null) return null;
      attributes[field] = cleaned;
    }
    // Every variant needs at least one of size / color / type.
    if (!VARIANT_FIELDS.some(field => attributes[field])) return null;

    if (!Number.isInteger(raw.stock) || raw.stock < 0 || raw.stock > 1_000_000) return null;

    const adjustment = raw.priceAdjustment ?? 0;
    if (typeof adjustment !== "number" || !Number.isFinite(adjustment) || Math.abs(adjustment) > 1_000_000) {
      return null;
    }
    const adjustmentCents = Math.round(adjustment * 100);
    if (Math.abs(adjustment - adjustmentCents / 100) > 1e-8) return null;
    if (basePriceCents + adjustmentCents < 0) return null;

    // The same size/color/type combination may only appear once.
    const combination = VARIANT_FIELDS.map(field => attributes[field].toLowerCase()).join("|");
    if (combinations.has(combination)) return null;

    ids.add(raw.id);
    combinations.add(combination);
    variants.push({
      id: raw.id,
      size: attributes.size,
      color: attributes.color,
      type: attributes.type,
      stock: raw.stock,
      priceAdjustment: adjustmentCents / 100
    });
  }

  // A column (size/color/type) is either filled for every variant or for none.
  for (const field of VARIANT_FIELDS) {
    const filled = variants.filter(variant => variant[field]).length;
    if (filled !== 0 && filled !== variants.length) return null;
  }
  return variants;
}

function normalizeProduct(value) {
  if (!isRecord(value)) return null;
  const id = value.id;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) return null;

  const name = cleanLine(value.name, 160, true);
  const category = cleanLine(value.category ?? "General", 80, true);
  const description = cleanLine(value.description ?? "", 2000);
  if (name === null || category === null || description === null) return null;

  if (typeof value.price !== "number" || !Number.isFinite(value.price) || value.price < 0 || value.price > 10000000) {
    return null;
  }
  const priceCents = Math.round(value.price * 100);
  if (!Number.isSafeInteger(priceCents) || Math.abs(value.price - priceCents / 100) > 1e-8) return null;

  const image = cleanLine(value.image ?? "", 2048);
  if (image === null) return null;
  if (image) {
    try {
      if (new URL(image).protocol !== "https:") return null;
    } catch {
      return null;
    }
  }
  if (typeof value.inStock !== "boolean") return null;
  if (value.hasVariants !== undefined && typeof value.hasVariants !== "boolean") return null;

  const product = {
    id,
    name,
    category: category || "General",
    price: priceCents / 100,
    image,
    description,
    inStock: value.inStock
  };

  if (value.hasVariants === true) {
    const variants = normalizeVariants(value.variants, priceCents);
    if (!variants) return null;
    return { ...product, hasVariants: true, variants };
  }
  return product;
}

function normalizeCustomer(value) {
  if (!isRecord(value)) return null;
  const name = cleanLine(value.name, 120, true);
  const phone = cleanLine(value.phone, 40, true);
  const email = cleanLine(value.email, 254, true);
  const telegram = cleanLine(value.telegram ?? "", 80);
  const address = cleanLine(value.address ?? "Not provided (Online / Self-Pickup)", 500);
  const notes = cleanLine(value.notes ?? "", 1000);

  if (
    name === null || phone === null || email === null ||
    telegram === null || address === null || notes === null ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
  ) {
    return null;
  }
  return { name, phone, email, telegram, address, notes };
}

function parseBody(event, maxBytes = 100000) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    throw Object.assign(new Error("Request too large"), { status: 413 });
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}

function formatOrderTelegramMessage(order) {
  const customer = order.customer;
  const lines = [
    `🛒 New Strawping order #${order.id}`,
    `Customer: ${customer.name}`,
    `Phone: ${customer.phone}`,
    customer.telegram ? `Telegram: ${customer.telegram}` : "",
    customer.email ? `Email: ${customer.email}` : "",
    `Address: ${customer.address}`,
    customer.notes ? `Notes: ${customer.notes}` : "",
    "",
    "Items:",
    ...order.items.map(item => `• ${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ""} x${item.quantity} — $${item.price.toFixed(2)}`),
    "",
    `Total: $${order.total.toFixed(2)}`
  ].filter(line => line !== undefined);
  const message = lines.join("\n");
  return message.length > 3900 ? `${message.slice(0, 3850)}\n[order message truncated]` : message;
}

async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text }),
      signal: AbortSignal.timeout(7000)
    });
    const result = await response.json().catch(() => ({}));
    return response.ok && result.ok === true;
  } catch {
    return false;
  }
}

export async function handler(event, context = {}) {
  try {
    const method = event.httpMethod;
    const path = event.path || "";
    let segments;
    try {
      segments = path.replace(/^.*\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    } catch {
      return json(400, { error: "Invalid request path" });
    }
    const resource = segments[0] || "";

    // Same-origin requests need no CORS permission. Cross-origin preflights are
    // intentionally not approved; never use CORS as a substitute for auth.
    if (method === "OPTIONS") {
      return { statusCode: 204, headers: { allow: "GET,POST,PUT,PATCH,DELETE,OPTIONS" }, body: "" };
    }

    if (resource === "status" && method === "GET") {
      return json(200, { status: "online" });
    }

    if (resource === "auth" && segments[1] === "login" && method === "POST") {
      await rateLimit(event, context, "admin-login", 8, 900);
      // Account-wide ceiling across all IPs, so a botnet cannot get around the per-IP limit.
      await rateLimit(event, { ip: "global" }, "admin-login-global", 40, 900);
      const body = parseBody(event);
      if (!isRecord(body) || typeof body.password !== "string" || body.password.length > 256) {
        return json(400, { error: "Invalid credentials" });
      }
      const credential = adminCredential();
      if (!(await verifyAdminPassword(body.password, credential))) {
        return json(401, { error: "Invalid credentials" });
      }
      return json(200, await createAdminSession(credential));
    }

    if (resource === "auth" && segments[1] === "logout" && method === "POST") {
      const session = await verifyAdminSession(event);
      if (!session) return json(401, { error: "Unauthorized" });
      await revokeAdminSession(session);
      return json(200, { success: true });
    }

    if (resource === "images" && segments[1] === "upload" && method === "POST") {
      const session = await verifyAdminSession(event);
      if (!session) return json(401, { error: "Unauthorized" });

      const body = parseBody(event, MAX_IMAGE_UPLOAD_REQUEST_BYTES);
      if (!isRecord(body)) return json(400, { error: "Invalid image upload" });
      if (!verifyCsrfToken(event, body.csrfToken, session)) {
        return json(403, { error: "Invalid CSRF token" });
      }

      const match = typeof body.image === "string"
        ? /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.image)
        : null;
      if (!match) return json(400, { error: "Upload a valid JPEG image." });

      const encoded = match[1];
      const imageBytes = Buffer.from(encoded, "base64");
      if (
        imageBytes.length < 4 ||
        imageBytes.length > MAX_PRODUCT_IMAGE_BYTES ||
        imageBytes.toString("base64") !== encoded ||
        imageBytes[0] !== 0xff ||
        imageBytes[1] !== 0xd8 ||
        imageBytes[2] !== 0xff
      ) {
        return json(400, { error: "The image is invalid or exceeds the 1.5 MB upload limit." });
      }

      const objectName = `${crypto.randomUUID()}.jpg`;
      const supabaseUrl = env("SUPABASE_URL").replace(/\/+$/, "");
      const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
      const storageResponse = await fetch(
        `${supabaseUrl}/storage/v1/object/${PRODUCT_IMAGE_BUCKET}/${objectName}`,
        {
          method: "POST",
          headers: {
            apikey: serviceKey,
            authorization: `Bearer ${serviceKey}`,
            "content-type": "image/jpeg",
            "cache-control": "31536000",
            "x-upsert": "false"
          },
          body: imageBytes,
          signal: AbortSignal.timeout(15000)
        }
      );
      if (!storageResponse.ok) {
        console.warn("Product image storage upload failed", { status: storageResponse.status });
        return json(502, { error: "Image upload failed. Check the product-images bucket setup in Supabase." });
      }

      return json(201, {
        url: `${supabaseUrl}/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/${objectName}`
      });
    }

    if (resource === "products" && method === "GET") {
      const rows = await db("store_data?key=eq.products&select=value", { method: "GET" });
      const stored = Array.isArray(rows?.[0]?.value) ? rows[0].value : [];
      return json(200, { products: stored.map(normalizeProduct).filter(Boolean) });
    }

    if (resource === "settings" && method === "GET") {
      const rows = await db("store_data?key=eq.settings&select=value", { method: "GET" });
      return json(200, { settings: cleanSettings(rows?.[0]?.value || DEFAULT_SETTINGS) });
    }

    if (resource === "orders" && method === "GET") {
      const session = await verifyAdminSession(event);
      if (!session) return json(401, { error: "Unauthorized" });
      const orders = await db("store_orders?select=*&order=createdAt.desc&limit=500", { method: "GET" });
      return json(200, { orders: orders || [] });
    }

    if (resource === "orders" && method === "POST") {
      await rateLimit(event, context, "create-order", 5, 900);
      const body = parseBody(event);
      if (!isRecord(body)) return json(400, { error: "Invalid order" });
      const customer = normalizeCustomer(body.customer);
      if (!customer) return json(400, { error: "Enter a valid name, phone number, and email address." });
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) {
        return json(400, { error: "Order must contain between 1 and 50 items." });
      }

      const productRows = await db("store_data?key=eq.products&select=value", { method: "GET" });
      const catalogRows = Array.isArray(productRows?.[0]?.value) ? productRows[0].value : [];
      const catalog = new Map(
        catalogRows.map(normalizeProduct).filter(Boolean).map(product => [product.id, product])
      );
      const seen = new Set();
      const items = [];
      let totalCents = 0;

      for (const requested of body.items) {
        if (
          !isRecord(requested) ||
          typeof requested.id !== "string" ||
          !ID_PATTERN.test(requested.id) ||
          !Number.isInteger(requested.quantity) ||
          requested.quantity < 1 ||
          requested.quantity > 99 ||
          (requested.variantId != null &&
            (typeof requested.variantId !== "string" || !ID_PATTERN.test(requested.variantId)))
        ) {
          return json(400, { error: "Invalid order item." });
        }
        // The same product may appear twice only with different variants.
        const lineKey = `${requested.id}::${requested.variantId ?? ""}`;
        if (seen.has(lineKey)) return json(400, { error: "Invalid order item." });
        seen.add(lineKey);

        const product = catalog.get(requested.id);
        if (!product || !product.inStock) {
          return json(409, { error: "A selected product is unavailable. Refresh the catalog and try again." });
        }

        let unitCents = Math.round(product.price * 100);
        const line = { id: product.id, name: product.name, quantity: requested.quantity };

        if (product.hasVariants) {
          // Variant products must name a real variant (size/color/type) that is in stock.
          if (requested.variantId == null) {
            return json(400, { error: `Please choose a size, color or type for "${product.name}".` });
          }
          const variant = product.variants.find(candidate => candidate.id === requested.variantId);
          if (!variant) {
            return json(400, { error: `The selected option for "${product.name}" is not valid. Refresh and try again.` });
          }
          if (variant.stock < requested.quantity) {
            return json(409, { error: `"${product.name}" (${variantLabel(variant)}) does not have enough stock.` });
          }
          unitCents += Math.round(variant.priceAdjustment * 100);
          line.variantId = variant.id;
          line.variantLabel = variantLabel(variant);
        } else if (requested.variantId != null) {
          return json(400, { error: "Invalid order item." });
        }

        totalCents += unitCents * requested.quantity;
        items.push({ ...line, price: unitCents / 100 });
      }
      if (!Number.isSafeInteger(totalCents) || totalCents > 999999999999) {
        return json(400, { error: "Order total is out of range." });
      }

      const order = {
        id: `ord-${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        status: "New",
        customer,
        items,
        total: totalCents / 100
      };
      const rows = await db("store_orders", {
        method: "POST",
        body: JSON.stringify(order),
        prefer: "return=representation"
      });
      if (!rows?.length) return json(500, { error: "Failed to create order" });

      const created = rows[0];
      const telegramSent = await sendTelegramMessage(formatOrderTelegramMessage(created));
      return json(201, { order: created, telegramSent });
    }

    if (resource === "orders" && segments[1] && method === "PATCH") {
      const session = await verifyAdminSession(event);
      if (!session) return json(401, { error: "Unauthorized" });
      const body = parseBody(event);
      if (!isRecord(body)) return json(400, { error: "Invalid request" });
      if (!verifyCsrfToken(event, body.csrfToken, session)) {
        return json(403, { error: "Invalid CSRF token" });
      }
      if (!ORDER_ID_PATTERN.test(segments[1])) return json(400, { error: "Invalid order id" });
      const allowedStatuses = ["New", "Contacted", "Shipped", "Completed", "Cancelled"];
      if (!allowedStatuses.includes(body.status)) return json(400, { error: "Invalid order status" });
      const rows = await db(`store_orders?id=eq.${encodeURIComponent(segments[1])}`, {
        method: "PATCH",
        body: JSON.stringify({ status: body.status }),
        prefer: "return=representation"
      });
      if (!rows?.length) return json(404, { error: "Order not found" });
      return json(200, { order: rows[0] });
    }

    if (resource === "orders" && segments[1] && method === "DELETE") {
      const session = await verifyAdminSession(event);
      if (!session) return json(401, { error: "Unauthorized" });
      const body = parseBody(event);
      if (!isRecord(body)) return json(400, { error: "Invalid request" });
      if (!verifyCsrfToken(event, body.csrfToken, session)) {
        return json(403, { error: "Invalid CSRF token" });
      }
      if (!ORDER_ID_PATTERN.test(segments[1])) return json(400, { error: "Invalid order id" });
      await db(`store_orders?id=eq.${encodeURIComponent(segments[1])}`, {
        method: "DELETE",
        prefer: "return=minimal"
      });
      return json(200, { success: true });
    }

    if (resource === "notify" && segments[1] === "test" && method === "POST") {
      const session = await verifyAdminSession(event);
      if (!session) return json(401, { error: "Unauthorized" });
      const body = parseBody(event);
      if (!isRecord(body)) return json(400, { error: "Invalid request" });
      if (!verifyCsrfToken(event, body.csrfToken, session)) {
        return json(403, { error: "Invalid CSRF token" });
      }
      if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
        return json(400, { error: "Telegram notifications are not configured." });
      }
      const sent = await sendTelegramMessage("Strawping admin notification test succeeded.");
      if (!sent) return json(502, { error: "Telegram test message could not be delivered." });
      return json(200, { success: true });
    }

    if (resource === "products" && method === "PUT") {
      const session = await verifyAdminSession(event);
      if (!session) return json(401, { error: "Unauthorized" });
      const body = parseBody(event);
      if (!isRecord(body)) return json(400, { error: "Invalid product list" });
      if (!verifyCsrfToken(event, body.csrfToken, session)) {
        return json(403, { error: "Invalid CSRF token" });
      }
      if (!Array.isArray(body.products) || body.products.length > 500) {
        return json(400, { error: "Invalid product list" });
      }

      const products = [];
      const ids = new Set();
      for (const value of body.products) {
        const product = normalizeProduct(value);
        if (!product || ids.has(product.id)) {
          return json(400, { error: "Invalid or duplicate product record" });
        }
        ids.add(product.id);
        products.push(product);
      }

      await db("store_data?on_conflict=key", {
        method: "POST",
        body: JSON.stringify({ key: "products", value: products }),
        prefer: "resolution=merge-duplicates,return=representation"
      });
      return json(200, { products });
    }

    if (resource === "settings" && method === "PUT") {
      const session = await verifyAdminSession(event);
      if (!session) return json(401, { error: "Unauthorized" });
      const body = parseBody(event);
      if (!isRecord(body)) return json(400, { error: "Invalid settings" });
      if (!verifyCsrfToken(event, body.csrfToken, session)) {
        return json(403, { error: "Invalid CSRF token" });
      }
      const settings = cleanSettings(body);
      await db("store_data?on_conflict=key", {
        method: "POST",
        body: JSON.stringify({ key: "settings", value: settings }),
        prefer: "resolution=merge-duplicates,return=representation"
      });
      return json(200, { settings });
    }

    return json(404, { error: "Not found" });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    const message = status === 429
      ? "Too many requests"
      : status === 503
        ? "A required service is temporarily unavailable."
        : status === 400 || status === 413
          ? error.message
          : "Server error";
    if (status === 500) {
      // Full detail stays in the server logs; the client only gets a reference id.
      const requestId = crypto.randomUUID();
      console.error("Strawping server error", {
        requestId,
        errorName: typeof error?.name === "string" ? error.name.slice(0, 60) : "Error",
        errorMessage: typeof error?.message === "string" ? error.message.slice(0, 200) : ""
      });
      return json(status, { error: message, requestId });
    }
    return json(status, { error: message });
  }
}
