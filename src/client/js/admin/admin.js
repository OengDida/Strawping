// Escape untrusted text before interpolating it into admin HTML templates (prevents XSS in admin panel).
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function safeImageUrl(value, fallback = "") {
  try {
    const url = new URL(String(value || fallback), window.location.origin);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : fallback;
  } catch {
    return fallback;
  }
}

// ==========================================
// ADMIN DASHBOARD CONTROLLER (admin.js)
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
  checkAuth();
  setupAuth();
  setupTabs();
  setupProductManager();
  setupStockManager();
  setupStoreCustomizer();
  setupTelegramBotManager();
  setupBackupManager();
  setupAdminActionDelegation(); // NEW: event delegation for data-action buttons
});

// === AUTHENTICATION ===
async function checkAuth() {
  const authGate = document.getElementById("auth-gate");
  const adminApp = document.getElementById("admin-app");
  const authenticated = await StoreDB.isAuthenticated();

  if (authenticated) {
    authGate.classList.add("hidden");
    adminApp.classList.remove("hidden");
    loadAllAdminData();
  } else {
    authGate.classList.remove("hidden");
    adminApp.classList.add("hidden");
  }
}

function setupAuth() {
  const loginForm = document.getElementById("login-form");
  const loginPinInput = document.getElementById("login-pin");
  const logoutBtn = document.getElementById("admin-logout-btn");

  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = loginPinInput.value.trim();
    const button = loginForm.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      await StoreDB.login(pin);
      loginPinInput.value = "";
      await checkAuth();
    } catch (err) {
      alert(err.message || "Login failed. Check your admin password.");
      loginPinInput.focus();
    } finally {
      if (button) button.disabled = false;
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    if (confirm("Log out of Admin Panel?")) {
      try {
        await StoreDB.logout();
      } catch (err) {
        alert(err.message || "Logout could not be confirmed by the server.");
      } finally {
        await checkAuth();
      }
    }
  });
}

// === TAB NAVIGATION ===
function setupTabs() {
  const tabs = document.querySelectorAll(".nav-tab");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");

      // Update tab styling
      tabs.forEach(t => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");

      // Show matching pane
      document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.add("hidden"));
      const activePane = document.getElementById(`tab-content-${target}`);
      if (activePane) activePane.classList.remove("hidden");
      if (target === "stock") {
        if (!hasUnsavedInventoryChanges()) renderAdminStock();
        else updateStockSaveButton();
      }
    });
  });
}

async function loadAllAdminData() {
  await StoreDB.syncOrdersFromServer();
  await StoreDB.initAdminSync();
  await renderAdminProducts();
  await renderAdminOrders();
  loadCustomizerSettings();
  await updateServerSyncStatus();
}

async function updateServerSyncStatus() {
  const dot = document.getElementById("admin-sync-dot");
  const text = document.getElementById("admin-sync-status-text");
  if (!dot || !text) return;
  const online = await StoreDB.checkServerStatus();
  dot.className = `sync-dot ${online ? "is-online" : "is-offline"}`;
  text.textContent = online ? "Secure Store API Active" : "API Offline";
}

