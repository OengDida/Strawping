import { useCallback, useEffect, useState } from 'react';
import { loadMyProfile } from '../accountService.js';

export default function useCustomerProfile(userId) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setLoading(false);
      setError('');
      return null;
    }
    setLoading(true);
    setError('');
    try {
      const nextProfile = await loadMyProfile(userId);
      setProfile(nextProfile);
      return nextProfile;
    } catch (loadError) {
      setError(loadError.message || 'Could not load your profile.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { reload(); }, [reload]);
  return { profile, setProfile, loading, error, reload };
}
