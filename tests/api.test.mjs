import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { handler } from "../src/server/api.mjs";
import vercelHandler from "../api/router.mjs";

const sessionSecret = "test-session-secret-with-more-than-32-characters";
process.env.SUPABASE_URL = "https://supabase.example";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
const testAdminPassword = "test-admin-password";
const testAdminSalt = Buffer.from("strawping-test-salt");
const testAdminHash = crypto.scryptSync(testAdminPassword, testAdminSalt, 32, {
  N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024
});
const testAdminPasswordHash = `scrypt$16384$8$1$${testAdminSalt.toString("base64")}$${testAdminHash.toString("base64")}`;
process.env.STRAWPING_ADMIN_PASSWORD_HASH = testAdminPasswordHash;
delete process.env.STRAWPING_ADMIN_PASSWORD;
process.env.ADMIN_SESSION_SECRET = sessionSecret;
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.TELEGRAM_CHAT_ID;

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function event(path, method = "GET", body, headers = {}) {
  return {
    httpMethod: method,
    path: `/api${path}`,
    headers,
    body: body === undefined ? null : JSON.stringify(body)
  };
}

const SESSION_ID = "a".repeat(64);

function credentialVersionFor(source) {
  return crypto.createHmac("sha256", sessionSecret).update(`credential-version:${source}`).digest("hex").slice(0, 24);
}

function sessionHeaders(session, extra = {}) {
  return { cookie: `__Host-strawping_admin=${session.token}`, ...extra };
}

function signedSession({
  csrfToken = "c".repeat(64),
  exp = Math.floor(Date.now() / 1000) + 300,
  sessionId = SESSION_ID,
  overrides = {}
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    typ: "strawping-admin-session",
    iss: "strawping-store",
    aud: "strawping-admin",
    role: "admin",
    v: 1,
    cv: credentialVersionFor(process.env.STRAWPING_ADMIN_PASSWORD_HASH),
    sessionId,
    csrfToken,
    iat: now,
    nbf: now,
    exp,
    ...overrides
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret).update(encoded).digest("base64url");
  return { token: `${encoded}.${signature}`, csrfToken };
}

// Fake fetch that behaves like Supabase for store_sessions and defers the rest.
function withSessionStore(next, { active = true } = {}) {
  return async (url, options = {}) => {
    if (String(url).includes("store_sessions")) {
      return reply(active ? [{ session_id_hash: "x" }] : []);
    }
    return next(url, options);
  };
}

function reply(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("admin endpoints reject requests without a valid signed session", async () => {
  const protectedRequests = [
    event("/orders"),
    event("/orders/order-1", "PATCH", { status: "Completed" }),
    event("/orders/order-1", "DELETE", {}),
    event("/products", "PUT", { products: [] }),
    event("/inventory/adjust", "POST", { productId: "prod-1", stock: 1 }),
    event("/settings", "PUT", {}),
    event("/notify/test", "POST", {})
  ];
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return reply([]);
  };

  for (const request of protectedRequests) {
    const response = await handler(request, { ip: "203.0.113.5" });
    assert.equal(response.statusCode, 401);
    assert.deepEqual(JSON.parse(response.body), { error: "Unauthorized" });
  }
  assert.equal(upstreamCalls, 0);
});

test("admin endpoints reject a forged token even when its payload looks valid", async () => {
  const csrfToken = "x".repeat(64);
  const encoded = Buffer.from(JSON.stringify({
    role: "admin",
    sessionId: "forged",
    csrfToken,
    exp: Math.floor(Date.now() / 1000) + 300
  })).toString("base64url");
  const response = await handler(
    event("/orders", "GET", undefined, { cookie: `__Host-strawping_admin=${encoded}.not-a-valid-signature` }),
    { ip: "203.0.113.5" }
  );
  assert.equal(response.statusCode, 401);
});

