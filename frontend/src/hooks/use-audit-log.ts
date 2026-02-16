"use client";

import useSWR from "swr";
import { apiFetch } from "@/lib/api";
import { useAuth } from "./use-auth";
import { PaginatedAuditLog } from "@/types";

export function useAuditLog(page = 1, pageSize = 20) {
  const { token } = useAuth();
  const offset = (page - 1) * pageSize;
  return useSWR<PaginatedAuditLog>(
    token
      ? [`/admin/audit?offset=${offset}&limit=${pageSize}`, token]
      : null,
    ([path, t]: [string, string]) =>
      apiFetch<PaginatedAuditLog>(path, {}, t)
  );
}
