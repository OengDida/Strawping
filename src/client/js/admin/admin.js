// Escape untrusted text before interpolating it into admin HTML templates (prevents XSS in admin panel).
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function safeImageUrl(value, fallback = "") {
  try { const u = new URL(String(value || fallback), window.location.origin); return ["http:","https:"].includes(u.protocol) ? u.href : fallback; }
  catch { return fallback; }
}

// ==========================================
// ADMIN DASHBOARD CONTROLLER (admin.js)
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
  checkAuth();
  setupAuth();
  setupTabs();
  setupProductManager();
  setupStoreCustomizer();
  setupTelegramBotManager();
  setupBackupManager();
  setupAdminActionDelegation(); // NEW: event delegation for data-action buttons
});

// === AUTHENTICATION ===
function checkAuth() {
  const authGate = document.getElementById("auth-gate");
  const adminApp = document.getElementById("admin-app");

  if (StoreDB.isAuthenticated()) {
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
      checkAuth();
    } catch (err) {
      alert(err.message || "Login failed. Check your admin password.");
      loginPinInput.focus();
    } finally {
      if (button) button.disabled = false;
    }
  });

  logoutBtn?.addEventListener("click", () => {
    if (confirm("Log out of Admin Panel?")) {
      StoreDB.logout();
      checkAuth();
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

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `admin-toast is-${type}`;
  toast.setAttribute("role", "status");
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 500);
  }, 2500);
}

// ==========================================
// PRODUCTS MANAGER
// ==========================================
function setupProductManager() {
  const modal = document.getElementById("product-modal");
  const openBtn = document.getElementById("open-add-product-btn");
  const closeBtn = document.getElementById("close-product-modal-btn");
  const form = document.getElementById("product-form");
  openBtn?.addEventListener("click", () => {
    form.reset();
    document.getElementById("prod-id").value = "";
    document.getElementById("product-modal-title").textContent = "Add New Product";
    document.getElementById("prod-instock").checked = true;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
  });

  closeBtn?.addEventListener("click", () => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("prod-id").value;
    const productData = {
      name: document.getElementById("prod-name").value.trim(),
      category: document.getElementById("prod-category").value.trim(),
      price: parseFloat(document.getElementById("prod-price").value) || 0,
      image: document.getElementById("prod-image").value.trim() || "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80",
      description: document.getElementById("prod-description").value.trim(),
      inStock: document.getElementById("prod-instock").checked
    };

    try {
      if (id) {
        await StoreDB.updateProduct(id, productData);
      } else {
        await StoreDB.addProduct(productData);
      }

        modal.classList.add("hidden");
        modal.classList.remove("flex");
        renderAdminProducts();
        await updateServerSyncStatus();
        showToast("Changes saved to server automatically.");
    } catch (err) {
        alert("Failed to save product: " + err.message);
        console.error(err);
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
        <td colspan="5" class="table-empty">
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
      </td>
      <td class="cell-price">
        ${escapeHtml(currency)}${Number(prod.price).toFixed(2)}
      </td>
      <td>
        <button
          data-action="toggle-stock" data-id="${escapeHtml(prod.id)}"
          class="stock-pill ${prod.inStock ? 'is-in' : 'is-out'}"
          type="button"
          title="Click to toggle stock status"
        >
          ${prod.inStock ? 'In stock' : 'Sold out'}
        </button>
      </td>
      <td class="cell-actions">
        <button data-action="edit-product" data-id="${escapeHtml(prod.id)}" class="link-btn" type="button" aria-label="Edit ${escapeHtml(prod.name)}">Edit</button>
        <button data-action="delete-product" data-id="${escapeHtml(prod.id)}" class="link-btn link-danger" type="button" aria-label="Delete ${escapeHtml(prod.name)}">Delete</button>
      </td>
    </tr>
  `).join("");
}

async function toggleProductStock(id) {
  const products = StoreDB.getProducts();
  const prod = products.find(p => p.id === id);
  if (prod) {
    await StoreDB.updateProduct(id, { inStock: !prod.inStock });
    renderAdminProducts();
    await updateServerSyncStatus();
    showToast("Stock status saved to server automatically.");
  }
}

function editProduct(id) {
  const products = StoreDB.getProducts();
  const prod = products.find(p => p.id === id);
  if (!prod) return;

  document.getElementById("prod-id").value = prod.id;
  document.getElementById("prod-name").value = prod.name;
  document.getElementById("prod-category").value = prod.category;
  document.getElementById("prod-price").value = prod.price;
  document.getElementById("prod-image").value = prod.image || "";
  document.getElementById("prod-description").value = prod.description || "";
  document.getElementById("prod-instock").checked = prod.inStock;

  document.getElementById("product-modal-title").textContent = "Edit Product";

  const modal = document.getElementById("product-modal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

async function deleteProduct(id) {
  if (confirm("Are you sure you want to delete this product?")) {
    await StoreDB.deleteProduct(id);
    renderAdminProducts();
    await updateServerSyncStatus();
    showToast("Product removed from server automatically.");
  }
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
                <span>${escapeHtml(item.name)} <span class="order-qty">x${escapeHtml(quantityText)}</span></span>
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
        case "toggle-stock":
          await toggleProductStock(id);
          break;
        case "edit-product":
          await editProduct(id);
          break;
        case "delete-product":
          if (confirm("Delete this product?")) {
            await deleteProduct(id);
          }
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
window.toggleProductStock = toggleProductStock;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.changeOrderStatus = changeOrderStatus;
window.deleteOrder = deleteOrder;
