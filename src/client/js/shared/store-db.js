// Strawping StoreDB — serverless API. No secrets are stored in the browser.
const DEFAULT_SETTINGS = {
  storeName: "Strawping",
  tagline: "Thoughtfully crafted lifestyle essentials and aesthetic goods.",
  announcement: "✨ Free express doorstep delivery on all orders!",
  announcementActive: true,
  currency: "$",
  contactTelegram: "@didaoeng"
};
const DEFAULT_PRODUCTS = [];
class StoreDB {
  static SETTINGS_KEY="telegram_store_settings"; static PRODUCTS_KEY="telegram_store_products";
  // Product catalog writes are serialized because the API persists the full list.
  static productWriteQueue = Promise.resolve();
  static productRevision = 0;
  static pendingProductWrites = 0;
  static catalogVersion = null;
  static catalogPollTimer = null;
  static catalogPollInFlight = false;
  static catalogPollGeneration = 0;
  static catalogPollVisibilityHandler = null;
  static catalogPollWarningShown = false;
  // Keep admin orders in memory only: order records contain customer PII.
  static adminOrders = [];
  static ordersLoaded = false;
  static orderRevision = 0;
  static orderMutationVersions = new Map();
  static bumpOrderMutationVersion(orderId){
    const key = String(orderId);
    const next = (this.orderMutationVersions.get(key) || 0) + 1;
    this.orderMutationVersions.set(key, next);
    return next;
  }
  // Sync status exposed to the UI so a failed server sync is visible instead of silent.
  static lastSyncOk=false; static lastSyncError=null; static lastSyncProducts=null; static lastSyncSettings=null;
  static getSyncStatus(){return{ok:!!this.lastSyncOk,error:this.lastSyncError}}
  static csrfToken(){return sessionStorage.getItem("strawping_csrf_token")||""}
  static setCsrfToken(token){if(token)sessionStorage.setItem("strawping_csrf_token",token);else sessionStorage.removeItem("strawping_csrf_token")}
  static async request(path, options={}) {
    const headers={"Content-Type":"application/json",...(options.headers||{})};
    const method = options.method ? options.method.toUpperCase() : "GET";
    const needsCsrf = ["PUT","PATCH","DELETE"].includes(method) || path === "notify/test" || path === "images/upload" || path === "inventory/adjust" || path === "auth/logout";
    if(needsCsrf) {
      headers["X-CSRF-Token"]=this.csrfToken();
      let bodyObj = {};
      if (options.body) {
        try { bodyObj = JSON.parse(options.body); } catch {}
      }
      bodyObj.csrfToken = this.csrfToken();
      options.body = JSON.stringify(bodyObj);
    }
    const res=await fetch(`/api/${path}`,{...options,headers,cache:"no-store",credentials:"same-origin"});
    const body=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(body.error||`Request failed (${res.status})`);
    return body;
  }
  static getSettings(){
    const allowed=["storeName","tagline","announcement","announcementActive","currency","contactTelegram"];
    let saved={};try{saved=JSON.parse(localStorage.getItem(this.SETTINGS_KEY)||"{}")}catch{}
    const safe={...DEFAULT_SETTINGS};
    for(const key of allowed) if(saved[key]!==undefined) safe[key]=saved[key];
    return safe;
  }
  static async saveSettings(settings){
    const safe={storeName:String(settings.storeName||"Strawping").slice(0,80),tagline:String(settings.tagline||"").slice(0,240),announcement:String(settings.announcement||"").slice(0,300),announcementActive:settings.announcementActive!==false,currency:String(settings.currency||"$").slice(0,8),contactTelegram:String(settings.contactTelegram||"").slice(0,80)};
    const result=await this.request("settings",{method:"PUT",body:JSON.stringify(safe)});
    localStorage.setItem(this.SETTINGS_KEY,JSON.stringify(result.settings||safe)); return result.settings||safe;
  }
  static async syncFromServer(){return this.syncData()}
  static async syncData(){
    try {
      const [p,s]=await Promise.all([this.request("products"),this.request("settings")]);
      let products=null; let settings=null;
      if(Array.isArray(p.products)){
        localStorage.setItem(this.PRODUCTS_KEY,JSON.stringify(p.products));
        products=p.products;
      }
      if(typeof p.updatedAt==="string") this.catalogVersion=p.updatedAt;
      if(s.settings&&typeof s.settings==="object"){
        settings={...DEFAULT_SETTINGS,...s.settings};
        localStorage.setItem(this.SETTINGS_KEY,JSON.stringify(settings));
      }
      this.lastSyncOk=true; this.lastSyncError=null;
      this.lastSyncProducts=products; this.lastSyncSettings=settings;
      window.dispatchEvent(new CustomEvent("strawping-sync",{detail:{ok:true,products,settings}}));
      return {ok:true,products,settings,catalogVersion:this.catalogVersion};
    } catch(e){
      const message=e.message||"Request failed";
      this.lastSyncOk=false; this.lastSyncError=message;
      this.lastSyncProducts=null; this.lastSyncSettings=null;
      window.dispatchEvent(new CustomEvent("strawping-sync",{detail:{ok:false,error:message}}));
      console.warn("Store API unavailable:",message);
      // Preserve localStorage on sync failure — do not wipe cached products.
      return {ok:false,products:null,settings:null,error:message};
    }
  }
  static async initAdminSync(){
    const dataSync=this.syncData();
    const ordersSync=(async()=>{if(await this.isAuthenticated()) return this.syncOrdersFromServer();return null})();
    const [dataResult]=await Promise.all([dataSync,ordersSync]);
    return dataResult;
  }
  static stopCatalogPolling(){
    this.catalogPollGeneration++;
    if(this.catalogPollTimer){clearInterval(this.catalogPollTimer);this.catalogPollTimer=null;}
    if(this.catalogPollVisibilityHandler){
      document.removeEventListener("visibilitychange",this.catalogPollVisibilityHandler);
      this.catalogPollVisibilityHandler=null;
    }
    this.catalogPollInFlight=false;
  }
  static startCatalogPolling(onUpdate,intervalMs=5000){
    this.stopCatalogPolling();
    const generation=this.catalogPollGeneration;
    this.catalogPollWarningShown=false;
    const poll=async()=>{
      if(generation!==this.catalogPollGeneration||document.visibilityState==="hidden"||this.catalogPollInFlight)return;
      this.catalogPollInFlight=true;
      try{
        const result=await this.request("catalog-version");
        if(generation!==this.catalogPollGeneration)return;
        const nextVersion=typeof result.updatedAt==="string"?result.updatedAt:null;
        if(!nextVersion||!this.catalogVersion){
          if(nextVersion)this.catalogVersion=nextVersion;
          return;
        }
        if(nextVersion===this.catalogVersion||this.pendingProductWrites>0)return;
        const synced=await this.syncData();
        if(generation!==this.catalogPollGeneration||!synced.ok||!Array.isArray(synced.products))return;
        this.catalogVersion=synced.catalogVersion||nextVersion;
        onUpdate?.(synced);
      }catch(error){
        if(generation===this.catalogPollGeneration&&!this.catalogPollWarningShown){
          console.warn("Live catalog check failed:",error.message||"Request failed");
          this.catalogPollWarningShown=true;
        }
      }finally{
        if(generation===this.catalogPollGeneration)this.catalogPollInFlight=false;
      }
    };
    this.catalogPollTimer=setInterval(()=>{void poll();},Math.max(3000,intervalMs));
    this.catalogPollVisibilityHandler=()=>{
      if(document.visibilityState==="visible")void poll();
    };
    document.addEventListener("visibilitychange",this.catalogPollVisibilityHandler);
  }
  static async checkServerStatus(){try{await this.request("status");return true}catch{return false}}
  static getProducts(){try{const x=JSON.parse(localStorage.getItem(this.PRODUCTS_KEY)||"null");return Array.isArray(x)?x:DEFAULT_PRODUCTS}catch{return DEFAULT_PRODUCTS}}
  static writeProductsLocally(products){
    localStorage.setItem(this.PRODUCTS_KEY,JSON.stringify(products));
    this.productRevision++;
  }
  static enqueueCurrentProductsWrite(rollback){
    this.pendingProductWrites++;
    const request = this.productWriteQueue.then(async () => {
      // Read at execution time so later optimistic edits are not lost in a queued write.
      const products = this.getProducts();
      const revision = this.productRevision;
      const result = await this.request("products", {
        method: "PUT",
        body: JSON.stringify({ products })
      });
      // A newer local edit may have happened while the request was in flight.
      if (revision === this.productRevision && Array.isArray(result.products)) {
        this.writeProductsLocally(result.products);
      }
      return result.products;
    });
    const settled = request.catch(error => {
      rollback?.();
      throw error;
    }).finally(() => {
      this.pendingProductWrites=Math.max(0,this.pendingProductWrites-1);
    });
    // Keep later writes running even when this one fails.
    this.productWriteQueue = settled.catch(() => {});
    return settled;
  }
  static addProductOptimistic(product, id = `prod-${crypto.randomUUID()}`) {
    const created = { ...product, id, inStock: product.inStock !== false };
    const current = this.getProducts();
    const previousFeatured = current.filter(item => item.featured === true);
    const next = current.map(item => created.featured === true ? { ...item, featured: false } : item);
    this.writeProductsLocally([created, ...next]);
    const rollback = () => {
      const latest = this.getProducts().filter(item => item.id !== id);
      if (!latest.some(item => item.featured === true)) {
        for (const oldFeatured of previousFeatured) {
          const restored = latest.find(item => item.id === oldFeatured.id);
          if (restored) restored.featured = true;
        }
      }
      this.writeProductsLocally(latest);
    };
    return {
      product: created,
      sync: this.enqueueCurrentProductsWrite(rollback),
      retry: () => this.addProductOptimistic(product, id)
    };
  }
  static updateProductOptimistic(id, fields) {
    const current = this.getProducts();
    const index = current.findIndex(item => item.id === id);
    if (index < 0) return null;
    const before = structuredClone(current);
    const updated = [...current];
    if (fields.featured === true) {
      for (let i = 0; i < updated.length; i++) {
        if (updated[i].id !== id) updated[i] = { ...updated[i], featured: false };
      }
    }
    updated[index] = { ...updated[index], ...fields };
    this.writeProductsLocally(updated);
    const rollback = () => {
      const latest = this.getProducts();
      const target = latest.find(item => item.id === id);
      const original = before.find(item => item.id === id);
      if (target && original) {
        for (const [key, optimisticValue] of Object.entries(fields)) {
          if (JSON.stringify(target[key]) !== JSON.stringify(optimisticValue)) continue;
          if (Object.hasOwn(original, key)) target[key] = original[key];
          else delete target[key];
        }
      }
      if (fields.featured === true && !latest.some(item => item.featured === true)) {
        for (const oldProduct of before.filter(item => item.featured === true && item.id !== id)) {
          const restored = latest.find(item => item.id === oldProduct.id);
          if (restored) restored.featured = true;
        }
      }
      this.writeProductsLocally(latest);
    };
    return {
      product: updated[index],
      sync: this.enqueueCurrentProductsWrite(rollback),
      retry: () => this.updateProductOptimistic(id, fields)
    };
  }
  static deleteProductOptimistic(id) {
    const current = this.getProducts();
    const index = current.findIndex(item => item.id === id);
    if (index < 0) return null;
    const [deleted] = current.splice(index, 1);
    this.writeProductsLocally(current);
    const rollback = () => {
      const latest = this.getProducts();
      if (!latest.some(item => item.id === id)) {
        const restored = { ...deleted };
        // Preserve a later feature selection made while this delete was pending.
        if (restored.featured && latest.some(item => item.featured === true)) {
          restored.featured = false;
        }
        latest.splice(Math.min(index, latest.length), 0, restored);
        this.writeProductsLocally(latest);
      }
    };
    return {
      product: deleted,
      sync: this.enqueueCurrentProductsWrite(rollback),
      retry: () => this.deleteProductOptimistic(id)
    };
  }
  static async saveProducts(products){
    if(!Array.isArray(products)||products.length>500) throw new Error("Invalid product list");
    const before = this.getProducts();
    this.writeProductsLocally(products);
    const result = await this.enqueueCurrentProductsWrite(() => this.writeProductsLocally(before));
    return result;
  }
  static async updateInventory(productId, variantId, changes){
    const payload={productId,variantId:variantId||null,...changes};
    return this.request("inventory/adjust",{method:"POST",body:JSON.stringify(payload)});
  }
  static async uploadProductImage(image){
    const result=await this.request("images/upload",{method:"POST",body:JSON.stringify({image})});
    if(typeof result.url!=="string"||!result.url) throw new Error("Image upload did not return a URL.");
    return result.url;
  }
  static async addProduct(product){const mutation=this.addProductOptimistic(product);await mutation.sync;return mutation.product}
  static async updateProduct(id,fields){const mutation=this.updateProductOptimistic(id,fields);if(!mutation)return null;await mutation.sync;return mutation.product}
  static async deleteProduct(id){const mutation=this.deleteProductOptimistic(id);if(!mutation)return false;await mutation.sync;return true}
  static getCachedOrders(){return this.adminOrders}
  static async getOrders(){
    if(this.ordersLoaded) return this.adminOrders;
    return this.syncOrdersFromServer();
  }
  static async syncOrdersFromServer(){
    const revision = this.orderRevision;
    try {
      const result = await this.request("orders");
      if(Array.isArray(result.orders) && revision === this.orderRevision) {
        this.adminOrders = result.orders;
        this.ordersLoaded = true;
        this.orderRevision++;
      }
      return this.adminOrders;
    } catch(error) {
      console.warn(error.message);
      return this.adminOrders;
    }
  }
  static async addOrder(orderData){const r=await this.request("orders",{method:"POST",body:JSON.stringify(orderData)});return r}
  static updateOrderStatusOptimistic(orderId,status){
    const index = this.adminOrders.findIndex(order => String(order.id) === String(orderId));
    if(index < 0) return null;
    const previousStatus = this.adminOrders[index].status;
    this.adminOrders = this.adminOrders.map(order => String(order.id) === String(orderId) ? { ...order, status } : order);
    this.orderRevision++;
    const mutationVersion = this.bumpOrderMutationVersion(orderId);
    const rollback = () => {
      if(this.orderMutationVersions.get(String(orderId)) === mutationVersion) {
        this.adminOrders = this.adminOrders.map(order =>
          String(order.id) === String(orderId) ? { ...order, status: previousStatus } : order
        );
        this.orderRevision++;
        this.bumpOrderMutationVersion(orderId);
      }
    };
    const sync = this.request(`orders/${encodeURIComponent(orderId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    }).catch(error => {
      rollback();
      throw error;
    });
    return {
      order: this.adminOrders[index],
      sync,
      retry: () => this.updateOrderStatusOptimistic(orderId, status)
    };
  }
  static async updateOrderStatus(orderId,status){
    const mutation=this.updateOrderStatusOptimistic(orderId,status);
    if(!mutation) return null;
    await mutation.sync;
    return mutation.order;
  }
  static deleteOrderOptimistic(orderId){
    const index = this.adminOrders.findIndex(order => String(order.id) === String(orderId));
    if(index < 0) return null;
    const [deleted] = this.adminOrders.splice(index, 1);
    this.orderRevision++;
    const mutationVersion = this.bumpOrderMutationVersion(orderId);
    const rollback = () => {
      if(this.orderMutationVersions.get(String(orderId)) === mutationVersion && !this.adminOrders.some(order => String(order.id) === String(orderId))) {
        this.adminOrders.splice(Math.min(index, this.adminOrders.length), 0, deleted);
        this.orderRevision++;
        this.bumpOrderMutationVersion(orderId);
      }
    };
    const sync = this.request(`orders/${encodeURIComponent(orderId)}`, {
      method: "DELETE"
    }).catch(error => {
      rollback();
      throw error;
    });
    return {
      order: deleted,
      sync,
      retry: () => this.deleteOrderOptimistic(orderId)
    };
  }
  static async deleteOrder(orderId){const mutation=this.deleteOrderOptimistic(orderId);if(!mutation)return false;await mutation.sync;return true}
  static async isAuthenticated(){
    try {
      const session=await this.request("auth/session");
      this.setCsrfToken(session.csrfToken);
      return true;
    } catch {
      this.setCsrfToken(null);
      return false;
    }
  }
  static async login(password){
    const result=await this.request("auth/login",{method:"POST",body:JSON.stringify({password})});
    this.setCsrfToken(result.csrfToken);
    return true;
  }
  static async logout(){
    try {
      await this.request("auth/logout",{method:"POST",body:"{}"});
    } finally {
      this.setCsrfToken(null);
    }
  }
  static async sendTelegramMessage(){throw new Error("Telegram notifications are sent server-side. Configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in server environment variables.")}
  static formatOrderTelegramMessage(order,settings){return `New Strawping order #${order.id} — ${settings.storeName||"Strawping"}`}
  static async notifyNewOrder(order){return this.lastNotificationSent?{success:true}:{success:false,warning:"Order saved; notification is not configured or delivery could not be confirmed."};}
  static async sendTestTelegram(){return this.request("notify/test",{method:"POST",body:"{}"})}
  static async exportData(){return JSON.stringify({settings:this.getSettings(),products:this.getProducts(),orders:await this.getOrders(),exportedAt:new Date().toISOString()},null,2)}
  static async importData(jsonString){const d=JSON.parse(jsonString);if(d.products)await this.saveProducts(d.products);if(d.settings)await this.saveSettings(d.settings);throw new Error("Order imports are disabled for safety. Exported order data remains available in your backup.");}
  static async resetToDefault(){await this.saveSettings(DEFAULT_SETTINGS);await this.saveProducts(DEFAULT_PRODUCTS);throw new Error("Order deletion/reset must be performed explicitly in the admin order manager.")}
}
window.StoreDB=StoreDB;window.DEFAULT_PRODUCTS=DEFAULT_PRODUCTS;window.DEFAULT_SETTINGS=DEFAULT_SETTINGS;