test("settings and products are readable through the public storefront API", async () => {
  globalThis.fetch = async url => {
    if (String(url).includes("key=eq.products")) {
      return reply([{ value: [{
        id: "prod-mug",
        name: "Mug",
        category: "<b>Home</b>",
        price: 4.25,
        image: "https://images.example/mug.jpg",
        description: "Cup",
        inStock: true,
        ignoredAdminField: "not returned"
      }] }]);
    }
    if (String(url).includes("key=eq.settings")) {
      return reply([{ value: { storeName: "Strawping", currency: "$", secret: "not returned" } }]);
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  const products = await handler(event("/products"));
  assert.equal(products.statusCode, 200);
  assert.deepEqual(JSON.parse(products.body).products, [{
    id: "prod-mug",
    name: "Mug",
    category: "<b>Home</b>",
    price: 4.25,
    image: "https://images.example/mug.jpg",
    images: ["https://images.example/mug.jpg"],
    thumbnail: "https://images.example/mug.jpg",
    description: "Cup",
    inStock: true,
    stock: 0
  }]);

  const settings = await handler(event("/settings"));
  assert.equal(settings.statusCode, 200);
  assert.deepEqual(JSON.parse(settings.body).settings, {
    storeName: "Strawping",
    tagline: "Thoughtfully crafted lifestyle essentials and aesthetic goods.",
    announcement: "✨ Free express doorstep delivery on all orders!",
    announcementActive: true,
    currency: "$",
    contactTelegram: "@didaoeng"
  });
});

test("CSRF validation requires the token from a verified session and matching header", async () => {
  const session = signedSession();
  const request = event(
    "/settings",
    "PUT",
    { csrfToken: session.csrfToken, storeName: "Changed" },
    {
      cookie: `__Host-strawping_admin=${session.token}`,
      "x-csrf-token": "wrong-token"
    }
  );
  globalThis.fetch = withSessionStore(async () => reply([]));
  const response = await handler(request);
  assert.equal(response.statusCode, 403);
});

test("product image uploads require an authenticated session and matching CSRF token", async () => {
  let storageUploads = 0;
  globalThis.fetch = async url => {
    if (String(url).includes("store_sessions?session_id_hash=")) return reply([{ session_id_hash: "x" }]);
    if (String(url).includes("/storage/v1/object/")) storageUploads += 1;
    return reply({});
  };

  const unauthorized = await handler(event("/images/upload", "POST", {
    image: "data:image/jpeg;base64,/9j/AA=="
  }));
  assert.equal(unauthorized.statusCode, 401);

  const session = signedSession();
  const badCsrf = await handler(event(
    "/images/upload",
    "POST",
    { image: "data:image/jpeg;base64,/9j/AA==", csrfToken: session.csrfToken },
    {
      cookie: `__Host-strawping_admin=${session.token}`,
      "x-csrf-token": "wrong-token"
    }
  ));
  assert.equal(badCsrf.statusCode, 403);
  assert.equal(storageUploads, 0);
});

test("authenticated product image uploads store a bounded JPEG and return its public URL", async () => {
  const session = signedSession();
  const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02, 0xff, 0xd9]);
  let stored;
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.includes("store_sessions?session_id_hash=")) {
      return reply([{ session_id_hash: "x" }]);
    }
    if (requestUrl.includes("/storage/v1/object/product-images/")) {
      stored = { url: requestUrl, options };
      return reply({ Key: requestUrl });
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  };

  const response = await handler(event(
    "/images/upload",
    "POST",
    { image: `data:image/jpeg;base64,${imageBytes.toString("base64")}`, csrfToken: session.csrfToken },
    {
      cookie: `__Host-strawping_admin=${session.token}`,
      "x-csrf-token": session.csrfToken
    }
  ));

  assert.equal(response.statusCode, 201);
  const result = JSON.parse(response.body);
  assert.match(result.url, /^https:\/\/supabase\.example\/storage\/v1\/object\/public\/product-images\/[0-9a-f-]+\.jpg$/);
  assert.equal(stored.options.method, "POST");
  assert.equal(stored.options.headers["content-type"], "image/jpeg");
  assert.deepEqual(Buffer.from(stored.options.body), imageBytes);
});

