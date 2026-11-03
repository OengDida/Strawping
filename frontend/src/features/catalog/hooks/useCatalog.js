import { useQuery } from '@tanstack/react-query';

export const catalogQueryKey = ['store', 'catalog'];

const CACHE_PRODUCTS = 'telegram_store_products';
const CACHE_SETTINGS = 'telegram_store_settings';

export function readCachedCatalog() {
  if (typeof window === 'undefined') return undefined;

  try {
    const rawProducts = localStorage.getItem(CACHE_PRODUCTS);
    if (rawProducts === null) return undefined;

    const products = JSON.parse(rawProducts);
    if (!Array.isArray(products)) return undefined;

    let settings = {};
    try {
      settings = JSON.parse(localStorage.getItem(CACHE_SETTINGS) || '{}');
    } catch {
      // Keep usable product data if the cached settings are invalid.
    }

    return { products, settings, updatedAt: null };
  } catch {
    return undefined;
  }
}

export function writeCachedCatalog(catalog) {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(CACHE_PRODUCTS, JSON.stringify(catalog.products ?? []));
    localStorage.setItem(CACHE_SETTINGS, JSON.stringify(catalog.settings ?? {}));
  } catch {
    // Private browsing, disabled storage, or quota exhaustion should not break the app.
  }
}

async function getJson(path, signal) {
  const response = await fetch(`/api/${path}`, {
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json' },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return body;
}

async function fetchCatalog(signal) {
  const cached = readCachedCatalog();

  // Fetch products and settings concurrently. Settings are non-critical to the
  // catalog, so a settings outage does not hide a successful product response.
  const [productResult, settingsResult] = await Promise.all([
    getJson('products', signal),
    getJson('settings', signal).catch((error) => {
      if (signal?.aborted) throw error;
      return { settings: cached?.settings ?? {} };
    }),
  ]);

  const catalog = {
    products: Array.isArray(productResult.products) ? productResult.products : [],
    settings: settingsResult.settings ?? cached?.settings ?? {},
    updatedAt: productResult.updatedAt ?? null,
  };

  writeCachedCatalog(catalog);
  return catalog;
}

export function useCatalog() {
  return useQuery({
    queryKey: catalogQueryKey,
    queryFn: ({ signal }) => fetchCatalog(signal),
    initialData: readCachedCatalog,
    // A local cache is displayed immediately, but the server is always checked
    // on mount so the storefront cannot remain indefinitely stale.
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
    gcTime: 24 * 60 * 60 * 1_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
