"use client";

import useSWR from "swr";
import { apiFetch } from "@/lib/api";
import { useAuth } from "./use-auth";
import { User } from "@/types";

export function useUsers() {
  const { token } = useAuth();
  return useSWR<User[]>(
    token ? ["/admin/users", token] : null,
    ([path, t]: [string, string]) => apiFetch<User[]>(path, {}, t)
  );
}
