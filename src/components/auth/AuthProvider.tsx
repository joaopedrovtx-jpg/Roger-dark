"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AuthUser,
  LoginInput,
  RegisterInput,
  Session,
} from "@/lib/domain/types";
import { authedFetch, clearClientToken } from "@/lib/client/session";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<Session>;
  register: (input: RegisterInput) => Promise<Session>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Super-admin ou gerente (acesso ao painel /admin) */
  isAdmin: boolean;
  /** Apenas role admin (super-admin) */
  isSuperAdmin: boolean;
  /** Role manager */
  isManager: boolean;
  isSeller: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function authJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(`/api/v1/auth${path}`, init);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string; hint?: string };
      if (body.error) {
        message = body.hint ? `${body.error}. ${body.hint}` : body.error;
      }
    } catch {
      /* ignore */
    }
    throw new Error(message || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await authJson<AuthUser>("/me");
      setUser(me);
    } catch {
      setUser(null);
      clearClientToken();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (input: LoginInput) => {
    // Sessão só via cookie httpOnly — sem token no JS
    clearClientToken();
    const data = await authJson<{ user: AuthUser; expiresAt?: string }>(
      "/login",
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
    setUser(data.user);
    return {
      user: data.user,
      token: "",
      expiresAt: data.expiresAt || new Date().toISOString(),
    } satisfies Session;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    clearClientToken();
    const data = await authJson<Session | { user: AuthUser; expiresAt?: string }>(
      "/register",
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
    const user = "user" in data && data.user ? data.user : (data as Session).user;
    setUser(user);
    return {
      user,
      token: "",
      expiresAt:
        ("expiresAt" in data && data.expiresAt) ||
        new Date().toISOString(),
    } satisfies Session;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authJson("/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    clearClientToken();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      refresh,
      isAdmin:
        !!user?.roles.includes("admin") ||
        !!user?.roles.includes("manager"),
      isSuperAdmin: !!user?.roles.includes("admin"),
      isManager: !!user?.roles.includes("manager"),
      isSeller: !!user?.roles.includes("seller") || !!user,
    }),
    [user, loading, login, register, logout, refresh]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      user: null,
      loading: false,
      login: async () => {
        throw new Error("AuthProvider ausente");
      },
      register: async () => {
        throw new Error("AuthProvider ausente");
      },
      logout: async () => {},
      refresh: async () => {},
      isAdmin: false,
      isSuperAdmin: false,
      isManager: false,
      isSeller: false,
    };
  }
  return ctx;
}
