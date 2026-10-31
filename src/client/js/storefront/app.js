// Escape untrusted text before interpolating it into storefront HTML templates (prevents XSS in customer-facing pages).
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function safeImageUrl(value, fallback = "") {
  try { const u = new URL(String(value || fallback), window.location.origin); return ["http:","https:"].includes(u.protocol) ? u.href : fallback; }
  catch { return fallback; }
}
// A product's own photo URL, or "" — an empty value would otherwise resolve to the page URL.
function productImage(product) {
  return product ? safeImageUrl(product.thumbnail || product.image || product.images?.[0] || "") : "";
}
function productImages(product) {
  const values = Array.isArray(product?.images) ? product.images : [product?.image];
  const list = [...new Set(values.filter(Boolean).map(url => safeImageUrl(url)).filter(Boolean))];
  return list.length ? list : [FALLBACK_IMAGE];
}

// Inline stroke icons (same set as the storefront markup) so no icon CDN is needed.
const ICON_PATHS = {
  arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>',
  minus: '<path d="M6 12h12"/>',
  plus: '<path d="M12 6v12M6 12h12"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
};
function icon(name, size = 18, fill = "none") {
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ""}</svg>`;
}
const SPINNER = '<span class="spinner" aria-hidden="true"></span>';
const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=80";

// Fetch store settings for Telegram handle
async function fetchStoreSettings() {
  try {
    const response = await fetch('/api/settings');
    if (!response.ok) throw new Error('Failed to fetch settings');
    return await response.json();
  } catch (error) {
    console.error('Error fetching store settings:', error);
    return { contactTelegram: '@didaoeng' }; // Fallback
  }
}

// Update Telegram link in footer
function updateTelegramLink() {
  const settings = StoreDB.getSettings(); // Assume StoreDB is initialized
  const handle = settings.contactTelegram?.replace(/^@/, '') || 'didaoeng';
  const isValid = /^[A-Za-z0-9_]{5,32}$/.test(handle);
  const telegramLink = document.getElementById('telegram-link');
  if (isValid) {
    telegramLink.href = `https://t.me/${handle}`;
    telegramLink.hidden = false;
  } else {
    telegramLink.hidden = true;
  }
}

// ==========================================
// STOREFRONT CLIENT APPLICATION (app.js)
// Editorial storefront + live location detection
// ==========================================

let cart = [];
let activeCategory = "All";
let searchQuery = "";
let inStockOnly = false;
let sortOrder = "featured";
let wishlist = loadWishlist();
let toastTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  // Bind checkout and location controls immediately. Store sync should not prevent
  // the browser permission prompt from being wired up if the API is slow or fails.
  setupEventListeners();
  setupOverlays();
  setupLocationDetector();
  setupStorefrontActionDelegation(); // event delegation for data-action buttons
  setupProductDetail();
  try {
    await initStore();
  } catch (err) {
    console.error("Store initialization failed:", err);
    // Keep checkout/location interactions available even if loading store data fails.
    try { renderStoreInfo(); renderCategories(); renderProducts(); renderHeroSpotlight(); updateCartUI(); } catch (renderErr) {
      console.error("Fallback store rendering failed:", renderErr);
    }
  }
});

// Sync-status banner shown at the top of the storefront when the server sync fails.
function renderSyncBanner(ok,error){
  let banner=document.getElementById("strawping-sync-banner");
  if(!ok){
    if(!banner){
      banner=document.createElement("div");
      banner.id="strawping-sync-banner";
      banner.className="sync-banner";
      document.body.insertBefore(banner,document.body.firstChild);
    }
    banner.textContent="Catalog temporarily offline — showing cached items if available.";
    banner.style.display="";
    return;
  }
  if(banner) banner.style.display="none";
}

// Initialize and render the store (syncs with server disk / cloud if configured)
async function initStore() {
  // Sync live products from Server API or Supabase Cloud
  const sync=await StoreDB.syncData();
  renderSyncBanner(sync.ok,sync.error);

  renderStoreInfo();
  renderCategories();
  // Render server-fetched catalog as source of truth; fall back to browser cache when offline.
  renderProducts(sync.ok&&Array.isArray(sync.products)?sync.products:null);
  renderHeroSpotlight(sync.ok&&Array.isArray(sync.products)?sync.products:null);
  updateCartUI();
}

// Re-sync when the tab regains focus so the catalog stays current across sessions.
window.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible"){StoreDB.syncData().then(s=>renderSyncBanner(s.ok,s.error)).catch(()=>{});}
});

// Render dynamic store branding & settings
function renderStoreInfo() {
  const settings = StoreDB.getSettings();

  // Store titles & taglines
  document.title = `${settings.storeName} - Aesthetic Goods & Essentials`;
  const navTitle = document.getElementById("store-nav-title");
  if (navTitle) navTitle.textContent = settings.storeName;
  document.querySelectorAll("[data-store-name]").forEach(el => { el.textContent = settings.storeName; });

  const heroTagline = document.getElementById("hero-tagline");
  if (heroTagline) heroTagline.textContent = settings.tagline;

  const copyrightYear = document.getElementById("copyright-year");
  if (copyrightYear) copyrightYear.textContent = String(new Date().getFullYear());

  // Footer contact link always points to the store's Telegram.
  const telegramLink = document.getElementById("footer-telegram");
  if (telegramLink) {
    telegramLink.href = "https://t.me/didaoeng";
    telegramLink.hidden = false;
  }

  // Announcement Bar
  const announcementBar = document.getElementById("announcement-bar");
  const announcementText = document.getElementById("announcement-text");
  if (announcementBar && announcementText) {
    if (settings.announcementActive && settings.announcement) {
      announcementText.textContent = settings.announcement;
      announcementBar.classList.remove("hidden");
    } else {
      announcementBar.classList.add("hidden");
    }
  }
}

