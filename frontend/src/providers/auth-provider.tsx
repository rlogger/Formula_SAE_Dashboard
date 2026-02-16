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
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async (t: string) => {
    try {
      const u = await apiFetch<User>("/auth/me", {}, t);
      setUser(u);
      setToken(t);
    } catch {
      removeStoredToken();
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stored = getStoredToken();
    if (stored) {
      fetchUser(stored);
    } else {
      setLoading(false);
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
    setUser(null);
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
