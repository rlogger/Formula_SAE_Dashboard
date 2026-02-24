"use client";

import { useCallback, useRef } from "react";
import useSWR from "swr";
import { apiFetch } from "@/lib/api";
import { useAuth } from "./use-auth";
import { DashboardConfig } from "@/types/telemetry";

const DEFAULT_CONFIG: DashboardConfig = {
  timeWindow: 20,
  charts: [
    { id: "c1", channels: ["speed"], type: "line" },
    { id: "c2", channels: ["rpm"], type: "line" },
    { id: "c3", channels: ["throttle"], type: "line" },
    { id: "c4", channels: ["brake_pressure"], type: "line" },
  ],
};

export function useDashboardPrefs() {
  const { token } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, mutate } = useSWR<DashboardConfig>(
    token ? ["/telemetry/preferences", token] : null,
    async ([path, t]: [string, string]) => {
      const res = await apiFetch<{ config: string | null }>(path, {}, t);
      if (res.config) {
        try {
          return JSON.parse(res.config) as DashboardConfig;
        } catch {
          return DEFAULT_CONFIG;
        }
      }
      return DEFAULT_CONFIG;
    }
  );

  const savePrefs = useCallback(
    (config: DashboardConfig) => {
      mutate(config, false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (!token) return;
        apiFetch("/telemetry/preferences", {
          method: "PUT",
          body: JSON.stringify({ config: JSON.stringify(config) }),
        }, token).catch(() => {});
      }, 1000);
    },
    [token, mutate]
  );

  return {
    config: data ?? DEFAULT_CONFIG,
    isLoading,
    savePrefs,
  };
}
