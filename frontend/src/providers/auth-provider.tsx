"use client";

import React, {
  createContext,
  useCallback,
  useEffect,
  useState,
} from "react";
import { User } from "@/types";
import { apiFetch } from "@/lib/api";
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
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  login: async () => { },
  logout: () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    loading: true,
  });

  const fetchUser = useCallback(async (t: string) => {
    try {
      const u = await apiFetch<User>("/auth/me", {}, t);
      setState({ user: u, token: t, loading: false });
    } catch {
      removeStoredToken();
      setState({ user: null, token: null, loading: false });
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

  const login = useCallback(
    async (username: string, password: string) => {
      const newToken = await loginRequest(username, password);
      setStoredToken(newToken);
      await fetchUser(newToken);
    },
    [fetchUser]
  );

  const logout = useCallback(() => {
    removeStoredToken();
    setState({ user: null, token: null, loading: false });
  }, []);

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
};
