"use client";

import useSWR from "swr";
import { apiFetch } from "@/lib/api";
import { useAuth } from "./use-auth";
import { LdxFileInfo } from "@/types";

export function useLdxFiles() {
  const { token } = useAuth();
  return useSWR<LdxFileInfo[]>(
    token ? ["/admin/ldx-files", token] : null,
    ([path, t]: [string, string]) => apiFetch<LdxFileInfo[]>(path, {}, t)
  );
}
