"use client";

import useSWR from "swr";
import { apiFetch } from "@/lib/api";
import { useAuth } from "./use-auth";

export function useRoles() {
  const { token } = useAuth();
  return useSWR<string[]>(
    token ? ["/roles", token] : null,
    ([path, t]: [string, string]) => apiFetch<string[]>(path, {}, t)
  );
}