function showToast(message, type = "success", action = null) {
  const toast = document.createElement("div");
  toast.className = `admin-toast is-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  const text = document.createElement("span");
  text.textContent = message;
  toast.appendChild(text);
  if (action) {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "admin-toast-action";
    retry.textContent = action.label;
    retry.addEventListener("click", () => {
      toast.remove();
      action.onClick();
    });
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "admin-toast-dismiss";
    dismiss.setAttribute("aria-label", "Dismiss notification");
    dismiss.textContent = "×";
    dismiss.addEventListener("click", () => toast.remove());
    toast.append(retry, dismiss);
  }
  document.body.appendChild(toast);
  // Keep actionable error toasts visible until the admin retries or dismisses them.
  if (!action) {
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 500);
    }, 2500);
  }
}

function watchOptimisticProductMutation(mutation, successMessage, pendingMessage) {
  if (!mutation) return;
  showToast(pendingMessage, "success");
  mutation.sync.then(() => {
    renderAdminProducts();
    void updateServerSyncStatus();
    showToast(successMessage, "success");
  }).catch(error => {
    // StoreDB has already rolled back this mutation without discarding newer edits.
    renderAdminProducts();
    void updateServerSyncStatus();
    showToast(`Could not save product changes: ${error.message}`, "error", {
      label: "Retry",
      onClick: () => {
        const retry = mutation.retry?.();
        if (!retry) {
          showToast("This product is no longer available to retry.", "error");
          return;
        }
        renderAdminProducts();
        watchOptimisticProductMutation(retry, successMessage, "Retrying product sync…");
      }
    });
  });
}

// ==========================================
// PRODUCTS MANAGER
// ==========================================
const MAX_PRODUCT_IMAGE_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_PRODUCT_IMAGE_PIXELS = 24_000_000;
const MAX_PRODUCT_IMAGE_UPLOAD_BYTES = 1_500_000;
let pendingProductImages = [];
let selectedThumbnailIndex = 0;

function setProductImageStatus(message) {
  const status = document.getElementById("prod-image-status");
  if (status) status.textContent = message;
}

function renderProductImageGallery() {
  const gallery = document.getElementById("prod-image-gallery");
  if (!gallery) return;
  gallery.innerHTML = pendingProductImages.map((item, index) => `
    <div class="admin-image-tile ${index === selectedThumbnailIndex ? "is-thumbnail" : ""}">
      <img src="${escapeHtml(item.dataUrl || safeImageUrl(item.url))}" alt="Product photo ${index + 1}" />
      <button type="button" data-thumb-index="${index}" aria-pressed="${index === selectedThumbnailIndex}" title="Set as catalog thumbnail">${index === selectedThumbnailIndex ? "★ Thumbnail" : "☆ Set thumbnail"}</button>
      <button type="button" data-remove-image="${index}" aria-label="Remove photo ${index + 1}">×</button>
    </div>`).join("");
}

function resetProductImagePicker(images = [], thumbnail = "") {
  pendingProductImages = (Array.isArray(images) ? images : []).map(url => ({ url }));
  selectedThumbnailIndex = Math.max(0, pendingProductImages.findIndex(item => item.url === thumbnail));
  const fileInput = document.getElementById("prod-image-file");
  const urlInput = document.getElementById("prod-image");
  if (fileInput) fileInput.value = "";
  if (urlInput) urlInput.value = "";
  renderProductImageGallery();
  setProductImageStatus("");
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the optimized image."));
    reader.readAsDataURL(blob);
  });
}

async function optimizeProductImage(file) {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  }
  if (file.size > MAX_PRODUCT_IMAGE_SOURCE_BYTES) {
    throw new Error("Choose an image smaller than 15 MB.");
  }
  if (typeof createImageBitmap !== "function") {
    throw new Error("This browser cannot process image uploads. Try a recent browser.");
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This image could not be opened. Try another image file.");
  }

  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PRODUCT_IMAGE_PIXELS) {
      throw new Error("This image has too many pixels. Choose a smaller image.");
    }

    let scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const qualities = [0.84, 0.76, 0.68, 0.60];
    for (let sizePass = 0; sizePass < 4; sizePass += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Could not prepare the image for upload.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of qualities) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
        if (blob && blob.size <= MAX_PRODUCT_IMAGE_UPLOAD_BYTES) {
          return await blobToDataUrl(blob);
        }
      }
      scale *= 0.8;
    }
    throw new Error("The optimized image is still too large. Choose a smaller image.");
  } finally {
    bitmap.close?.();
  }
}

// ---- Product variants (sizes / colors / types) ----
const VARIANT_FIELDS = ["size", "color", "type"];

function setVariantSectionVisible(visible) {
  document.getElementById("variant-section")?.classList.toggle("hidden", !visible);
}

function addVariantRow(variant = {}) {
  const rows = document.getElementById("variant-rows");
  if (!rows) return;
  const row = document.createElement("div");
  row.className = "variant-row";
  // Keep the id of an existing variant so old carts/orders stay valid; new rows get a fresh id.
  row.dataset.variantId = variant.id || `var-${crypto.randomUUID()}`;
  // Inventory remains managed in the Stock Management tab, but must survive
  // product edits while its controls are absent from this form.
  row.dataset.stock = String(variant.stock ?? 0);
  row.dataset.inStock = variant.inStock === false ? "false" : "true";
  row.innerHTML = `
    <input type="text" data-field="size" maxlength="40" placeholder="e.g. M" aria-label="Size" value="${escapeHtml(variant.size || "")}" />
    <input type="text" data-field="color" maxlength="40" placeholder="e.g. Red" aria-label="Color" value="${escapeHtml(variant.color || "")}" />
    <input type="text" data-field="type" maxlength="40" placeholder="e.g. Cotton" aria-label="Type" value="${escapeHtml(variant.type || "")}" />
    <input type="number" data-field="priceAdjustment" step="0.01" aria-label="Price adjustment" value="${escapeHtml(variant.priceAdjustment ?? 0)}" />
    <button type="button" class="link-btn link-danger" data-remove-variant aria-label="Remove this variant">Remove</button>
  `;
  rows.appendChild(row);
}

function resetVariantEditor(product) {
  const toggle = document.getElementById("prod-has-variants");
  const rows = document.getElementById("variant-rows");
  if (!toggle || !rows) return;
  rows.innerHTML = "";
  const enabled = Boolean(product?.hasVariants && Array.isArray(product.variants));
  toggle.checked = enabled;
  if (enabled) product.variants.forEach(variant => addVariantRow(variant));
  setVariantSectionVisible(enabled);
}

// Reads the rows and checks them. Throws an Error with a friendly message if something is wrong.
function collectVariants() {
  const rowEls = [...document.querySelectorAll("#variant-rows .variant-row")];
  if (rowEls.length === 0) throw new Error("Add at least one variant, or turn off \"Enable variants\".");

  const seen = new Set();
  const variants = rowEls.map((row, index) => {
    const read = field => row.querySelector(`[data-field="${field}"]`).value.trim();
    const variant = { id: row.dataset.variantId };
    for (const field of VARIANT_FIELDS) variant[field] = read(field);
    if (!VARIANT_FIELDS.some(field => variant[field])) {
      throw new Error(`Variant row ${index + 1}: fill in a size, color, or type.`);
    }
    variant.stock = Number(row.dataset.stock || 0);
    if (!Number.isInteger(variant.stock) || variant.stock < 0) {
      throw new Error(`Variant row ${index + 1}: stock must be a whole number (0 or more).`);
    }
    variant.inStock = row.dataset.inStock !== "false";
    variant.priceAdjustment = Number(read("priceAdjustment") || 0);
    if (!Number.isFinite(variant.priceAdjustment)) {
      throw new Error(`Variant row ${index + 1}: price adjustment must be a number.`);
    }
    const combo = VARIANT_FIELDS.map(field => variant[field].toLowerCase()).join("|");
    if (seen.has(combo)) throw new Error(`Variant row ${index + 1} repeats another row. Each combination can only be listed once.`);
    seen.add(combo);
    return variant;
  });

  for (const field of VARIANT_FIELDS) {
    const filled = variants.filter(variant => variant[field]).length;
    if (filled !== 0 && filled !== variants.length) {
      throw new Error(`The "${field}" column is filled on some rows but empty on others. Fill it on every row or leave it empty on all.`);
    }
  }
  return variants;
}

function setupProductManager() {
  const modal = document.getElementById("product-modal");
  const openBtn = document.getElementById("open-add-product-btn");
  const closeBtn = document.getElementById("close-product-modal-btn");
  const form = document.getElementById("product-form");
  const imageUrlInput = document.getElementById("prod-image");
  const imageFileInput = document.getElementById("prod-image-file");
  const saveButton = document.getElementById("save-prod-btn");

  openBtn?.addEventListener("click", () => {
    form.reset();
    resetProductImagePicker();
    document.getElementById("prod-id").value = "";
    document.getElementById("product-modal-title").textContent = "Add New Product";
    resetVariantEditor(null);
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  });

  document.getElementById("prod-has-variants")?.addEventListener("change", (e) => {
    setVariantSectionVisible(e.target.checked);
    // Start with one empty row so the admin sees where to type.
    if (e.target.checked && !document.querySelector("#variant-rows .variant-row")) addVariantRow();
  });
  document.getElementById("add-variant-btn")?.addEventListener("click", () => addVariantRow());
  document.getElementById("variant-rows")?.addEventListener("click", (e) => {
    const removeBtn = e.target.closest("[data-remove-variant]");
    if (removeBtn) removeBtn.closest(".variant-row")?.remove();
  });

  closeBtn?.addEventListener("click", () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  });

  imageFileInput?.addEventListener("change", async () => {
    const files = [...(imageFileInput.files || [])];
    if (!files.length) return;
    if (pendingProductImages.length + files.length > 20) {
      setProductImageStatus("You can add up to 20 photos per product."); imageFileInput.value = ""; return;
    }
    saveButton.disabled = true;
    try {
      for (const file of files) {
        setProductImageStatus(`Preparing photo ${pendingProductImages.length + 1}…`);
        pendingProductImages.push({ dataUrl: await optimizeProductImage(file) });
      }
      if (pendingProductImages.length === files.length) selectedThumbnailIndex = 0;
      renderProductImageGallery();
      setProductImageStatus("Photos ready. They will upload when you save the product.");
    } catch (err) {
      setProductImageStatus(err.message || "Could not prepare these photos.");
    } finally { imageFileInput.value = ""; saveButton.disabled = false; }
  });

  document.getElementById("prod-image-gallery")?.addEventListener("click", (event) => {
    const thumb = event.target.closest("[data-thumb-index]");
    const remove = event.target.closest("[data-remove-image]");
    if (thumb) selectedThumbnailIndex = Number(thumb.dataset.thumbIndex);
    if (remove) {
      const index = Number(remove.dataset.removeImage);
      pendingProductImages.splice(index, 1);
      if (selectedThumbnailIndex >= pendingProductImages.length) selectedThumbnailIndex = Math.max(0, pendingProductImages.length - 1);
      else if (index < selectedThumbnailIndex) selectedThumbnailIndex--;
    }
    renderProductImageGallery();
  });

  imageUrlInput?.addEventListener("change", () => {
    const url = imageUrlInput.value.trim();
    if (url && !pendingProductImages.some(item => item.url === url)) {
      if (pendingProductImages.length >= 20) { setProductImageStatus("You can add up to 20 photos."); return; }
      pendingProductImages.unshift({ url }); selectedThumbnailIndex = 0; renderProductImageGallery();
    }
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("prod-id").value;
    const existingProduct = id ? StoreDB.getProducts().find(product => product.id === id) : null;
    const productData = {
      name: document.getElementById("prod-name").value.trim(),
      category: document.getElementById("prod-category").value.trim(),
      price: parseFloat(document.getElementById("prod-price").value) || 0,
      description: document.getElementById("prod-description").value.trim(),
      inStock: existingProduct?.inStock ?? true,
      stock: existingProduct?.stock ?? 0,
      hasVariants: document.getElementById("prod-has-variants").checked,
      variants: []
    };
    if (productData.hasVariants) {
      try {
        productData.variants = collectVariants();
      } catch (err) {
        alert(err.message);
        return;
      }
    }

    const originalButtonText = saveButton.textContent;
    saveButton.disabled = true;
    try {
      saveButton.textContent = "Uploading photos…";
      const imageUrls = [];
      for (const item of pendingProductImages) {
        imageUrls.push(item.url || await StoreDB.uploadProductImage(item.dataUrl));
      }
      if (!imageUrls.length && imageUrlInput.value.trim()) imageUrls.push(imageUrlInput.value.trim());
      if (!imageUrls.length) imageUrls.push("https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80");
      productData.images = imageUrls;
      productData.thumbnail = imageUrls[Math.min(selectedThumbnailIndex, imageUrls.length - 1)];
      productData.image = productData.thumbnail;

      saveButton.textContent = "Saving product…";
      const mutation = id
        ? StoreDB.updateProductOptimistic(id, productData)
        : StoreDB.addProductOptimistic(productData);
      if (!mutation) throw new Error("Product not found.");

      modal.classList.add("hidden");
      modal.classList.remove("flex");
      renderAdminProducts();
      watchOptimisticProductMutation(
        mutation,
        "Product changes synced to the server.",
        "Product saved locally; syncing in the background…"
      );
    } catch (err) {
        alert("Failed to save product: " + err.message);
        console.error(err);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = originalButtonText;
    }
  });
}

function renderAdminProducts() {
  const products = StoreDB.getProducts();
  const settings = StoreDB.getSettings();
  const currency = settings.currency || "$";
  const tbody = document.getElementById("admin-products-table-body");
  const badge = document.getElementById("tab-products-badge");

  if (badge) badge.textContent = products.length;
  if (!tbody) return;

  if (products.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="table-empty">
          No products in catalog. Click "Add New Product" to create one!
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = products.map(prod => `
    <tr>
      <td>
        <div class="cell-product">
          <img
            src="${escapeHtml(safeImageUrl(prod.image, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=150&q=80'))}"
            alt="${escapeHtml(prod.name)}"
          />
          <div class="cell-product-text">
            <span class="cell-name">${escapeHtml(prod.name)}</span>
            <span class="cell-sub">${escapeHtml(prod.description || 'No description')}</span>
          </div>
        </div>
      </td>
      <td>
        <span class="chip">${escapeHtml(prod.category || 'General')}</span>
        ${prod.hasVariants && Array.isArray(prod.variants) ? `<span class="chip chip-solid">${prod.variants.length} variant${prod.variants.length === 1 ? '' : 's'}</span>` : ''}
      </td>
      <td class="cell-price">
        ${escapeHtml(currency)}${Number(prod.price).toFixed(2)}
      </td>
      <td class="cell-actions">
        <button data-action="toggle-featured" data-id="${escapeHtml(prod.id)}" class="link-btn featured-action${prod.featured === true ? ' is-featured' : ''}" type="button" aria-pressed="${prod.featured === true}" aria-label="${prod.featured === true ? `Remove ${escapeHtml(prod.name)} as the featured homepage product` : `Feature ${escapeHtml(prod.name)} on the homepage`}">${prod.featured === true ? 'Featured' : 'Feature'}</button>
        <button data-action="edit-product" data-id="${escapeHtml(prod.id)}" class="link-btn" type="button" aria-label="Edit ${escapeHtml(prod.name)}">Edit</button>
        <button data-action="delete-product" data-id="${escapeHtml(prod.id)}" class="link-btn link-danger" type="button" aria-label="Delete ${escapeHtml(prod.name)}">Delete</button>
      </td>
    </tr>
  `).join("");
}

function editProduct(id) {
  const products = StoreDB.getProducts();
  const prod = products.find(p => p.id === id);
  if (!prod) return;

  document.getElementById("prod-id").value = prod.id;
  document.getElementById("prod-name").value = prod.name;
  document.getElementById("prod-category").value = prod.category;
  document.getElementById("prod-price").value = prod.price;
  resetProductImagePicker(prod.images?.length ? prod.images : (prod.image ? [prod.image] : []), prod.thumbnail || prod.image || "");
  document.getElementById("prod-description").value = prod.description || "";
  resetVariantEditor(prod);

  document.getElementById("product-modal-title").textContent = "Edit Product";

  const modal = document.getElementById("product-modal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function deleteProduct(id, { skipConfirm = false } = {}) {
  if (!skipConfirm && !confirm("Are you sure you want to delete this product?")) return;
  const mutation = StoreDB.deleteProductOptimistic(id);
  if (!mutation) return;
  renderAdminProducts();
  watchOptimisticProductMutation(
    mutation,
    "Product deletion synced to the server.",
    "Product removed locally; syncing in the background…"
  );
}

function toggleFeaturedProduct(id) {
  const product = StoreDB.getProducts().find(item => item.id === id);
  if (!product) return;
  const featured = product.featured !== true;
  const mutation = StoreDB.updateProductOptimistic(id, { featured });
  if (!mutation) return;
  renderAdminProducts();
  watchOptimisticProductMutation(
    mutation,
    featured ? `${product.name} is featured on the homepage.` : "Homepage featured product cleared.",
    "Featured-product setting updated locally; syncing…"
  );
}


// ==========================================
// STOCK MANAGEMENT
// ==========================================
function inventoryStatus(item) {
  return item.inStock !== false && Number(item.stock) > 0 ? "In stock" : "Sold out";
}

async function renderAdminStock() {
  const tbody = document.getElementById("admin-stock-table-body");
  if (!tbody) return;
  const products = StoreDB.getProducts();
  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="table-empty">No products yet. Add products in the Products tab.</td></tr>';
    updateStockSaveButton();
    return;
  }
  const rows = [];
  for (const product of products) {
    if (product.hasVariants && Array.isArray(product.variants)) {
      for (const variant of product.variants) {
        const label = [variant.size, variant.color, variant.type].filter(Boolean).join(" / ");
        rows.push({ product, variant, label });
      }
    } else {
      rows.push({ product, variant: null, label: "Standard item" });
    }
  }
  tbody.innerHTML = rows.map(({product, variant, label}) => {
    const stock = Number(variant ? variant.stock : product.stock) || 0;
    const enabled = (variant ? variant.inStock : product.inStock) !== false;
    const status = enabled && stock > 0 ? "In stock" : "Sold out";
    const variantId = variant ? variant.id : "";
    const key = `${product.id}::${variantId}`;
    return `<tr data-inventory-key="${escapeHtml(key)}" data-saved-stock="${stock}" data-saved-enabled="${enabled}">
      <td><div class="cell-product"><img src="${escapeHtml(safeImageUrl(product.image))}" alt=""><div class="cell-product-text"><span class="cell-name">${escapeHtml(product.name)}</span><span class="cell-sub">${escapeHtml(label)}</span></div></div></td>
      <td><input class="stock-number" type="number" min="0" max="1000000" step="1" inputmode="numeric" value="${stock}" data-stock-value aria-label="Stock quantity for ${escapeHtml(product.name)}"></td>
      <td><div class="stock-adjust"><button type="button" data-stock-delta="-1" aria-label="Decrease stock">−</button><button type="button" data-stock-delta="1" aria-label="Increase stock">+</button></div></td>
      <td><label class="switch stock-switch"><input type="checkbox" data-stock-enabled ${enabled ? "checked" : ""} aria-label="Enable availability for ${escapeHtml(product.name)}"><span class="switch-track"></span></label></td>
      <td><span class="stock-pill ${status === "In stock" ? "is-in" : "is-out"}" data-stock-status>${status}</span></td>
    </tr>`;
  }).join("");
  tbody.querySelectorAll("tr[data-inventory-key]").forEach(row => updateInventoryRowState(row, false));
  updateStockSaveButton();
}

function getInventoryDraft(row) {
  const input = row.querySelector("[data-stock-value]");
  const rawStock = input.value.trim();
  const stock = Number(rawStock);
  const enabled = row.querySelector("[data-stock-enabled]").checked;
  const valid = rawStock !== "" && Number.isInteger(stock) && stock >= 0 && stock <= 1000000;
  const dirty = !valid || stock !== Number(row.dataset.savedStock) || enabled !== (row.dataset.savedEnabled === "true");
  return { input, stock, enabled, valid, dirty };
}

function updateInventoryRowState(row, refreshButton = true) {
  if (!row?.matches("tr[data-inventory-key]")) return;
  const { input, stock, enabled, valid, dirty } = getInventoryDraft(row);
  const status = row.querySelector("[data-stock-status]");
  input.setAttribute("aria-invalid", valid ? "false" : "true");
  status.textContent = valid && enabled && stock > 0 ? "In stock" : "Sold out";
  status.classList.toggle("is-in", valid && enabled && stock > 0);
  status.classList.toggle("is-out", !valid || !enabled || stock === 0);
  row.classList.toggle("is-dirty", dirty);
  if (refreshButton) updateStockSaveButton();
}

function hasUnsavedInventoryChanges() {
  return [...document.querySelectorAll("#admin-stock-table-body tr[data-inventory-key]")]
    .some(row => getInventoryDraft(row).dirty);
}

function updateStockSaveButton() {
  const button = document.getElementById("save-all-stock-btn");
  if (!button) return;
  const dirtyCount = [...document.querySelectorAll("#admin-stock-table-body tr[data-inventory-key]")]
    .filter(row => getInventoryDraft(row).dirty).length;
  button.disabled = savingInventory || dirtyCount === 0;
  button.textContent = savingInventory
    ? "Saving changes…"
    : dirtyCount
      ? `Save all changes (${dirtyCount})`
      : "Save all changes";
}

let savingInventory = false;

async function saveAllInventory() {
  const tbody = document.getElementById("admin-stock-table-body");
  const rows = [...tbody.querySelectorAll("tr[data-inventory-key]")];
  const drafts = rows
    .map(row => ({ row, ...getInventoryDraft(row) }))
    .filter(draft => draft.dirty);
  if (!drafts.length) return;

  const invalidDraft = drafts.find(draft => !draft.valid);
  if (invalidDraft) {
    invalidDraft.input.focus();
    showToast("Enter a whole stock quantity from 0 to 1,000,000 for every edited item.", "error");
    return;
  }

  savingInventory = true;
  tbody.querySelectorAll("input, button").forEach(control => { control.disabled = true; });
  const refreshButton = document.getElementById("refresh-stock-btn");
  if (refreshButton) refreshButton.disabled = true;
  updateStockSaveButton();
  let savedCount = 0;
  const failures = [];
  try {
    // The API currently accepts one inventory row per request, so save the
    // edited rows in sequence and refresh the cached catalog once afterward.
    for (const draft of drafts) {
      const [productId, variantId] = draft.row.dataset.inventoryKey.split("::");
      try {
        await StoreDB.updateInventory(productId, variantId || null, {
          stock: draft.stock,
          inStock: draft.enabled,
        });
        draft.row.dataset.savedStock = String(draft.stock);
        draft.row.dataset.savedEnabled = String(draft.enabled);
        savedCount++;
      } catch (error) {
        failures.push(error);
      }
    }

    let syncOk = true;
    if (savedCount > 0) {
      const sync = await StoreDB.syncData();
      syncOk = sync.ok;
      if (sync.ok) renderAdminProducts();
    }

    rows.forEach(updateInventoryRowState);
    if (failures.length) {
      showToast(
        `Saved ${savedCount} item(s); ${failures.length} failed. Review the unsaved rows and try again.`,
        "error"
      );
    } else if (!syncOk) {
      showToast("Stock changes were saved, but the catalog could not refresh. Use Refresh stock to retry.", "error");
    } else {
      showToast(`Saved stock changes for ${savedCount} item(s).`);
    }
  } finally {
    savingInventory = false;
    tbody.querySelectorAll("input, button").forEach(control => { control.disabled = false; });
    if (refreshButton) refreshButton.disabled = false;
    updateStockSaveButton();
  }
}

function setupStockManager() {
  const tbody = document.getElementById("admin-stock-table-body");
  document.getElementById("refresh-stock-btn")?.addEventListener("click", async () => {
    if (hasUnsavedInventoryChanges() && !confirm("Discard unsaved stock changes and refresh inventory?")) return;
    const result = await StoreDB.syncData();
    if (!result.ok) showToast("Could not refresh inventory: " + result.error, "error");
    renderAdminStock();
  });
  document.getElementById("save-all-stock-btn")?.addEventListener("click", saveAllInventory);
  tbody?.addEventListener("click", async (event) => {
    const row = event.target.closest("tr[data-inventory-key]");
    if (!row) return;
    const input = row.querySelector("[data-stock-value]");
    const deltaButton = event.target.closest("[data-stock-delta]");
    if (deltaButton) {
      input.value = Math.max(0, Math.min(1000000, Number(input.value || 0) + Number(deltaButton.dataset.stockDelta)));
      updateInventoryRowState(row);
    }
  });
  tbody?.addEventListener("input", (event) => {
    if (!event.target.matches("[data-stock-value]")) return;
    updateInventoryRowState(event.target.closest("tr[data-inventory-key]"));
  });
  tbody?.addEventListener("change", async (event) => {
    if (event.target.matches("[data-stock-enabled]")) {
      updateInventoryRowState(event.target.closest("tr[data-inventory-key]"));
    }
  });
}

// ==========================================
// ORDERS MANAGER
// ==========================================
async function renderAdminOrders() {
  const orders = await StoreDB.getOrders();
  const settings = StoreDB.getSettings();
  const currency = settings.currency || "$";
  const container = document.getElementById("orders-list-container");
  const emptyState = document.getElementById("orders-empty-state");
  const badge = document.getElementById("tab-orders-badge");

  if (badge) badge.textContent = orders.length;
  if (!container) return;

  if (orders.length === 0) {
    container.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");
  container.innerHTML = orders.map(order => {
    const customer = order && order.customer && typeof order.customer === "object" ? order.customer : {};
    const rawTelegram = typeof customer.telegram === "string" ? customer.telegram : "";
    const cleanTg = rawTelegram.replace(/^@/, "").trim().replace(/[^A-Za-z0-9_]/g, "").slice(0, 80);
    const telegramLink = cleanTg ? `https://t.me/${escapeHtml(cleanTg)}` : null;
    const items = Array.isArray(order?.items)
      ? order.items.filter(item => item && typeof item === "object")
      : [];
    const orderId = escapeHtml(order?.id || "");
    const safeCurrency = escapeHtml(currency);
    const statuses = ["New", "Contacted", "Shipped", "Completed", "Cancelled"];

    return `
      <div class="order-card">
        <!-- Order Header -->
        <div class="order-head">
          <div class="order-ref">
            <span class="order-id">#${orderId}</span>
            <span class="order-date">${new Date(order.createdAt).toLocaleString()}</span>
          </div>

          <div class="order-controls">
            <!-- Status Dropdown -->
            <select
              data-action="order-status" data-id="${orderId}"
              data-status="${escapeHtml(order.status)}"
              class="order-status"
              aria-label="Order status"
            >
              ${statuses.map(status => `<option value="${status}" ${order.status === status ? 'selected' : ''}>Status: ${status}</option>`).join("")}
            </select>

            <button data-action="delete-order" data-id="${orderId}" class="link-btn link-danger" type="button" title="Delete Order">Delete</button>
          </div>
        </div>

        <!-- Customer & Delivery Info -->
        <div class="order-grid">
          <div class="order-contact">
            <span class="who">${escapeHtml(customer.name)}</span>
            <a href="tel:${escapeHtml(customer.phone)}">${escapeHtml(customer.phone)}</a>
            <a href="mailto:${escapeHtml(customer.email)}">${escapeHtml(customer.email)}</a>

            ${telegramLink ? `
              <a
                href="${escapeHtml(telegramLink)}"
                target="_blank"
                rel="noopener noreferrer"
                class="tg-link"
              >Message @${escapeHtml(cleanTg)} on Telegram</a>
            ` : '<span class="muted-note">No Telegram handle provided</span>'}
          </div>

          <div class="order-address">
            <span class="mini-label">Delivery address</span>
            <p>${escapeHtml(customer.address)}</p>
            ${customer.notes ? `
              <div class="order-note">
                <strong>Note:</strong> ${escapeHtml(customer.notes)}
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Items Breakdown -->
        <div class="order-items">
          <span class="mini-label">Order items</span>
          ${items.map(item => {
            const quantity = Number(item.quantity);
            const amount = Number(item.price) * quantity;
            const quantityText = Number.isFinite(quantity) ? String(quantity) : "?";
            const amountText = Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : "0.00";
            return `
              <div class="order-line">
                <span>${escapeHtml(item.name)}${item.variantLabel ? ` <span class="order-variant">(${escapeHtml(item.variantLabel)})</span>` : ""} <span class="order-qty">x${escapeHtml(quantityText)}</span></span>
                <span>${safeCurrency}${amountText}</span>
              </div>
            `;
          }).join("")}
          <div class="order-total">
            <span>Total payable</span>
            <strong>${safeCurrency}${Number.isFinite(Number(order.total)) ? Number(order.total).toFixed(2) : "0.00"}</strong>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

async function changeOrderStatus(orderId, status) {
  await StoreDB.updateOrderStatus(orderId, status);
  await renderAdminOrders();
}

async function deleteOrder(orderId) {
  if (confirm("Delete this order record?")) {
    await StoreDB.deleteOrder(orderId);
    await renderAdminOrders();
  }
}

// ==========================================
// STORE CUSTOMIZER
// ==========================================
function loadCustomizerSettings() {
  const settings = StoreDB.getSettings();

  document.getElementById("setting-store-name").value = settings.storeName || "";
  document.getElementById("setting-tagline").value = settings.tagline || "";
  document.getElementById("setting-currency").value = settings.currency || "$";
  document.getElementById("setting-announcement-text").value = settings.announcement || "";
  document.getElementById("setting-announcement-active").checked = settings.announcementActive !== false;
  const pinField = document.getElementById("setting-admin-pin");
  if (pinField) { pinField.value = "Managed securely in server environment variables"; pinField.disabled = true; }

  const sub = document.getElementById("admin-store-name-sub");
  if (sub) sub.textContent = `Managing: ${settings.storeName}`;
}

function setupStoreCustomizer() {
  const form = document.getElementById("store-settings-form");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const currentSettings = StoreDB.getSettings();
    const updated = {
      ...currentSettings,
      storeName: document.getElementById("setting-store-name").value.trim(),
      tagline: document.getElementById("setting-tagline").value.trim(),
      currency: document.getElementById("setting-currency").value.trim() || "$",
      announcement: document.getElementById("setting-announcement-text").value.trim(),
      announcementActive: document.getElementById("setting-announcement-active").checked,
    };

    await StoreDB.saveSettings(updated);
    loadCustomizerSettings();
    renderAdminProducts(); // re-render with new currency if changed
    await updateServerSyncStatus();
    alert("Store settings updated successfully! Live store will now reflect changes.");
  });
}

