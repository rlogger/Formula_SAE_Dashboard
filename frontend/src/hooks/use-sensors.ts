"use client";

import useSWR from "swr";
import { apiFetch } from "@/lib/api";
import { useAuth } from "./use-auth";
import { TelemetrySensor } from "@/types/telemetry";

export function useSensors() {
  const { token } = useAuth();
  return useSWR<TelemetrySensor[]>(
    token ? ["/admin/sensors", token] : null,
    ([path, t]: [string, string]) => apiFetch<TelemetrySensor[]>(path, {}, t)
  );
}
