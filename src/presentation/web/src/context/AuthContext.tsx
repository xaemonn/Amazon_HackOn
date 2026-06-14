import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  apiLogin,
  apiLogout,
  apiMe,
  apiUpdateProfile,
  clearToken,
  getToken,
  setToken,
  type Address,
  type AuthCustomer,
} from '../api/client';

interface AuthState {
  user: AuthCustomer | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: { name?: string; phone?: string; address?: Address }) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthCustomer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    apiMe()
      .then((customer) => setUser(customer))
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string) => {
    const { token, customer } = await apiLogin(email);
    setToken(token);
    setUser(customer);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout().catch(() => {});
    clearToken();
    setUser(null);
  }, []);

  const updateUser = useCallback(async (updates: { name?: string; phone?: string; address?: Address }) => {
    const updated = await apiUpdateProfile(updates);
    setUser(updated);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