test("product image upload rejects non-JPEG content and oversized files", async () => {
  const session = signedSession();
  let storageUploads = 0;
  globalThis.fetch = async url => {
    if (String(url).includes("store_sessions?session_id_hash=")) return reply([{ session_id_hash: "x" }]);
    if (String(url).includes("/storage/v1/object/")) storageUploads += 1;
    return reply({});
  };
  const headers = {
    cookie: `__Host-strawping_admin=${session.token}`,
    "x-csrf-token": session.csrfToken
  };

  const invalid = await handler(event(
    "/images/upload",
    "POST",
    { image: `data:image/jpeg;base64,${Buffer.from("not-jpeg").toString("base64")}`, csrfToken: session.csrfToken },
    headers
  ));
  assert.equal(invalid.statusCode, 400);

  const oversizedBytes = Buffer.alloc(1_500_001);
  oversizedBytes[0] = 0xff;
  oversizedBytes[1] = 0xd8;
  oversizedBytes[2] = 0xff;
  const oversized = await handler(event(
    "/images/upload",
    "POST",
    { image: `data:image/jpeg;base64,${oversizedBytes.toString("base64")}`, csrfToken: session.csrfToken },
    headers
  ));
  assert.equal(oversized.statusCode, 400);
  assert.equal(storageUploads, 0);
});

test("a valid signed admin session can update settings with its CSRF token", async () => {
  const session = signedSession();
  let written;
  globalThis.fetch = withSessionStore(async (url, options = {}) => {
    assert.match(String(url), /rest\/v1\/store_data\?on_conflict=key$/);
    written = JSON.parse(options.body);
    return reply([{ key: "settings", value: written.value }]);
  });

  const response = await handler(event(
    "/settings",
    "PUT",
    { csrfToken: session.csrfToken, storeName: "New Store", currency: "$" },
    {
      cookie: `__Host-strawping_admin=${session.token}`,
      "x-csrf-token": session.csrfToken
    }
  ));

  assert.equal(response.statusCode, 200);
  assert.equal(written.key, "settings");
  assert.equal(JSON.parse(response.body).settings.storeName, "New Store");
});

test("admin inventory adjustments require CSRF and call the transactional database function", async () => {
  const session = signedSession();
  let rpcArgs;
  globalThis.fetch = withSessionStore(async (url, options = {}) => {
    assert.match(String(url), /rpc\/admin_adjust_inventory$/);
    rpcArgs = JSON.parse(options.body);
    return reply({ productId: "prod-mug", variantId: null, stock: 8, inStock: false });
  });
  const headers = sessionHeaders(session, { "x-csrf-token": session.csrfToken });
  const response = await handler(event("/inventory/adjust", "POST", {
    csrfToken: session.csrfToken,
    productId: "prod-mug",
    stock: 8,
    inStock: false
  }, headers));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(rpcArgs, {
    p_product_id: "prod-mug",
    p_variant_id: null,
    p_stock: 8,
    p_in_stock: false
  });

  const rejected = await handler(event("/inventory/adjust", "POST", {
    csrfToken: session.csrfToken,
    productId: "prod-mug",
    stock: -1
  }, headers));
  assert.equal(rejected.statusCode, 400);
});

test("login calls the rate limiter with the SQL function's argument names", async () => {
  let rpcBody;
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /rpc\/consume_rate_limit$/);
    // The first call is the per-IP limit; a second, account-wide limit follows it.
    rpcBody ??= JSON.parse(options.body);
    return reply(true);
  };

  const response = await handler(
    event("/auth/login", "POST", { password: "wrong-password" }),
    { ip: "203.0.113.8" }
  );
  assert.equal(response.statusCode, 401);
  assert.deepEqual(Object.keys(rpcBody).sort(), ["p_key", "p_limit", "p_window_seconds"]);
  assert.equal(rpcBody.p_limit, 8);
  assert.equal(rpcBody.p_window_seconds, 900);
});

test("rate-limiter failures log safe diagnostics but keep the public error generic", async () => {
  const originalConsoleError = console.error;
  const capturedLogs = [];
  console.error = (...args) => capturedLogs.push(args);
  globalThis.fetch = async url => {
    assert.match(String(url), /rpc\/consume_rate_limit$/);
    return new Response(JSON.stringify({
      code: "PGRST202",
      message: "Could not find the function in the schema cache"
    }), { status: 404, headers: { "content-type": "application/json" } });
  };

  try {
    const response = await handler(
      event("/auth/login", "POST", { password: "wrong-password" }),
      { ip: "203.0.113.9" }
    );
    assert.equal(response.statusCode, 503);
    assert.deepEqual(JSON.parse(response.body), {
      error: "A required service is temporarily unavailable."
    });
    const logText = JSON.stringify(capturedLogs);
    assert.match(logText, /PGRST202/);
    assert.doesNotMatch(logText, /test-service-role-key/);
  } finally {
    console.error = originalConsoleError;
  }
});

