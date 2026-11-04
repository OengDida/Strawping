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

async function fetchCatalog(signal) {
  // Plain fetch (no custom headers / no-store) so it can reuse the <link rel="preload"> in
  // index.html and the CDN copy. Freshness comes from realtime sync + staleTime below.
  const response = await fetch('/api/catalog', { signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);

  const cached = readCachedCatalog();
  const catalog = {
    products: Array.isArray(body.products) ? body.products : [],
    settings: body.settings ?? cached?.settings ?? {},
    updatedAt: body.updatedAt ?? null,
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
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
