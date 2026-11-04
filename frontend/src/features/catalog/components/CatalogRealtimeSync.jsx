import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  catalogQueryKey,
  readCachedCatalog,
  writeCachedCatalog,
} from '../hooks/useCatalog.js';

/** Keeps the TanStack Query catalog in sync with the public catalog row. */
export default function CatalogRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    let channel = null;
    let supabaseClient = null;
    const reconcile = () => {
      void queryClient.invalidateQueries({ queryKey: catalogQueryKey });
    };

    import('../../auth/supabase.js').then(({ supabase }) => {
      if (!active || !supabase) return;
      supabaseClient = supabase;
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
    });

    return () => {
      active = false;
      if (channel && supabaseClient) void supabaseClient.removeChannel(channel);
    };
  }, [queryClient]);

  return null;
}