test("order totals and item details are derived from the server catalog", async () => {
  let savedOrder;
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/rpc/consume_rate_limit")) return reply(true);
    if (requestUrl.includes("key=eq.products")) {
      return reply([{ value: [{
        id: "prod-mug",
        name: "Mug",
        category: "Home",
        price: 3.5,
        image: "",
        description: "",
        inStock: true,
        stock: 10
      }] }]);
    }
    if (requestUrl.endsWith("/rest/v1/rpc/place_store_order") && options.method === "POST") {
      savedOrder = JSON.parse(options.body).p_order;
      return reply(savedOrder);
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  };

  const response = await handler(
    event("/orders", "POST", {
      customer: {
        name: "Customer",
        phone: "123456",
        email: "customer@example.com",
        address: "One Street",
        notes: "Please call"
      },
      items: [{ id: "prod-mug", quantity: 2, name: "Forged name", price: 0.01 }],
      total: 0.02
    }),
    { ip: "203.0.113.10" }
  );

  assert.equal(response.statusCode, 201);
  assert.equal(savedOrder.total, 7);
  assert.deepEqual(savedOrder.items, [{
    id: "prod-mug",
    name: "Mug",
    quantity: 2,
    price: 3.5
  }]);
});

test("order creation fails closed when the rate limiter denies the request", async () => {
  globalThis.fetch = async url => {
    assert.match(String(url), /rpc\/consume_rate_limit$/);
    return reply(false);
  };
  const response = await handler(
    event("/orders", "POST", { customer: {}, items: [] }),
    { ip: "203.0.113.11" }
  );
  assert.equal(response.statusCode, 429);
});

test("Vercel adapter forwards /api/products to the shared API handler", async () => {
  globalThis.fetch = async url => {
    assert.match(String(url), /key=eq\.products/);
    return reply([{ value: [{
      id: "prod-mug",
      name: "Mug",
      category: "Home",
      price: 4.25,
      image: "",
      images: [],
      thumbnail: "",
      description: "",
      inStock: true,
      stock: 0
    }] }]);
  };

  const response = await vercelHandler.fetch(new Request(
    "https://strawping.vercel.app/api/router?route=products",
    { headers: { "x-forwarded-for": "203.0.113.5" } }
  ));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    products: [{
      id: "prod-mug",
      name: "Mug",
      category: "Home",
      price: 4.25,
      image: "",
      images: [],
      thumbnail: "",
      description: "",
      inStock: true,
      stock: 0
    }]
  });
});

test("login with the correct password creates a server-side session and a hardened token", async () => {
  let storedSession;
  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/rpc/consume_rate_limit")) return reply(true);
    if (requestUrl.endsWith("/rest/v1/store_sessions") && options.method === "POST") {
      storedSession = JSON.parse(options.body);
      return new Response("", { status: 201 });
    }
    if (requestUrl.includes("store_sessions?expires_at=lt.")) return new Response(null, { status: 204 });
    throw new Error(`Unexpected request: ${requestUrl}`);
  };
  const response = await handler(
    event("/auth/login", "POST", { password: "test-admin-password" }),
    { ip: "203.0.113.20" }
  );
  assert.equal(response.statusCode, 200);
  const result = JSON.parse(response.body);
  assert.equal(result.token, undefined, "the bearer token must not be returned to JavaScript");
  assert.equal(typeof result.csrfToken, "string");
  const cookie = response.headers["set-cookie"];
  assert.match(cookie, /^__Host-strawping_admin=/);
  assert.match(cookie, /; Path=\//);
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /; SameSite=Strict/);
  const token = cookie.match(/^__Host-strawping_admin=([^;]+)/)[1];
  const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
  assert.equal(payload.iss, "strawping-store");
  assert.equal(payload.aud, "strawping-admin");
  assert.ok(payload.iat && payload.nbf && payload.exp > payload.iat);
  assert.match(storedSession.session_id_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(storedSession.session_id_hash, payload.sessionId);
});


test("admin sessions require the HttpOnly cookie transport, not a bearer header", async () => {
  const session = signedSession();
  globalThis.fetch = withSessionStore(async () => reply([{ id: "order-1" }]));
  const response = await handler(
    event("/orders", "GET", undefined, { authorization: `Bearer ${session.token}` })
  );
  assert.equal(response.statusCode, 401);
});

