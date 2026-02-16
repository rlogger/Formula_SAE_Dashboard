"use client";

import { useCallback, useEffect, useState } from "react";
import { TelemetryChannel } from "@/types/telemetry";
import { useWebSocket } from "@/hooks/use-websocket";
import { useTelemetry } from "@/hooks/use-telemetry";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectionStatus } from "./connection-status";
import { ChannelSelector } from "./channel-selector";
import { LiveChart } from "./live-chart";
import { TelemetryStats } from "./telemetry-stats";
import { Play, Square } from "lucide-react";

const CHART_COLORS = [
  "hsl(222, 47%, 40%)",
  "hsl(142, 50%, 40%)",
  "hsl(0, 60%, 50%)",
  "hsl(38, 80%, 50%)",
  "hsl(262, 50%, 50%)",
  "hsl(190, 60%, 40%)",
];

type Props = {
  channels: TelemetryChannel[];
};

export function TelemetryDashboard({ channels }: Props) {
  const { connected, latestFrame, connect, disconnect } = useWebSocket();
  const [enabledChannels, setEnabledChannels] = useState<Set<string>>(
    () => new Set(channels.slice(0, 4).map((c) => c.id))
  );

  const enabledArray = Array.from(enabledChannels);
  const { data, clear } = useTelemetry(enabledArray);

  const toggleChannel = useCallback((id: string) => {
    setEnabledChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  const channelMap = new Map(channels.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <ConnectionStatus connected={connected} />
        {!connected ? (
          <Button size="sm" onClick={connect}>
            <Play className="mr-2 h-3 w-3" />
            Connect
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={disconnect}>
            <Square className="mr-2 h-3 w-3" />
            Disconnect
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={clear}>
          Clear Data
        </Button>
      </div>

      <TelemetryStats channels={channels} frame={latestFrame} />

      <div className="grid gap-6 lg:grid-cols-[1fr_250px]">
        <div className="space-y-4">
          {enabledArray.map((chId, i) => {
            const ch = channelMap.get(chId);
            if (!ch) return null;
            return (
              <LiveChart
                key={chId}
                title={ch.name}
                unit={ch.unit}
                data={data[chId] || []}
                color={CHART_COLORS[i % CHART_COLORS.length]}
                min={ch.min}
                max={ch.max}
              />
            );
          })}
          {enabledArray.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Select channels to display charts.
              </CardContent>
            </Card>
          )}
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Channels</CardTitle>
          </CardHeader>
          <CardContent>
            <ChannelSelector
              channels={channels}
              enabled={enabledChannels}
              onToggle={toggleChannel}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