// Render category filter pills, navigation links, category tiles and search suggestions
function renderCategories() {
  const products = StoreDB.getProducts();
  const categoryNames = [...new Set(products.map(p => p.category).filter(Boolean))];
  const categories = ["All", ...categoryNames];
  const pillsContainer = document.getElementById("category-pills");

  if (pillsContainer) {
    pillsContainer.innerHTML = categories.map(cat => `
      <button
        class="cat-pill ${activeCategory === cat ? 'active' : ''}"
        data-category="${escapeHtml(cat)}"
        type="button"
        aria-pressed="${activeCategory === cat}"
      >${escapeHtml(cat === 'All' ? 'All items' : cat)}</button>
    `).join("");

    // Attach click events
    pillsContainer.querySelectorAll(".cat-pill").forEach(button => {
      button.addEventListener("click", () => {
        activeCategory = button.getAttribute("data-category");
        renderCategories();
        renderProducts();
      });
    });
  }

  // Desktop + mobile navigation mirror the catalog's categories.
  const navCategories = categoryNames.slice(0, 5);
  const desktopLinks = document.getElementById("desktop-links");
  if (desktopLinks) {
    desktopLinks.innerHTML = [
      `<button type="button" data-filter-category="All">Shop all</button>`,
      ...navCategories.map(cat => `<button type="button" data-filter-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`),
      `<a href="#story">Our story</a>`
    ].join("");
  }
  const mobileLinks = document.getElementById("mobile-menu-links");
  if (mobileLinks) {
    mobileLinks.innerHTML = [
      `<button type="button" data-filter-category="All">Shop all</button>`,
      ...categoryNames.map(cat => `<button type="button" data-filter-category="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`),
      `<a href="#story" data-close-menu>Our story</a>`
    ].join("");
  }

  // "Shop by category" tiles use the first product image found in each category.
  const tilesSection = document.getElementById("categories");
  const tiles = document.getElementById("category-tiles");
  const footerCategoriesLink = document.getElementById("footer-categories-link");
  if (tilesSection && tiles) {
    tilesSection.hidden = categoryNames.length === 0;
    if (footerCategoriesLink) footerCategoriesLink.hidden = categoryNames.length === 0;
    tiles.innerHTML = categoryNames.map(cat => {
      const image = productImage(products.find(p => p.category === cat && productImage(p)));
      return `
        <button type="button" class="category-tile" data-filter-category="${escapeHtml(cat)}">
          <span class="category-tile-media">
            ${image
              ? `<img src="${escapeHtml(image)}" alt="" loading="lazy">`
              : `<span class="display category-tile-initial" aria-hidden="true">${escapeHtml(cat.charAt(0))}</span>`}
          </span>
          <span class="category-tile-name">${escapeHtml(cat)}${icon("arrow", 16)}</span>
        </button>
      `;
    }).join("");
  }

  const suggestions = document.getElementById("search-suggestions");
  if (suggestions) {
    suggestions.innerHTML = categoryNames.length
      ? `Popular: ${categoryNames.slice(0, 4).map(cat => `<button type="button" data-search-term="${escapeHtml(cat)}">${escapeHtml(cat.toLowerCase())}</button>`).join(", ")}`
      : "Search by product name or description";
  }
}