test("the session endpoint returns CSRF state only to a valid cookie session", async () => {
  const session = signedSession();
  globalThis.fetch = withSessionStore(async () => reply([{ session_id_hash: "x" }]));
  const response = await handler(event("/auth/session", "GET", undefined, sessionHeaders(session)));
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).csrfToken, session.csrfToken);
  const unauthorized = await handler(event("/auth/session", "GET"));
  assert.equal(unauthorized.statusCode, 401);
  assert.match(unauthorized.headers["set-cookie"], /Max-Age=0/);
});

test("login fails closed when only the legacy plaintext password is configured", async () => {
  const savedHash = process.env.STRAWPING_ADMIN_PASSWORD_HASH;
  delete process.env.STRAWPING_ADMIN_PASSWORD_HASH;
  process.env.STRAWPING_ADMIN_PASSWORD = "legacy-test-password";
  globalThis.fetch = async url => {
    if (String(url).endsWith("/rpc/consume_rate_limit")) return reply(true);
    throw new Error("A session must not be created without the password hash");
  };
  try {
    const response = await handler(event("/auth/login", "POST", { password: "legacy-test-password" }), { ip: "203.0.113.22" });
    assert.equal(response.statusCode, 500);
    const body = JSON.parse(response.body);
    assert.equal(body.error, "Server error");
    assert.match(body.requestId, /^[0-9a-f-]{36}$/i);
  } finally {
    process.env.STRAWPING_ADMIN_PASSWORD_HASH = savedHash;
    delete process.env.STRAWPING_ADMIN_PASSWORD;
  }
});

test("login works with a salted scrypt hash and rejects a wrong password", async () => {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync("a-long-test-passphrase", salt, 64, { N: 16384, r: 8, p: 1 });
  process.env.STRAWPING_ADMIN_PASSWORD_HASH = `scrypt$16384$8$1$${salt.toString("base64")}$${hash.toString("base64")}`;
  try {
    globalThis.fetch = async (url, options = {}) => {
      const requestUrl = String(url);
      if (requestUrl.endsWith("/rpc/consume_rate_limit")) return reply(true);
      if (requestUrl.includes("store_sessions")) return new Response("", { status: 201 });
      throw new Error(`Unexpected request: ${requestUrl}`);
    };
    const short = await handler(event("/auth/login", "POST", { password: "short" }), { ip: "203.0.113.21" });
    assert.equal(short.statusCode, 401);
    const bad = await handler(event("/auth/login", "POST", { password: "test-admin-password" }), { ip: "203.0.113.21" });
    assert.equal(bad.statusCode, 401);
    const good = await handler(event("/auth/login", "POST", { password: "a-long-test-passphrase" }), { ip: "203.0.113.21" });
    assert.equal(good.statusCode, 200);
  } finally {
    process.env.STRAWPING_ADMIN_PASSWORD_HASH = testAdminPasswordHash;
  }
});

test("a revoked or unknown session is rejected even with a valid signature", async () => {
  const session = signedSession();
  globalThis.fetch = withSessionStore(async () => reply([]), { active: false });
  const response = await handler(
    event("/orders", "GET", undefined, { cookie: `__Host-strawping_admin=${session.token}` })
  );
  assert.equal(response.statusCode, 401);
});

test("session verification fails closed when the session store is down", async () => {
  const session = signedSession();
  globalThis.fetch = async () => new Response("{}", { status: 500 });
  const response = await handler(
    event("/orders", "GET", undefined, { cookie: `__Host-strawping_admin=${session.token}` })
  );
  assert.equal(response.statusCode, 500);
});

test("old-format tokens and tokens from before a password change are rejected", async () => {
  globalThis.fetch = withSessionStore(async () => reply([]));
  const legacy = signedSession({ overrides: { typ: undefined, iss: undefined, aud: undefined } });
  const stale = signedSession({ overrides: { cv: "0".repeat(24) } });
  for (const session of [legacy, stale]) {
    const response = await handler(
      event("/orders", "GET", undefined, { cookie: `__Host-strawping_admin=${session.token}` })
    );
    assert.equal(response.statusCode, 401);
  }
});

