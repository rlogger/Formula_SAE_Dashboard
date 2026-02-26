"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DataPoint } from "@/types/telemetry";
import { useWebSocket } from "./use-websocket";

export function useTelemetry(channels: string[], timeWindow: number = 20) {
  const maxPoints = timeWindow * 10;
  const { latestFrame } = useWebSocket();
  const [data, setData] = useState<Record<string, DataPoint[]>>({});
  const channelsRef = useRef(channels);
  channelsRef.current = channels;
  const maxPointsRef = useRef(maxPoints);
  maxPointsRef.current = maxPoints;

  useEffect(() => {
    if (!latestFrame) return;
    setData((prev) => {
      let changed = false;
      let next = prev;

      for (const ch of channelsRef.current) {
        const value = latestFrame.channels[ch];
        if (value === undefined) continue;

        if (!changed) {
          next = { ...prev };
          changed = true;
        }

        const point: DataPoint = {
          time: latestFrame.timestamp,
          value,
        };
        const existing = next[ch] || [];
        const updated = [...existing, point];
        next[ch] = updated.length > maxPointsRef.current
          ? updated.slice(updated.length - maxPointsRef.current)
          : updated;
      }

      return changed ? next : prev;
    });
  }, [latestFrame]);

  const clear = useCallback(() => setData({}), []);

  return { data, latestFrame, clear };
}
