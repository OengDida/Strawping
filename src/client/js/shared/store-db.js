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
      if(s.settings&&typeof s.settings==="object"){
        settings={...DEFAULT_SETTINGS,...s.settings};
        localStorage.setItem(this.SETTINGS_KEY,JSON.stringify(settings));
      }
      this.lastSyncOk=true; this.lastSyncError=null;
      this.lastSyncProducts=products; this.lastSyncSettings=settings;
      window.dispatchEvent(new CustomEvent("strawping-sync",{detail:{ok:true,products,settings}}));
      return {ok:true,products,settings};
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
  static async initAdminSync(){await this.syncData(); if(await this.isAuthenticated()) await this.syncOrdersFromServer();}
  static async checkServerStatus(){try{await this.request("status");return true}catch{return false}}
  static getProducts(){try{const x=JSON.parse(localStorage.getItem(this.PRODUCTS_KEY)||"null");return Array.isArray(x)?x:DEFAULT_PRODUCTS}catch{return DEFAULT_PRODUCTS}}
  static async saveProducts(products){
    if(!Array.isArray(products)||products.length>500) throw new Error("Invalid product list");
    const r=await this.request("products",{method:"PUT",body:JSON.stringify({products})});
    localStorage.setItem(this.PRODUCTS_KEY,JSON.stringify(r.products)); return r.products;
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
  static async addProduct(product){const p={...product,id:"prod-"+crypto.randomUUID(),inStock:product.inStock!==false};const existing=this.getProducts().map(item=>p.featured===true?{...item,featured:false}:item);const list=[p,...existing];await this.saveProducts(list);return p}
  static async updateProduct(id,fields){const list=this.getProducts();const i=list.findIndex(p=>p.id===id);if(i<0)return null;if(fields.featured===true)list.forEach((product,index)=>{if(product.id!==id)list[index]={...product,featured:false}});list[i]={...list[i],...fields};await this.saveProducts(list);return list[i]}
  static async deleteProduct(id){await this.saveProducts(this.getProducts().filter(p=>p.id!==id));return true}
  static async getOrders(){try{const r=await this.request("orders");return Array.isArray(r.orders)?r.orders:[]}catch{return []}}
  static async syncOrdersFromServer(){try{const r=await this.request("orders");return r.orders||[]}catch(e){console.warn(e.message);return []}}
  static async addOrder(orderData){const r=await this.request("orders",{method:"POST",body:JSON.stringify(orderData)});return r}
  static async updateOrderStatus(orderId,status){const r=await this.request(`orders/${encodeURIComponent(orderId)}`,{method:"PATCH",body:JSON.stringify({status})});return r.order}
  static async deleteOrder(orderId){await this.request(`orders/${encodeURIComponent(orderId)}`,{method:"DELETE"});return true}
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
