import { useQuery } from '@tanstack/react-query';

export const catalogQueryKey = ['store', 'catalog'];
const settingsQueryKey = ['store', 'settings'];
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
    try { settings = JSON.parse(localStorage.getItem(CACHE_SETTINGS) || '{}'); } catch {}
    return { products, settings, updatedAt: null };
  } catch { return undefined; }
}

export function writeCachedCatalog(catalog) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_PRODUCTS, JSON.stringify(catalog.products ?? []));
    localStorage.setItem(CACHE_SETTINGS, JSON.stringify(catalog.settings ?? {}));
  } catch { /* Storage may be disabled or full. */ }
}

async function getJson(path, signal) {
  const response = await fetch(`/api/${path}`, {
    cache: 'no-store', signal, headers: { Accept: 'application/json' },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

/** Products are the critical path. Settings are fetched separately and never block the catalog. */
export function useCatalog() {
  const cached = readCachedCatalog();
  const productsQuery = useQuery({
    queryKey: catalogQueryKey,
    queryFn: async ({ signal }) => {
      const result = await getJson('products', signal);
      const products = Array.isArray(result.products) ? result.products : [];
      const latest = { products, settings: readCachedCatalog()?.settings ?? {}, updatedAt: result.updatedAt ?? null };
      writeCachedCatalog(latest);
      return latest;
    },
    initialData: cached,
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
    gcTime: 24 * 60 * 60 * 1_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const settingsQuery = useQuery({
    queryKey: settingsQueryKey,
    queryFn: async ({ signal }) => {
      const result = await getJson('settings', signal);
      const settings = result.settings ?? {};
      const products = productsQuery.data?.products ?? readCachedCatalog()?.products ?? [];
      writeCachedCatalog({ products, settings, updatedAt: productsQuery.data?.updatedAt ?? null });
      return settings;
    },
    initialData: cached?.settings ?? {},
    staleTime: 60_000,
    gcTime: 24 * 60 * 60 * 1_000,
    retry: 1,
  });

  return {
    ...productsQuery,
    data: {
      products: productsQuery.data?.products ?? [],
      settings: settingsQuery.data ?? cached?.settings ?? {},
      updatedAt: productsQuery.data?.updatedAt ?? null,
    },
    isError: productsQuery.isError,
    error: productsQuery.error,
  };
}
