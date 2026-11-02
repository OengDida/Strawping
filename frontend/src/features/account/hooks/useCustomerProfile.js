import { useCallback, useEffect, useRef, useState } from 'react';
import { loadMyProfile } from '../accountService.js';

export default function useCustomerProfile(userId) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState('');
  const [loadedForUserId, setLoadedForUserId] = useState(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!userId) {
      setProfile(null);
      setLoading(false);
      setError('');
      setLoadedForUserId(null);
      return null;
    }
    setLoading(true);
    setError('');
    setLoadedForUserId(null);
    try {
      const nextProfile = await loadMyProfile(userId);
      if (requestId !== requestIdRef.current) return null;
      setProfile(nextProfile);
      setLoadedForUserId(userId);
      return nextProfile;
    } catch (loadError) {
      if (requestId !== requestIdRef.current) return null;
      setError(loadError.message || 'Could not load your profile.');
      return null;
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);
  return { profile, setProfile, loading, error, loadedForUserId, reload };
}
