import { useCallback, useEffect, useState } from 'react';
import type { SizeProfile } from '../utils/sizing';
import { useAuth } from '../context/AuthContext';

const KEY = 'slc_size_profile';

function readLocal(): SizeProfile {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SizeProfile) : {};
  } catch {
    return {};
  }
}

function writeLocal(p: SizeProfile) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

/**
 * Persists the shopper's shoe / apparel sizes in MongoDB (when logged in)
 * and localStorage (as a local cache / offline fallback).
 */
export function useSizeProfile() {
  const { user, updateUser } = useAuth();

  // Initialise from DB if logged in, else from localStorage
  const [profile, setProfile] = useState<SizeProfile>(() => {
    const sp = (user as { sizeProfile?: SizeProfile | null } | null)?.sizeProfile;
    if (sp) {
      writeLocal(sp);
      return sp;
    }
    return readLocal();
  });

  // Sync from user object when it loads/changes (e.g. after login)
  useEffect(() => {
    const sp = (user as { sizeProfile?: SizeProfile | null } | null)?.sizeProfile;
    if (sp) {
      setProfile(sp);
      writeLocal(sp);
    }
  }, [user]);

  // Keep in sync across tabs when not logged in
  useEffect(() => {
    if (user) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setProfile(readLocal());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user]);

  const save = useCallback(async (next: SizeProfile) => {
    setProfile(next);
    writeLocal(next);
    if (user) {
      try {
        await updateUser({ sizeProfile: next });
      } catch {
        // Best-effort — localStorage already saved locally
      }
    }
  }, [user, updateUser]);

  return { profile, save };
}
