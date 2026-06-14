import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export interface AuthCustomer {
  id: string;
  name: string;
  email: string;
}

export interface AuthContextValue {
  customer: AuthCustomer | null;
  sessionToken: string | null;
  loading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'sessionToken';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<AuthCustomer | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchMe = useCallback(async (token: string): Promise<AuthCustomer | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/identity/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data as AuthCustomer;
    } catch {
      return null;
    }
  }, []);

  // On init, read token from localStorage and validate
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    fetchMe(stored).then((cust) => {
      if (cancelled) return;
      if (cust) {
        setCustomer(cust);
        setSessionToken(stored);
      } else {
        // Token invalid — clear it
        localStorage.removeItem(STORAGE_KEY);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [fetchMe]);

  const login = useCallback(async (token: string) => {
    localStorage.setItem(STORAGE_KEY, token);
    setSessionToken(token);
    const cust = await fetchMe(token);
    setCustomer(cust);
  }, [fetchMe]);

  const logout = useCallback(async () => {
    const token = sessionToken ?? localStorage.getItem(STORAGE_KEY);
    try {
      await fetch(`${API_BASE_URL}/api/identity/logout`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {
      // Best-effort logout call
    }
    localStorage.removeItem(STORAGE_KEY);
    setCustomer(null);
    setSessionToken(null);
    navigate('/login');
  }, [sessionToken, navigate]);

  return (
    <AuthContext.Provider value={{ customer, sessionToken, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
