"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as api from "@/lib/api";
import type { AuthUser } from "@/lib/api";

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** False until the localStorage session has been rehydrated on mount. */
  isInitialized: boolean;
  role: 'child' | 'parent' | null;
  isParent: boolean;
  isChild: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  register: (
    username: string,
    password: string,
    nickname?: string,
    role?: 'child' | 'parent'
  ) => Promise<AuthUser>;
  logout: () => void;
  refreshUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Rehydrate the session from localStorage on mount so a hard refresh keeps
  // the user logged in (token + user are mirrored there by api.setToken/setStoredUser).
  useEffect(() => {
    const stored = api.getStoredUser();
    const token = api.getToken();
    if (stored && token) {
      api.setToken(token);
      setUser(stored);
    }
    setInitialized(true);
  }, []);

  const applyAuth = useCallback((res: api.AuthResponse) => {
    api.setToken(res.accessToken);
    api.setStoredUser(res.user);
    setUser(res.user);
    return res.user;
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await api.login(username, password);
      return applyAuth(res);
    },
    [applyAuth]
  );

  const register = useCallback(
    async (
      username: string,
      password: string,
      nickname?: string,
      role?: 'child' | 'parent'
    ) => {
      const res = await api.register(username, password, nickname, role);
      return applyAuth(res);
    },
    [applyAuth]
  );

  const logout = useCallback(() => {
    api.setToken(null);
    api.setStoredUser(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback((next: AuthUser) => {
    api.setStoredUser(next);
    setUser(next);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      isInitialized: initialized,
      role: user?.role ?? null,
      isParent: user?.role === 'parent',
      isChild: user?.role === 'child',
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, initialized, login, register, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
