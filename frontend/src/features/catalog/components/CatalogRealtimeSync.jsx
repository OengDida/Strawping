import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../auth/supabase.js';
import {
  catalogQueryKey,
  readCachedCatalog,
  writeCachedCatalog,
} from '../hooks/useCatalog.js';

/** Keeps the TanStack Query catalog in sync with the public catalog row. */
export default function CatalogRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;
    let channel = null;
    const reconcile = () => {
      void queryClient.invalidateQueries({ queryKey: catalogQueryKey });
    };

    const connect = () => {
      if (!active) return;
      channel = supabase
      .channel('public:store_data:products')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'store_data',
          filter: 'key=eq.products',
        },
        (payload) => {
          if (!active) return;

          // A catalog item is removed from the JSON array by updating the row.
          // If the catalog row itself is deleted, reload through the API.
          if (payload.eventType === 'DELETE') {
            reconcile();
            return;
          }

          const products = payload.new?.value;
          if (!Array.isArray(products)) {
            reconcile();
            return;
          }

          queryClient.setQueryData(catalogQueryKey, (current) => {
            const next = {
              products,
              settings: current?.settings ?? readCachedCatalog()?.settings ?? {},
              updatedAt: payload.new?.updated_at ?? new Date().toISOString(),
            };
            writeCachedCatalog(next);
            return next;
          });
        },
      )
      .subscribe((status) => {
        // Fetch once after subscription so changes between the initial HTTP
        // fetch and channel connection cannot leave the cache behind.
        // The initial catalog query already runs on mount. Invalidating again
        // on SUBSCRIBED caused a second full catalog request on every visit.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reconcile();
      });
    };

    // The websocket handshake competes with the HTML/JS/catalog requests on slow mobile
    // networks, so connect only after the page has loaded and gone idle.
    const schedule = () => {
      if ('requestIdleCallback' in window) return window.requestIdleCallback(connect, { timeout: 4000 });
      return window.setTimeout(connect, 2000);
    };
    let handle;
    const start = () => { handle = schedule(); };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });

    return () => {
      active = false;
      window.removeEventListener('load', start);
      if (handle !== undefined) {
        if ('cancelIdleCallback' in window) window.cancelIdleCallback(handle);
        window.clearTimeout(handle);
      }
      if (channel) void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return null;
}
