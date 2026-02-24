"use client";

import useSWR from "swr";
import { apiFetch } from "@/lib/api";
import { useAuth } from "./use-auth";

type FormValuesResponse = {
  values: Record<string, string | null>;
  timestamps: Record<string, number>;
  previous_values: Record<string, string | null>;
};

export function useFormValues(role: string | null) {
  const { token } = useAuth();
  return useSWR<FormValuesResponse>(
    token && role ? [`/forms/${role}/values`, token] : null,
    ([path, t]: [string, string]) =>
      apiFetch<FormValuesResponse>(path, {}, t)
  );
}
