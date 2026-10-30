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
  return product && product.image ? safeImageUrl(product.image) : "";
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
    const matchesStock = !inStockOnly || p.inStock;
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
    const isOut = !product.inStock;
    const saved = wishlist.includes(product.id);
    return `
      <article class="product-card ${isOut ? 'is-sold-out' : ''}">
        <div class="product-media">
          <img
            src="${escapeHtml(safeImageUrl(product.image, FALLBACK_IMAGE))}"
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
          <p class="product-price">${escapeHtml(currency)}${Number(product.price).toFixed(2)}</p>
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
  const product = products.find(item => item && item.inStock && item.image) || products.find(item => item && item.inStock);
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

// === CART LOGIC ===
function addToCart(productId) {
  const products = StoreDB.getProducts();
  const product = products.find(p => p.id === productId);
  if (!product || !product.inStock) return;

  const existing = cart.find(item => item.id === productId);
  if (existing) {
    existing.quantity = Math.min(99, existing.quantity + 1);
  } else {
    cart.push({
      id: product.id,
      name: product.name,
      category: product.category,
      price: Number(product.price),
      image: product.image,
      quantity: 1
    });
  }

  updateCartUI();
  openCartDrawer();
}

function quickBuy(productId) {
  addToCart(productId);
  closeCartDrawer();
  openCheckoutModal();
}

function updateQuantity(productId, delta) {
  const item = cart.find(i => i.id === productId);
  if (!item) return;

  item.quantity = Math.min(99, item.quantity + delta);
  if (item.quantity <= 0) {
    cart = cart.filter(i => i.id !== productId);
  }
  updateCartUI();
}

function removeFromCart(productId) {
  cart = cart.filter(i => i.id !== productId);
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
            <div class="cart-item-row">
              <div class="qty-control" aria-label="Quantity">
                <button data-action="update-quantity" data-id="${escapeHtml(item.id)}" data-delta="-1" type="button" aria-label="Decrease quantity">${icon("minus", 14)}</button>
                <span>${escapeHtml(item.quantity)}</span>
                <button data-action="update-quantity" data-id="${escapeHtml(item.id)}" data-delta="1" type="button" aria-label="Increase quantity">${icon("plus", 14)}</button>
              </div>
              <span class="cart-item-price">${escapeHtml(currency)}${(Number(item.price) * item.quantity).toFixed(2)}</span>
            </div>
            <button data-action="remove-from-cart" data-id="${escapeHtml(item.id)}" class="cart-item-remove" type="button">Remove</button>
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
      items: cart.map(item => ({ id: item.id, quantity: item.quantity }))
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
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    const delta = btn.getAttribute("data-delta");
    if (!id && action !== "update-quantity") return;

    try {
      switch (action) {
        case "add-to-cart":
          addToCart(id);
          break;
        case "quick-buy":
          quickBuy(id);
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

// Global exposure for HTML onclick attributes (kept for backward compatibility)
window.addToCart = addToCart;
window.quickBuy = quickBuy;
window.updateQuantity = updateQuantity;
window.removeFromCart = removeFromCart;
