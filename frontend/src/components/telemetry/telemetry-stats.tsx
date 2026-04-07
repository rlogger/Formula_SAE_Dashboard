"use client";

import React from "react";
import { TelemetryChannel, TelemetryFrame } from "@/types/telemetry";
import { cn } from "@/lib/utils";

type Props = {
  channels: TelemetryChannel[];
  frame: TelemetryFrame | null;
};

export const TelemetryStats = React.memo(
  function TelemetryStats({ channels, frame }: Props) {
    return (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {channels.slice(0, 8).map((ch) => {
          const value = frame?.channels[ch.id];
          const live = value !== undefined;
          return (
            <div key={ch.id} className="rounded-lg border border-border bg-card p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                {ch.name}
              </p>
              <p className={cn(
                "font-heading text-2xl font-bold tabular-nums mt-1 transition-colors",
                live ? "text-racing" : "text-muted-foreground/30"
              )}>
                {live ? value.toFixed(1) : "--"}
              </p>
              <p className="text-xs text-muted-foreground">{ch.unit}</p>
            </div>
          );
        })}
      </div>
    );
  },
  (prev, next) => {
    if (prev.channels !== next.channels) return false;
    if (prev.frame === next.frame) return true;
    if (!prev.frame || !next.frame) return false;
    if (prev.frame.timestamp !== next.frame.timestamp) return false;
    const ids = prev.channels.slice(0, 8).map((c) => c.id);
    return ids.every(
      (id) => prev.frame!.channels[id] === next.frame!.channels[id]
    );
  }
);
