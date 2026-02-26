"use client";

import React, {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { User } from "@/types";
import { ApiError, apiFetch } from "@/lib/api";
import {
  getStoredToken,
  loginRequest,
  removeStoredToken,
  setStoredToken,
} from "@/lib/auth";

type AuthContextType = {
  user: User | null;
  token: string | null;
  loading: boolean;
  authError: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  authError: null,
  login: async () => { },
  logout: () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    loading: true,
    authError: null,
  });
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLogoutTimer = useCallback(() => {
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
  }, []);

  const logout = useCallback(() => {
    clearLogoutTimer();
    removeStoredToken();
    setState({ user: null, token: null, loading: false, authError: null });
  }, [clearLogoutTimer]);

  const fetchUser = useCallback(async (t: string) => {
    try {
      const u = await apiFetch<User>("/auth/me", {}, t);
      setState({ user: u, token: t, loading: false, authError: null });
    } catch (err) {
      removeStoredToken();
      const isExpired = err instanceof ApiError && err.isUnauthorized;
      setState({
        user: null,
        token: null,
        loading: false,
        authError: isExpired ? "Your session has expired. Please sign in again." : null,
      });
    }
  }, []);

  useEffect(() => {
    const stored = getStoredToken();
    if (stored) {
      fetchUser(stored);
    } else {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [fetchUser]);

  // Listen for storage changes (logout from another tab)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "token" && !e.newValue) {
        setState({ user: null, token: null, loading: false, authError: null });
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const newToken = await loginRequest(username, password);
      setStoredToken(newToken);
      await fetchUser(newToken);
    },
    [fetchUser]
  );

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  authError: string | null;
};