// ==========================================
// TELEGRAM BOT MANAGER
// ==========================================
function setupTelegramBotManager() {
  const testBtn = document.getElementById("test-telegram-btn");
  const resultDiv = document.getElementById("telegram-test-result");
  if (!testBtn || !resultDiv) return;
  testBtn.addEventListener("click", async () => {
    testBtn.disabled = true;
    testBtn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>Testing...</span>`;
    resultDiv.classList.add("hidden");
    try {
      await StoreDB.sendTestTelegram();
      resultDiv.className = "result-box is-success";
      resultDiv.textContent = "Success — Telegram accepted the test message. Check the configured chat.";
    } catch (err) {
      resultDiv.className = "result-box is-error";
      resultDiv.textContent = `Test failed: ${err.message || "Unknown error"}. Check the server variables and function logs.`;
    } finally {
      resultDiv.classList.remove("hidden");
      testBtn.disabled = false;
      testBtn.innerHTML = `<span>Test Telegram Ping</span>`;
    }
  });
}

// ==========================================
// BACKUP & RESET MANAGER
// ==========================================
function setupBackupManager() {
  // Export JSON
  document.getElementById("export-backup-btn")?.addEventListener("click", () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(StoreDB.exportData());
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `store-backup-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  });

  // Import JSON
  const importInput = document.getElementById("import-backup-input");
  importInput?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        StoreDB.importData(event.target.result);
        alert("Store backup imported successfully!");
        loadAllAdminData();
      } catch (err) {
        alert("Failed to import backup: " + err.message);
      }
    };
    reader.readAsText(file);
  });

  // Reset to default
  document.getElementById("reset-defaults-btn")?.addEventListener("click", () => {
    if (confirm("Are you sure? This will reset all products, store name, and delete all orders back to demo state!")) {
      StoreDB.resetToDefault();
      loadAllAdminData();
      alert("Store has been reset to default demo data.");
    }
  });
}

// ==========================================
// EVENT DELEGATION for data-action buttons (replaces inline onclick handlers)
// ==========================================
function setupAdminActionDelegation() {
  document.body.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const id = btn.getAttribute("data-id");
    if (!id) return;

    try {
      switch (action) {
        case "edit-product":
          await editProduct(id);
          break;
        case "toggle-featured":
          await toggleFeaturedProduct(id);
          break;
        case "delete-product":
          deleteProduct(id);
          break;
        case "delete-order":
          if (confirm("Delete this order?")) {
            await deleteOrder(id);
          }
          break;
      }
    } catch (err) {
      alert("Action failed: " + err.message);
    }
  });

  document.body.addEventListener("change", (e) => {
    const select = e.target.closest("[data-action=\"order-status\"]");
    if (!select) return;
    const orderId = select.getAttribute("data-id");
    changeOrderStatus(orderId, select.value);
  });
}

// Expose globals for HTML onclicks (kept for backward compatibility with inline handlers)
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.changeOrderStatus = changeOrderStatus;
window.deleteOrder = deleteOrder;
