"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DataPoint } from "@/types/telemetry";
import { useWebSocket } from "./use-websocket";

const MAX_POINTS = 200;

export function useTelemetry(channels: string[]) {
  const { latestFrame } = useWebSocket();
  const [data, setData] = useState<Record<string, DataPoint[]>>({});
  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  useEffect(() => {
    if (!latestFrame) return;
    setData((prev) => {
      const next = { ...prev };
      for (const ch of channelsRef.current) {
        const value = latestFrame.channels[ch];
        if (value === undefined) continue;
        const point: DataPoint = {
          time: latestFrame.timestamp,
          value,
        };
        const existing = next[ch] || [];
        const updated = [...existing, point];
        next[ch] = updated.length > MAX_POINTS
          ? updated.slice(updated.length - MAX_POINTS)
          : updated;
      }
      return next;
    });
  }, [latestFrame]);

  const clear = useCallback(() => setData({}), []);

  return { data, latestFrame, clear };
}
