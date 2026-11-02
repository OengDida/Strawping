import { useEffect, useState } from 'react';
import { getCurrentSession, subscribeToAuthChanges, supabase } from '../supabase.js';

/** Restores the persisted Supabase session and keeps React state in sync with auth events. */
export default function useAuthSession() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    const unsubscribe = subscribeToAuthChanges((nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
    });

    getCurrentSession()
      .then((savedSession) => {
        if (!active) return;
        setSession(savedSession);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setLoading(false);
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { session, user: session?.user ?? null, loading };
}
