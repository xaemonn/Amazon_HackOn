import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  apiDemoLogin,
  apiLogin,
  apiLogout,
  apiMe,
  apiSignup,
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
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  demoLogin: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: { name?: string; phone?: string; address?: Address }) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthCustomer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) { setIsLoading(false); return; }
    apiMe()
      .then((customer) => setUser(customer))
      .catch(() => { clearToken(); setUser(null); })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token, customer } = await apiLogin(email, password);
    setToken(token);
    setUser(customer);
  }, []);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const { token, customer } = await apiSignup(name, email, password);
    setToken(token);
    setUser(customer);
  }, []);

  const demoLogin = useCallback(async () => {
    const { token, customer } = await apiDemoLogin();
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
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, signup, demoLogin, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
