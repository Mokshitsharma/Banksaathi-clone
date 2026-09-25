import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthResponse, User } from '@refera/shared-types';
import { api, setUnauthorizedHandler, tokenStore } from './api';

interface AuthCtx {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const logout = () => {
    tokenStore.clear();
    setUser(null);
  };

  /** Explicit sign-out also revokes the token server-side (best effort). */
  const signOut = () => {
    if (tokenStore.get()) void api('/auth/logout', { method: 'POST' }).catch(() => undefined).finally(logout);
    else logout();
  };

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) {
      setReady(true);
      return;
    }
    api<User>('/me')
      .then((u) => (u.role === 'admin' ? setUser(u) : logout()))
      .catch(logout)
      .finally(() => setReady(true));
  }, []);

  async function login(email: string, password: string) {
    const res = await api<AuthResponse>('/auth/admin/login', { method: 'POST', body: { email, password } });
    tokenStore.set(res.token);
    setUser(res.user);
  }

  return <Ctx.Provider value={{ user, ready, login, logout: signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
