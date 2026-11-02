const CACHE_PRODUCTS = 'telegram_store_products';
const CACHE_SETTINGS = 'telegram_store_settings';

async function request(path, options = {}) {
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

export async function loadStore() {
  try {
    const [productResult, settingsResult] = await Promise.all([request('products'), request('settings')]);
    const products = Array.isArray(productResult.products) ? productResult.products : [];
    const settings = settingsResult.settings || {};
    localStorage.setItem(CACHE_PRODUCTS, JSON.stringify(products));
    localStorage.setItem(CACHE_SETTINGS, JSON.stringify(settings));
    return { products, settings, online: true };
  } catch (error) {
    let products = [];
    let settings = {};
    try { products = JSON.parse(localStorage.getItem(CACHE_PRODUCTS) || '[]'); } catch {}
    try { settings = JSON.parse(localStorage.getItem(CACHE_SETTINGS) || '{}'); } catch {}
    return { products: Array.isArray(products) ? products : [], settings, online: false, error: error.message };
  }
}

export async function submitOrder(order, accessToken) {
  return request('orders', {
    method: 'POST',
    body: JSON.stringify(order),
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
}