// Filter and render product catalog. Pass productsOverride to render server-fetched data directly.
function renderProducts(productsOverride) {
  const settings = StoreDB.getSettings();
  const currency = settings.currency || "$";
  const allProducts = Array.isArray(productsOverride)?productsOverride:StoreDB.getProducts();
  const grid = document.getElementById("products-grid");
  const emptyState = document.getElementById("empty-state");
  const countLabel = document.getElementById("product-count-label");

  // Filtering
  const filtered = allProducts.filter(p => {
    const matchesCat = activeCategory === "All" || p.category === activeCategory;
    const matchesSearch = !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStock = !inStockOnly || isProductAvailable(p);
    return matchesCat && matchesSearch && matchesStock;
  });
  if (sortOrder === "price-asc") filtered.sort((a, b) => Number(a.price) - Number(b.price));
  if (sortOrder === "price-desc") filtered.sort((a, b) => Number(b.price) - Number(a.price));

  if (countLabel) {
    countLabel.textContent = `${filtered.length} of ${allProducts.length} items`;
  }
  updateSearchChip();
  updateSearchResultsButton(filtered.length);

  if (filtered.length === 0) {
    grid.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  grid.innerHTML = filtered.map(product => {
    const isOut = !isProductAvailable(product);
    const saved = wishlist.includes(product.id);
    return `
      <article class="product-card ${isOut ? 'is-sold-out' : ''}" data-product-id="${escapeHtml(product.id)}">
        <div class="product-media">
          <img
            src="${escapeHtml(productImage(product) || FALLBACK_IMAGE)}"
            alt="${escapeHtml(product.name)}"
            class="product-image"
            loading="lazy"
          />
          <span class="product-tag ${isOut ? 'is-out' : ''}">${isOut ? 'Sold out' : 'In stock'}</span>
          <button type="button" class="wishlist-btn ${saved ? 'is-saved' : ''}" data-wishlist-id="${escapeHtml(product.id)}" aria-pressed="${saved}" aria-label="${saved ? 'Remove' : 'Save'} ${escapeHtml(product.name)} ${saved ? 'from' : 'to'} wishlist">
            ${icon("heart", 18, saved ? "currentColor" : "none")}
          </button>
          ${isOut ? '' : `<button data-action="add-to-cart" data-id="${escapeHtml(product.id)}" class="quick-add" type="button" aria-label="Quick add ${escapeHtml(product.name)} to bag">Quick add</button>`}
        </div>
        <div class="product-details">
          <p class="product-category">${escapeHtml(product.category || 'General')}</p>
          <h3 class="product-name" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h3>
          <p class="product-description">${escapeHtml(product.description || 'Thoughtfully chosen for the everyday.')}</p>
          <p class="product-price">${escapeHtml(productPriceText(product, currency))}</p>
          ${productHasVariants(product) && !isOut ? renderVariantPicker(product) : ''}
          <div class="product-actions">
            ${isOut ? `
              <button disabled class="product-soldout" type="button">Sold out</button>
            ` : `
              <button data-action="add-to-cart" data-id="${escapeHtml(product.id)}" class="product-add" type="button" aria-label="Add ${escapeHtml(product.name)} to bag">Add to bag</button>
              <button data-action="quick-buy" data-id="${escapeHtml(product.id)}" class="product-buy" type="button" aria-label="Buy ${escapeHtml(product.name)} now">Buy now ${icon("arrow", 14)}</button>
            `}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

// Feature the first available item without changing the catalog order.
function renderHeroSpotlight(productsOverride) {
  const products = Array.isArray(productsOverride) ? productsOverride : StoreDB.getProducts();
  const product = products.find(item => isProductAvailable(item) && item.image) || products.find(item => isProductAvailable(item));
  const feature = document.getElementById("hero-spotlight");
  const fallback = document.getElementById("hero-default-art");
  const image = document.getElementById("hero-spotlight-image");
  const name = document.getElementById("hero-spotlight-name");
  const category = document.getElementById("hero-spotlight-category");
  const buy = document.getElementById("hero-spotlight-buy");
  renderStoryImage(products, product);
  if (!feature || !fallback) return;
  if (!product) {
    feature.hidden = true;
    fallback.hidden = false;
    if (buy) buy.removeAttribute("data-id");
    return;
  }
  if (image) {
    image.src = safeImageUrl(product.image, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=85');
    image.alt = product.name || "Featured item";
  }
  if (name) name.textContent = product.name || "A little favorite";
  if (category) category.textContent = product.category || "Curated object";
  if (buy) {
    buy.setAttribute("data-id", product.id);
    buy.setAttribute("aria-label", `Shop ${product.name || "featured product"}`);
  }
  fallback.hidden = true;
  feature.hidden = false;
}

// The story panel borrows a second product photo so it doesn't repeat the hero.
function renderStoryImage(products, featured) {
  const image = document.getElementById("story-image");
  const fallback = document.getElementById("story-default-art");
  if (!image || !fallback) return;
  const pick = products.find(item => item !== featured && productImage(item));
  if (!pick) {
    image.hidden = true;
    fallback.hidden = false;
    return;
  }
  image.src = productImage(pick);
  image.alt = pick.name || "";
  image.hidden = false;
  fallback.hidden = true;
}

// === Product detail view: shared-element transition + swipeable gallery ===
let activeDetailProductId = null;
function withViewTransition(callback) {
  if (document.startViewTransition) document.startViewTransition(callback);
  else callback();
}
function openProductDetail(productId, sourceImage) {
  const product = StoreDB.getProducts().find(item => item.id === productId);
  if (!product) return;
  const images = productImages(product);
  const detail = document.getElementById("product-detail-overlay");
  if (!detail) return;
  activeDetailProductId = productId;
  const currency = StoreDB.getSettings().currency || "$";
  const variantControls = productHasVariants(product) ? variantFieldsFor(product).map(([key,label]) => {
    const values = [...new Set(product.variants.map(v => v[key]).filter(Boolean))];
    return `<label class="detail-option">${escapeHtml(label)}<select data-variant-field="${key}" aria-label="Choose ${escapeHtml(label)}"><option value="">Choose ${escapeHtml(label)}</option>${values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("")}</select></label>`;
  }).join("") : "";
  const out = !isProductAvailable(product);
  const main = detail.querySelector(".detail-main-image");
  detail.querySelector(".product-detail-panel").dataset.productId = product.id;
  detail.querySelector(".detail-content").innerHTML = `
    <div class="detail-gallery">
      <div class="detail-image-stage"><button type="button" class="detail-arrow detail-prev" aria-label="Previous image">‹</button><img class="detail-main-image" src="${escapeHtml(images[0])}" alt="${escapeHtml(product.name)}" /><button type="button" class="detail-arrow detail-next" aria-label="Next image">›</button></div>
      <div class="detail-thumbnails">${images.map((url,i)=>`<button type="button" data-gallery-index="${i}" class="${i===0?'is-active':''}" aria-label="View image ${i+1}"><img src="${escapeHtml(url)}" alt="" /></button>`).join("")}</div>
    </div>
    <div class="detail-info"><p class="product-category">${escapeHtml(product.category || "General")}</p><h2>${escapeHtml(product.name)}</h2><p class="detail-price">${escapeHtml(productPriceText(product,currency))}</p><p class="detail-description">${escapeHtml(product.description || "")}</p>
      <div class="detail-variants">${variantControls}</div><p class="variant-error" data-variant-error hidden></p>
      ${out ? '<button class="product-soldout" disabled>Sold out</button>' : `<button type="button" class="btn-solid detail-add" data-action="add-to-cart" data-id="${escapeHtml(product.id)}">Add to bag</button><button type="button" class="detail-buy" data-action="quick-buy" data-id="${escapeHtml(product.id)}">Buy now</button>`}
    </div>`;
  const image = detail.querySelector(".detail-main-image");
  const source = sourceImage || document.querySelector(`.product-card[data-product-id="${CSS.escape(product.id)}"] .product-image`);
  if (source) source.style.viewTransitionName = "product-shared-image";
  image.style.viewTransitionName = "";
  detail.hidden = false;
  document.body.classList.add("detail-open");
  withViewTransition(() => {
    if (source) source.style.viewTransitionName = "none";
    image.style.viewTransitionName = "product-shared-image";
    detail.classList.add("is-open");
  });
  let index = 0;
  const setImage = next => {
    index = (next + images.length) % images.length;
    image.src = images[index];
    detail.querySelectorAll("[data-gallery-index]").forEach((button,i)=>button.classList.toggle("is-active",i===index));
  };
  detail.querySelector(".detail-prev").onclick = () => setImage(index - 1);
  detail.querySelector(".detail-next").onclick = () => setImage(index + 1);
  detail.querySelector(".detail-thumbnails").onclick = e => { const b=e.target.closest("[data-gallery-index]"); if(b) setImage(Number(b.dataset.galleryIndex)); };
  const stage = detail.querySelector(".detail-image-stage");
  let touchX = 0;
  stage.ontouchstart = e => { touchX = e.changedTouches[0].clientX; };
  stage.ontouchend = e => { const dx=e.changedTouches[0].clientX-touchX; if(Math.abs(dx)>35) setImage(index+(dx<0?1:-1)); };
  detail.querySelector(".detail-close").focus();
}
function closeProductDetail() {
  const detail = document.getElementById("product-detail-overlay");
  if (!detail || detail.hidden) return;
  withViewTransition(() => detail.classList.remove("is-open"));
  const finishClose = () => {
    detail.hidden = true;
    document.body.classList.remove("detail-open");
    activeDetailProductId = null;
    document.querySelectorAll('.product-image').forEach(img => img.style.viewTransitionName = "");
  };
  detail.addEventListener("transitionend", function onEnd(event) {
    if (event.target !== detail || event.propertyName !== "opacity") return;
    detail.removeEventListener("transitionend", onEnd);
    finishClose();
  });
  // Reduced-motion browsers may skip the opacity transition entirely.
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) finishClose();
}
function setupProductDetail() {
  if (document.getElementById("product-detail-overlay")) return;
  const overlay = document.createElement("section");
  overlay.id = "product-detail-overlay"; overlay.className = "product-detail-overlay"; overlay.hidden = true;
  overlay.innerHTML = `<div class="product-detail-panel product-card"><button type="button" class="detail-close" aria-label="Close product details">×</button><div class="detail-content"></div></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector(".detail-close").addEventListener("click", closeProductDetail);
  overlay.addEventListener("click", e => { if(e.target===overlay) closeProductDetail(); });
  document.addEventListener("keydown", e => { if(e.key==="Escape") closeProductDetail(); });
}

// === WISHLIST (saved on this device only) ===
function loadWishlist() {
  try { const saved = JSON.parse(localStorage.getItem("strawping_wishlist") || "[]"); return Array.isArray(saved) ? saved.filter(id => typeof id === "string") : []; }
  catch { return []; }
}

function toggleWishlist(productId) {
  const saved = wishlist.includes(productId);
  wishlist = saved ? wishlist.filter(id => id !== productId) : [...wishlist, productId];
  try { localStorage.setItem("strawping_wishlist", JSON.stringify(wishlist)); } catch {}
  renderProducts();
  showToast(saved ? "Removed from your wishlist" : "Saved to your wishlist");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

// === PRODUCT VARIANTS (sizes / colors / types) ===
const VARIANT_FIELDS = [["size", "Size"], ["color", "Color"], ["type", "Type"]];

function productHasVariants(product) {
  return Boolean(product && product.hasVariants && Array.isArray(product.variants) && product.variants.length);
}

// A variant product is only "available" if the admin left it in stock AND at least one variant has stock.
function isProductAvailable(product) {
  if (!product || !product.inStock) return false;
  return productHasVariants(product) ? product.variants.some(v => Number(v.stock) > 0) : true;
}

function variantLabel(variant) {
  return VARIANT_FIELDS.map(([key]) => variant[key]).filter(Boolean).join(" / ");
}

function variantFieldsFor(product) {
  return VARIANT_FIELDS.filter(([key]) => product.variants.some(v => v[key]));
}

function variantPrice(product, variant) {
  return Number(product.price) + Number(variant?.priceAdjustment || 0);
}

// "$10.00" for one price, "From $10.00" when variants cost different amounts.
function productPriceText(product, currency) {
  if (!productHasVariants(product)) return `${currency}${Number(product.price).toFixed(2)}`;
  const prices = product.variants.map(v => variantPrice(product, v));
  const lowest = Math.min(...prices);
  const prefix = lowest === Math.max(...prices) ? "" : "From ";
  return `${prefix}${currency}${lowest.toFixed(2)}`;
}

function renderVariantPicker(product) {
  const fields = variantFieldsFor(product).map(([key, label]) => {
    const values = [...new Set(product.variants.map(v => v[key]).filter(Boolean))];
    return `
      <label class="variant-field">
        <span class="variant-label">${escapeHtml(label)}</span>
        <select class="variant-select" data-variant-field="${key}" aria-label="${escapeHtml(label)} for ${escapeHtml(product.name)}">
          <option value="">Choose ${label.toLowerCase()}</option>
          ${values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("")}
        </select>
      </label>`;
  }).join("");
  return `<div class="variant-picker">${fields}<p class="variant-error" data-variant-error role="alert" hidden></p></div>`;
}

function showVariantError(card, message) {
  const box = card?.querySelector("[data-variant-error]");
  if (!box) { alert(message); return; }
  box.textContent = message;
  box.hidden = false;
}

function clearVariantError(card) {
  const box = card?.querySelector("[data-variant-error]");
  if (box) { box.textContent = ""; box.hidden = true; }
}

function readVariantSelection(card, product) {
  const selection = {};
  const missing = [];
  for (const [key, label] of variantFieldsFor(product)) {
    const value = card.querySelector(`[data-variant-field="${key}"]`)?.value || "";
    if (value) selection[key] = value; else missing.push({ key, label: label.toLowerCase() });
  }
  return { selection, missing };
}

function findVariant(product, selection) {
  return product.variants.find(v => variantFieldsFor(product).every(([key]) => v[key] === selection[key])) || null;
}

// Decides which variant the shopper picked. For a normal product it returns { ok: true, variant: null }.
// For a variant product it BLOCKS (ok: false) and shows a message until every option is chosen.
function resolveVariantChoice(product, trigger) {
  if (!productHasVariants(product)) return { ok: true, variant: null };

  const card = trigger?.closest?.(".product-card")
    || document.querySelector(`.product-card[data-product-id="${CSS.escape(product.id)}"]`);
  if (!card) {
    // e.g. the hero button when the product is hidden by the current filter.
    alert(`Please choose a size, color or type for "${product.name}" in the collection below.`);
    scrollToCollection();
    return { ok: false };
  }
  if (!trigger?.closest?.(".product-card")) card.scrollIntoView({ behavior: "smooth", block: "center" });

  const { selection, missing } = readVariantSelection(card, product);
  if (missing.length) {
    showVariantError(card, `Please select a ${missing.map(m => m.label).join(" and ")} first.`);
    card.querySelector(`[data-variant-field="${missing[0].key}"]`)?.focus();
    return { ok: false };
  }
  const variant = findVariant(product, selection);
  if (!variant) {
    showVariantError(card, "That combination isn't available. Please choose different options.");
    return { ok: false };
  }
  if (Number(variant.stock) <= 0) {
    showVariantError(card, "Sorry, that option is sold out.");
    return { ok: false };
  }
  clearVariantError(card);
  return { ok: true, variant, card };
}

// Keeps the price on the card in step with the dropdowns.
function handleVariantChange(select) {
  const card = select.closest(".product-card");
  const product = StoreDB.getProducts().find(p => p.id === card?.dataset.productId);
  if (!card || !productHasVariants(product)) return;
  clearVariantError(card);
  const currency = StoreDB.getSettings().currency || "$";
  const { selection, missing } = readVariantSelection(card, product);
  const priceEl = card.querySelector(".product-price, .detail-price");
  const variant = missing.length ? null : findVariant(product, selection);
  if (priceEl) priceEl.textContent = variant ? `${currency}${variantPrice(product, variant).toFixed(2)}` : productPriceText(product, currency);
  if (variant && Number(variant.stock) <= 0) showVariantError(card, "Sorry, that option is sold out.");
}

// === CART LOGIC ===
const cartKey = (productId, variantId) => (variantId ? `${productId}::${variantId}` : productId);

function addToCart(productId, trigger) {
  const products = StoreDB.getProducts();
  const product = products.find(p => p.id === productId);
  if (!product || !isProductAvailable(product)) return false;

  // Variant products: stop here until the shopper has chosen every option.
  const choice = resolveVariantChoice(product, trigger);
  if (!choice.ok) return false;
  const variant = choice.variant;

  const key = cartKey(product.id, variant?.id);
  const existing = cart.find(item => item.key === key);
  const nextQuantity = (existing?.quantity || 0) + 1;
  if (variant && nextQuantity > Number(variant.stock)) {
    showVariantError(choice.card, `Only ${variant.stock} of that option in stock.`);
    return false;
  }

  if (existing) {
    existing.quantity = Math.min(99, nextQuantity);
  } else {
    cart.push({
      key,
      id: product.id,
      variantId: variant ? variant.id : null,
      variantLabel: variant ? variantLabel(variant) : "",
      name: product.name,
      category: product.category,
      price: variantPrice(product, variant),
      image: productImage(product),
      quantity: 1
    });
  }

  updateCartUI();
  openCartDrawer();
  return true;
}

function quickBuy(productId, trigger) {
  if (!addToCart(productId, trigger)) return false;
  closeCartDrawer();
  openCheckoutModal();
  return true;
}

function updateQuantity(key, delta) {
  const item = cart.find(i => i.key === key);
  if (!item) return;

  let max = 99;
  if (item.variantId) {
    const product = StoreDB.getProducts().find(p => p.id === item.id);
    const variant = product?.variants?.find(v => v.id === item.variantId);
    if (variant) max = Math.min(99, Number(variant.stock));
  }
  item.quantity = Math.min(max, item.quantity + delta);
  if (item.quantity <= 0) {
    cart = cart.filter(i => i.key !== key);
  }
  updateCartUI();
}

function removeFromCart(key) {
  cart = cart.filter(i => i.key !== key);
  updateCartUI();
}

function updateCartUI() {
  const settings = StoreDB.getSettings();
  const currency = settings.currency || "$";

  const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Badge counters
  const badge = document.getElementById("cart-badge");
  if (badge) {
    badge.textContent = totalCount;
    badge.hidden = totalCount === 0;
  }
  const cartBtn = document.getElementById("cart-btn");
  if (cartBtn) cartBtn.setAttribute("aria-label", `Open shopping bag with ${totalCount} item${totalCount === 1 ? "" : "s"}`);

  const drawerCount = document.getElementById("drawer-cart-count");
  if (drawerCount) drawerCount.textContent = totalCount;

  // Drawer items
  const container = document.getElementById("cart-items-container");
  const emptyState = document.getElementById("cart-empty-state");
  const cartFooter = document.getElementById("cart-footer");

  if (cart.length === 0) {
    if (container) { container.innerHTML = ""; container.classList.add("hidden"); }
    if (emptyState) emptyState.classList.remove("hidden");
    if (cartFooter) cartFooter.classList.add("hidden");
  } else {
    if (emptyState) emptyState.classList.add("hidden");
    if (cartFooter) cartFooter.classList.remove("hidden");

    if (container) {
      container.classList.remove("hidden");
      container.innerHTML = cart.map(item => `
        <div class="cart-item">
          <img
            src="${escapeHtml(safeImageUrl(item.image, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=200&q=80'))}"
            alt="${escapeHtml(item.name)}"
          />
          <div class="cart-item-body">
            <h4>${escapeHtml(item.name)}</h4>
            <p class="cart-item-meta">${escapeHtml(item.category || 'General')}</p>
            ${item.variantLabel ? `<p class="cart-item-variant">${escapeHtml(item.variantLabel)}</p>` : ''}
            <div class="cart-item-row">
              <div class="qty-control" aria-label="Quantity">
                <button data-action="update-quantity" data-id="${escapeHtml(item.key)}" data-delta="-1" type="button" aria-label="Decrease quantity">${icon("minus", 14)}</button>
                <span>${escapeHtml(item.quantity)}</span>
                <button data-action="update-quantity" data-id="${escapeHtml(item.key)}" data-delta="1" type="button" aria-label="Increase quantity">${icon("plus", 14)}</button>
              </div>
              <span class="cart-item-price">${escapeHtml(currency)}${(Number(item.price) * item.quantity).toFixed(2)}</span>
            </div>
            <button data-action="remove-from-cart" data-id="${escapeHtml(item.key)}" class="cart-item-remove" type="button">Remove</button>
          </div>
        </div>
      `).join("");
    }
  }

  // Totals
  const subtotalEl = document.getElementById("cart-subtotal");
  if (subtotalEl) subtotalEl.textContent = `${currency}${subtotal.toFixed(2)}`;

  const totalEl = document.getElementById("cart-total");
  if (totalEl) totalEl.textContent = `${currency}${subtotal.toFixed(2)}`;

  const modalTotal = document.getElementById("modal-order-total");
  if (modalTotal) modalTotal.textContent = `${currency}${subtotal.toFixed(2)}`;
}

// === DRAWER, MODAL & OVERLAY TOGGLES ===
function syncScrollLock() {
  const open = document.querySelector(".cart-drawer.is-open, .mobile-menu.is-open, .search-overlay.is-open, .checkout-modal:not(.hidden)");
  document.body.classList.toggle("is-locked", Boolean(open));
}

function openCartDrawer() {
  const drawer = document.getElementById("cart-drawer");
  const backdrop = document.getElementById("cart-drawer-backdrop");
  if (drawer && backdrop) {
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    backdrop.classList.add("is-open");
    syncScrollLock();
  }
}

function closeCartDrawer() {
  const drawer = document.getElementById("cart-drawer");
  const backdrop = document.getElementById("cart-drawer-backdrop");
  if (drawer && backdrop) {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    backdrop.classList.remove("is-open");
    syncScrollLock();
  }
}

function openCheckoutModal() {
  if (cart.length === 0) return;
  const modal = document.getElementById("checkout-modal");
  const form = document.getElementById("checkout-form");
  const successState = document.getElementById("order-success-state");

  if (modal) {
    modal.classList.remove("hidden");
    form.classList.remove("hidden");
    successState.classList.add("hidden");
    syncScrollLock();
  }
}

function closeCheckoutModal() {
  const modal = document.getElementById("checkout-modal");
  if (modal) {
    modal.classList.add("hidden");
    syncScrollLock();
  }
}

function setOverlay(id, open) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("is-open", open);
  el.setAttribute("aria-hidden", String(!open));
  if (id === "mobile-menu") document.getElementById("menu-btn")?.setAttribute("aria-expanded", String(open));
  syncScrollLock();
}

function openSearch() {
  setOverlay("search-overlay", true);
  const input = document.getElementById("search-input");
  if (input) setTimeout(() => input.focus(), 60);
}

function scrollToCollection() {
  document.getElementById("collection")?.scrollIntoView({ behavior: "smooth" });
}

// Jump from navigation, tiles or the menu to the filtered collection.
function filterAndScroll(category) {
  activeCategory = category;
  renderCategories();
  renderProducts();
  setOverlay("mobile-menu", false);
  scrollToCollection();
}

function updateSearchChip() {
  const chip = document.getElementById("search-chip");
  const chipText = document.getElementById("search-chip-text");
  if (!chip || !chipText) return;
  chip.hidden = !searchQuery;
  chipText.textContent = searchQuery;
}

function updateSearchResultsButton(count) {
  const btn = document.getElementById("search-results-btn");
  if (btn) btn.textContent = searchQuery ? `View ${count} result${count === 1 ? "" : "s"}` : "View all items";
}

function setupOverlays() {
  document.getElementById("menu-btn")?.addEventListener("click", () => setOverlay("mobile-menu", true));
  document.getElementById("close-menu-btn")?.addEventListener("click", () => setOverlay("mobile-menu", false));
  document.getElementById("search-btn")?.addEventListener("click", openSearch);
  document.getElementById("close-search-btn")?.addEventListener("click", () => setOverlay("search-overlay", false));

  const overlay = document.getElementById("search-overlay");
  overlay?.addEventListener("click", (e) => { if (e.target === overlay) setOverlay("search-overlay", false); });

  const showResults = () => {
    setOverlay("search-overlay", false);
    scrollToCollection();
  };
  document.getElementById("search-results-btn")?.addEventListener("click", showResults);
  document.getElementById("search-form")?.addEventListener("submit", (e) => { e.preventDefault(); showResults(); });

  document.body.addEventListener("click", (e) => {
    const filter = e.target.closest("[data-filter-category]");
    if (filter) { filterAndScroll(filter.getAttribute("data-filter-category")); return; }

    const term = e.target.closest("[data-search-term]");
    if (term) {
      const input = document.getElementById("search-input");
      if (input) input.value = term.getAttribute("data-search-term");
      searchQuery = input ? input.value.trim() : "";
      renderProducts();
      return;
    }

    const wish = e.target.closest("[data-wishlist-id]");
    if (wish) { toggleWishlist(wish.getAttribute("data-wishlist-id")); return; }

    if (e.target.closest("[data-open-cart]")) { openCartDrawer(); return; }
    if (e.target.closest("[data-close-menu]")) setOverlay("mobile-menu", false);
  });

  // Ctrl/⌘+K opens search; Escape closes whichever layer is on top.
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); return; }
    if (e.key !== "Escape") return;
    if (!document.getElementById("checkout-modal")?.classList.contains("hidden")) closeCheckoutModal();
    else if (document.getElementById("search-overlay")?.classList.contains("is-open")) setOverlay("search-overlay", false);
    else if (document.getElementById("cart-drawer")?.classList.contains("is-open")) closeCartDrawer();
    else if (document.getElementById("mobile-menu")?.classList.contains("is-open")) setOverlay("mobile-menu", false);
  });
}

