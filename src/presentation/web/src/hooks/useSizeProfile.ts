import { useCallback, useEffect, useState } from 'react';
import type { SizeProfile } from '../utils/sizing';

const KEY = 'slc_size_profile';

function read(): SizeProfile {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SizeProfile) : {};
  } catch {
    return {};
  }
}

/**
 * Persists the shopper's usual shoe / apparel sizes in localStorage so the
 * size advisor can give personalised, return-reducing recommendations.
 */
export function useSizeProfile() {
  const [profile, setProfile] = useState<SizeProfile>(read);

  // Keep in sync across tabs / components
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setProfile(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const save = useCallback((next: SizeProfile) => {
    setProfile(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }, []);

  return { profile, save };
}
