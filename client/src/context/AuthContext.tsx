import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthUser } from "@whatsapp/shared";
import { api } from "../lib/api";
import { closeDb } from "../lib/db";
import { disconnectSocket } from "../lib/socket";
import {
  clearSession,
  getStoredToken,
  getStoredUser,
  persistSession,
} from "../lib/session";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (displayName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser);
  const [token, setToken] = useState<string | null>(getStoredToken);
  const [ready, setReady] = useState(!getStoredToken());

  useEffect(() => {
    if (!token) {
      setReady(true);
      return;
    }
    let cancelled = false;
    api
      .me()
      .then(({ user: next }) => {
        if (cancelled) return;
        setUser(next);
        persistSession(token, next);
      })
      .catch(() => {
        if (cancelled) return;
        clearSession();
        setUser(null);
        setToken(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      ready,
      async login(email, password) {
        const res = await api.login({ email, password });
        persistSession(res.token, res.user);
        setToken(res.token);
        setUser(res.user);
      },
      async register(displayName, email, password) {
        const res = await api.register({ displayName, email, password });
        persistSession(res.token, res.user);
        setToken(res.token);
        setUser(res.user);
      },
      logout() {
        disconnectSocket();
        closeDb();
        clearSession();
        setToken(null);
        setUser(null);
      },
    }),
    [user, token, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
