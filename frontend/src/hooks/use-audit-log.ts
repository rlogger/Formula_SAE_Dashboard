"use client";

import useSWR from "swr";
import { apiFetch } from "@/lib/api";
import { useAuth } from "./use-auth";
import { AuditLog } from "@/types";

export function useAuditLog(limit = 100) {
  const { token } = useAuth();
  return useSWR<AuditLog[]>(
    token ? [`/admin/audit?limit=${limit}`, token] : null,
    ([path, t]: [string, string]) => apiFetch<AuditLog[]>(path, {}, t)
  );
}
