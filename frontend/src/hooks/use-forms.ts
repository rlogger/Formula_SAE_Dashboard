"use client";

import useSWR from "swr";
import { apiFetch } from "@/lib/api";
import { useAuth } from "./use-auth";
import { FormSchema } from "@/types";

export function useForms() {
  const { token } = useAuth();
  return useSWR<FormSchema[]>(
    token ? ["/forms", token] : null,
    ([path, t]: [string, string]) => apiFetch<FormSchema[]>(path, {}, t)
  );
}