test("logout revokes the session on the server", async () => {
  const session = signedSession();
  let revoked = false;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("store_sessions") && options.method === "PATCH") {
      revoked = Boolean(JSON.parse(options.body).revoked_at);
      return new Response(null, { status: 204 });
    }
    if (String(url).includes("store_sessions")) return reply([{ session_id_hash: "x" }]);
    throw new Error(`Unexpected request: ${url}`);
  };
  const response = await handler(
    event("/auth/logout", "POST", { csrfToken: session.csrfToken }, sessionHeaders(session, {
      "x-csrf-token": session.csrfToken
    }))
  );
  assert.match(response.headers["set-cookie"], /Max-Age=0/);
  assert.equal(response.statusCode, 200);
  assert.equal(revoked, true);
});

test("order ids are validated before they reach the database path", async () => {
  const session = signedSession();
  globalThis.fetch = withSessionStore(async () => {
    throw new Error("database must not be reached for an invalid order id");
  });
  const headers = { cookie: `__Host-strawping_admin=${session.token}`, "x-csrf-token": session.csrfToken };
  const patch = await handler(
    event("/orders/" + encodeURIComponent("x&select=*"), "PATCH", { csrfToken: session.csrfToken, status: "Shipped" }, headers)
  );
  assert.equal(patch.statusCode, 400);
  const del = await handler(
    event("/orders/" + encodeURIComponent("a,b)"), "DELETE", { csrfToken: session.csrfToken }, headers)
  );
  assert.equal(del.statusCode, 400);
  const malformed = await handler(event("/orders/%E0%A4%A", "GET"));
  assert.equal(malformed.statusCode, 400);
});

test("API responses carry defense-in-depth security headers", async () => {
  const response = await handler(event("/status"));
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.match(response.headers["strict-transport-security"], /max-age=\d+/);
  assert.match(response.headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.ok(response.headers["permissions-policy"]);
});

test("unexpected server errors return a request id and no internals", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  globalThis.fetch = async () => new Response("{}", { status: 500 });
  try {
    const response = await handler(event("/products"));
    const body = JSON.parse(response.body);
    assert.equal(response.statusCode, 500);
    assert.equal(body.error, "Server error");
    assert.match(body.requestId, /^[0-9a-f-]{36}$/);
  } finally {
    console.error = originalConsoleError;
  }
});

// ---- Product variants -------------------------------------------------------
const VARIANT_TEE = {
  id: "prod-tee",
  name: "Tee",
  category: "Apparel",
  price: 10,
  image: "",
  description: "",
  inStock: true,
  hasVariants: true,
  variants: [
    { id: "var-m-red", size: "M", color: "Red", type: "", stock: 5, priceAdjustment: 0 },
    { id: "var-l-red", size: "L", color: "Red", type: "", stock: 1, priceAdjustment: 2.5 },
    { id: "var-l-blue", size: "L", color: "Blue", type: "", stock: 0, priceAdjustment: 0 }
  ]
};

const ORDER_CUSTOMER = {
  name: "Customer",
  phone: "123456",
  email: "customer@example.com",
  address: "One Street",
  notes: ""
};

function orderFetch(catalog, onSave = () => {}) {
  return async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/rpc/consume_rate_limit")) return reply(true);
    if (requestUrl.includes("key=eq.products")) return reply([{ value: catalog }]);
    if (requestUrl.endsWith("/rest/v1/rpc/place_store_order") && options.method === "POST") {
      const saved = JSON.parse(options.body).p_order;
      onSave(saved);
      return reply(saved);
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  };
}

async function placeOrder(items) {
  return handler(event("/orders", "POST", { customer: ORDER_CUSTOMER, items }), { ip: "203.0.113.20" });
}

test("product image fallbacks must use credential-free HTTPS URLs", async () => {
  globalThis.fetch = async () => reply([{ value: [
    { id: "bad-image", name: "Bad image", category: "General", price: 1, image: "javascript:blocked", images: [], inStock: true },
    { id: "bad-thumbnail", name: "Bad thumbnail", category: "General", price: 1, images: [], thumbnail: "data:image/svg+xml,blocked", inStock: true },
    { id: "good-image", name: "Good image", category: "General", price: 1, image: "https://cdn.example/item.jpg", images: [], inStock: true }
  ] }]);
  const response = await handler(event("/products"));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body).products.map(product => product.id), ["good-image"]);
});

