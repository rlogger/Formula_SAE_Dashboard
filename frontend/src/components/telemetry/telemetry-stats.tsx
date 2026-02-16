"use client";

import { TelemetryChannel, TelemetryFrame } from "@/types/telemetry";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
  channels: TelemetryChannel[];
  frame: TelemetryFrame | null;
};

export function TelemetryStats({ channels, frame }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {channels.slice(0, 8).map((ch) => {
        const value = frame?.channels[ch.id];
        return (
          <Card key={ch.id}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{ch.name}</p>
              <p className="text-2xl font-bold tabular-nums">
                {value !== undefined ? value.toFixed(1) : "--"}
              </p>
              <p className="text-xs text-muted-foreground">{ch.unit}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
