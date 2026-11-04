import { useEffect, useState } from 'react';

/** Load the authentication SDK after the storefront has mounted. */
export default function useAuthSession() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    import('../supabase.js').then(({ getCurrentSession, subscribeToAuthChanges, supabase }) => {
      if (!active) return;
      if (!supabase) {
        setLoading(false);
        return;
      }
      unsubscribe = subscribeToAuthChanges((nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setLoading(false);
      });
      return getCurrentSession().then((savedSession) => {
        if (!active) return;
        setSession(savedSession);
        setLoading(false);
      });
    }).catch(() => {
      if (active) {
        setSession(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}