// === REAL LOCATION AUTO-DETECTOR ===
function setLocationStatus(badge, tone, message, asHtml = false) {
  if (!badge) return;
  badge.className = `location-status is-${tone}`;
  if (asHtml) badge.innerHTML = message; else badge.textContent = message;
}

function setupLocationDetector() {
  const btn = document.getElementById("get-location-btn");
  const btnText = document.getElementById("get-location-btn-text");
  const statusBadge = document.getElementById("location-status-badge");
  const addressInput = document.getElementById("order-address");

  if (!btn || !addressInput) return;

  btn.addEventListener("click", () => {
    // Browser geolocation requires HTTPS (or localhost); fail with a useful
    // message instead of silently appearing not to request permission.
    if (!window.isSecureContext) {
      setLocationStatus(statusBadge, "error", "Location permission requires a secure HTTPS connection. Open the live HTTPS store, or enter your address manually.");
      return;
    }

    if (!navigator.geolocation) {
      setLocationStatus(statusBadge, "error", "Geolocation is not supported by your browser. Please enter your address manually.");
      return;
    }

    btn.disabled = true;
    btnText.innerHTML = `${SPINNER}<span>Detecting your location…</span>`;
    setLocationStatus(statusBadge, "info", "Requesting device GPS coordinates…");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = Math.round(pos.coords.accuracy || 0);

        btnText.innerHTML = `${SPINNER}<span>Resolving street address…</span>`;

        let resolvedAddress = "";
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4500);
          let res;
          try {
            res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, {
              signal: controller.signal,
              headers: { 'Accept-Language': 'en' }
            });
          } finally {
            clearTimeout(timeoutId);
          }

          if (res && res.ok) {
            const data = await res.json();
            if (data && data.display_name) {
              resolvedAddress = data.display_name;
            }
          }
        } catch (err) {
          console.warn("Reverse geocode timeout/warning:", err);
        }

        if (resolvedAddress) {
          addressInput.value = resolvedAddress;
          setLocationStatus(statusBadge, "success", `Location auto-filled (accuracy ±${accuracy}m): <strong>${escapeHtml(resolvedAddress)}</strong>`, true);
        } else {
          addressInput.value = `GPS Location: ${lat.toFixed(6)}, ${lon.toFixed(6)} (https://maps.google.com/?q=${lat},${lon})`;
          setLocationStatus(statusBadge, "info", `GPS coordinates locked: <strong>${lat.toFixed(5)}, ${lon.toFixed(5)}</strong> (Google Maps link added)`, true);
        }

        btn.disabled = false;
        btnText.innerHTML = `<span>Location auto-filled · Detect again</span>`;
      },
      (err) => {
        btn.disabled = false;
        btnText.innerHTML = `<span>Auto-detect my live location</span>`;
        if (err.code === 1) {
          setLocationStatus(statusBadge, "error", "Location permission denied. Please allow location access or type your address manually.");
        } else if (err.code === 2) {
          setLocationStatus(statusBadge, "error", "Location unavailable. Please type your address manually.");
        } else {
          setLocationStatus(statusBadge, "error", "Location request timed out. Please type your address manually.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  });
}

// === EVENT LISTENERS & CHECKOUT SUBMISSION ===
function setupEventListeners() {
  // Cart open/close
  document.getElementById("cart-btn")?.addEventListener("click", openCartDrawer);
  document.getElementById("close-cart-btn")?.addEventListener("click", closeCartDrawer);
  document.getElementById("cart-drawer-backdrop")?.addEventListener("click", closeCartDrawer);
  document.getElementById("cart-shop-now-btn")?.addEventListener("click", () => {
    closeCartDrawer();
    scrollToCollection();
  });

  // Proceed checkout
  document.getElementById("proceed-checkout-btn")?.addEventListener("click", () => {
    closeCartDrawer();
    openCheckoutModal();
  });

  document.getElementById("close-checkout-modal-btn")?.addEventListener("click", closeCheckoutModal);
  const modal = document.getElementById("checkout-modal");
  modal?.addEventListener("click", (e) => { if (e.target === modal) closeCheckoutModal(); });

  // Search input listeners
  const handleSearch = (e) => {
    searchQuery = e.target.value.trim();
    renderProducts();
  };
  document.getElementById("search-input")?.addEventListener("input", handleSearch);
  document.getElementById("clear-search-btn")?.addEventListener("click", () => {
    const input = document.getElementById("search-input");
    if (input) input.value = "";
    searchQuery = "";
    renderProducts();
  });

  // In-stock checkbox
  document.getElementById("in-stock-only")?.addEventListener("change", (e) => {
    inStockOnly = e.target.checked;
    renderProducts();
  });

  // Sort order
  document.getElementById("sort-select")?.addEventListener("change", (e) => {
    sortOrder = e.target.value;
    renderProducts();
  });

  // Finish order button in success modal
  document.getElementById("finish-order-btn")?.addEventListener("click", () => {
    closeCheckoutModal();
  });

  // Checkout Form Submission
  const form = document.getElementById("checkout-form");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (cart.length === 0) {
      alert("Your cart is empty!");
      return;
    }

    // Email validation
    const emailInput = document.getElementById("order-email");
    const emailVal = (emailInput?.value || "").trim();
    if (!emailVal || !emailVal.includes("@") || !emailVal.includes(".")) {
      alert("Please provide a valid email address!");
      emailInput?.focus();
      return;
    }

    const submitBtn = document.getElementById("submit-order-btn");
    const originalBtnText = submitBtn.innerHTML;

    // Loading State
    submitBtn.disabled = true;
    submitBtn.innerHTML = `${SPINNER}<span>Placing order…</span>`;

    const orderData = {
      customer: {
        name: document.getElementById("order-name").value.trim(),
        telegram: document.getElementById("order-telegram").value.trim(),
        phone: document.getElementById("order-phone").value.trim(),
        email: emailVal,
        address: document.getElementById("order-address").value.trim() || "Not provided (Online / Self-Pickup)",
        notes: document.getElementById("order-notes").value.trim()
      },
      items: cart.map(item => ({ id: item.id, variantId: item.variantId || undefined, quantity: item.quantity }))
    };

    try {
      // 1. Save order to server/cloud; Telegram notification is dispatched server-side
      const savedOrder = await StoreDB.addOrder(orderData);
      const order = savedOrder.order || savedOrder;
      const telegramSent = Boolean(savedOrder.telegramSent);

      // 2. Update Success UI
      document.getElementById("confirmed-order-id").textContent = `#${order.id}`;

      const statusPill = document.getElementById("telegram-status-pill");
      if (telegramSent) {
        statusPill.innerHTML = `${icon("check", 14)}<span>Order confirmed & notification sent to owner</span>`;
        statusPill.className = "status-pill";
      } else {
        statusPill.innerHTML = `${icon("info", 14)}<span>Order received (Telegram notification could not be sent)</span>`;
        statusPill.className = "status-pill is-warning";
      }

      // Clear cart
      cart = [];
      updateCartUI();
      form.reset();
      document.getElementById("location-status-badge")?.classList.add("hidden");

      // Show success modal state
      form.classList.add("hidden");
      document.getElementById("order-success-state").classList.remove("hidden");

    } catch (err) {
      console.error(err);
      alert("Failed to submit order: " + err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalBtnText;
    }
  });
}

// ==========================================
// EVENT DELEGATION for storefront data-action buttons (replaces inline onclick handlers)
// ==========================================
function setupStorefrontActionDelegation() {
  document.body.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) {
      const card = e.target.closest(".product-card[data-product-id]");
      if (card && !e.target.closest("button,select,a,input")) openProductDetail(card.dataset.productId, card.querySelector(".product-image"));
      return;
    }
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    const delta = btn.getAttribute("data-delta");
    if (!id && action !== "update-quantity") return;

    try {
      switch (action) {
        case "add-to-cart":
          if (addToCart(id, btn) && btn.closest(".product-detail-panel")) closeProductDetail();
          break;
        case "quick-buy":
          if (quickBuy(id, btn) && btn.closest(".product-detail-panel")) closeProductDetail();
          break;
        case "update-quantity":
          updateQuantity(id, parseInt(delta || "0", 10));
          break;
        case "remove-from-cart":
          removeFromCart(id);
          break;
      }
    } catch (err) {
      console.error("Cart action failed:", err);
    }
  });
}

// Dropdown changes on product cards (update price, clear the "please choose" message).
document.addEventListener("change", (e) => {
  const select = e.target.closest?.("[data-variant-field]");
  if (select) handleVariantChange(select);
});

// Global exposure for HTML onclick attributes (kept for backward compatibility)
window.addToCart = addToCart;
window.quickBuy = quickBuy;
window.updateQuantity = updateQuantity;
window.removeFromCart = removeFromCart;