test("the public products API returns variants and hides products with broken variants", async () => {
  globalThis.fetch = orderFetch([
    VARIANT_TEE,
    { ...VARIANT_TEE, id: "prod-broken", variants: [] },
    { ...VARIANT_TEE, id: "prod-dupe", variants: [VARIANT_TEE.variants[0], { ...VARIANT_TEE.variants[0], id: "var-other" }] },
    { id: "prod-mug", name: "Mug", category: "Home", price: 3, image: "", description: "", inStock: true, stock: 5 }
  ]);
  const response = await handler(event("/products"));
  const products = JSON.parse(response.body).products;
  assert.deepEqual(products.map(product => product.id), ["prod-tee", "prod-mug"]);
  assert.equal(products[0].hasVariants, true);
  assert.equal(products[0].variants.length, 3);
  assert.equal("variants" in products[1], false);
});

test("admins can save a product with variants and the server rejects mixed variant columns", async () => {
  const session = signedSession();
  let written;
  globalThis.fetch = withSessionStore(async (url, options = {}) => {
    const requestUrl = String(url);
    if (requestUrl.endsWith("/rpc/admin_save_products")) {
      written = { value: JSON.parse(options.body).p_products };
      return reply(written.value);
    }
    throw new Error(`Unexpected request: ${requestUrl}`);
  });
  const headers = { cookie: `__Host-strawping_admin=${session.token}`, "x-csrf-token": session.csrfToken };

  const ok = await handler(event("/products", "PUT", { csrfToken: session.csrfToken, products: [VARIANT_TEE] }, headers));
  assert.equal(ok.statusCode, 200);
  assert.equal(written.value[0].variants[1].priceAdjustment, 2.5);

  // "color" is filled for one variant but empty for another.
  const mixed = { ...VARIANT_TEE, variants: [VARIANT_TEE.variants[0], { ...VARIANT_TEE.variants[1], color: "" }] };
  const bad = await handler(event("/products", "PUT", { csrfToken: session.csrfToken, products: [mixed] }, headers));
  assert.equal(bad.statusCode, 400);

  // Turning variants off stores a plain product.
  const plain = { ...VARIANT_TEE, hasVariants: false, variants: [] };
  const off = await handler(event("/products", "PUT", { csrfToken: session.csrfToken, products: [plain] }, headers));
  assert.equal(off.statusCode, 200);
  assert.equal("variants" in written.value[0], false);
});

test("orders for variant products need a valid in-stock variant and use the server price", async () => {
  let saved;
  globalThis.fetch = orderFetch([VARIANT_TEE], order => { saved = order; });

  const missing = await placeOrder([{ id: "prod-tee", quantity: 1 }]);
  assert.equal(missing.statusCode, 400);

  const fake = await placeOrder([{ id: "prod-tee", variantId: "var-nope", quantity: 1 }]);
  assert.equal(fake.statusCode, 400);

  const soldOut = await placeOrder([{ id: "prod-tee", variantId: "var-l-blue", quantity: 1 }]);
  assert.equal(soldOut.statusCode, 409);

  const tooMany = await placeOrder([{ id: "prod-tee", variantId: "var-l-red", quantity: 2 }]);
  assert.equal(tooMany.statusCode, 409);

  const good = await placeOrder([
    { id: "prod-tee", variantId: "var-l-red", quantity: 1, price: 0.01 },
    { id: "prod-tee", variantId: "var-m-red", quantity: 2 }
  ]);
  assert.equal(good.statusCode, 201);
  assert.equal(saved.total, 32.5);
  assert.deepEqual(saved.items[0], {
    id: "prod-tee", name: "Tee", quantity: 1, price: 12.5, variantId: "var-l-red", variantLabel: "L / Red"
  });

  const repeated = await placeOrder([
    { id: "prod-tee", variantId: "var-m-red", quantity: 1 },
    { id: "prod-tee", variantId: "var-m-red", quantity: 1 }
  ]);
  assert.equal(repeated.statusCode, 400);
});

test("a variant id is rejected for a product that has no variants", async () => {
  globalThis.fetch = orderFetch([
    { id: "prod-mug", name: "Mug", category: "Home", price: 3, image: "", description: "", inStock: true, stock: 5 }
  ]);
  const response = await placeOrder([{ id: "prod-mug", variantId: "var-x", quantity: 1 }]);
  assert.equal(response.statusCode, 400);
});
