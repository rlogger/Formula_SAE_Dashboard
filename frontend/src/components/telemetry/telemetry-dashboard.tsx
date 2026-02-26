"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TelemetryChannel, ChartConfig, DashboardConfig } from "@/types/telemetry";
import { CHART_COLORS } from "@/lib/constants";
import { useWebSocket } from "@/hooks/use-websocket";
import { useTelemetry } from "@/hooks/use-telemetry";
import { useDashboardPrefs } from "@/hooks/use-dashboard-prefs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConnectionStatus } from "./connection-status";
import { ChannelSelector } from "./channel-selector";
import { LiveChart, ChartSeries } from "./live-chart";
import { GaugeChart } from "./gauge-chart";
import { NumericChart } from "./numeric-chart";
import { AddChartDialog } from "./add-chart-dialog";
import { TelemetryStats } from "./telemetry-stats";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Play, Square, Plus, MoreVertical, BarChart3 } from "lucide-react";

type Props = {
  channels: TelemetryChannel[];
};

export function TelemetryDashboard({ channels }: Props) {
  const { connected, latestFrame, connect, disconnect } = useWebSocket();
  const { config, isLoading: prefsLoading, savePrefs } = useDashboardPrefs();

  const [charts, setCharts] = useState<ChartConfig[]>(config.charts);
  const [timeWindow, setTimeWindow] = useState(config.timeWindow);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  // Sync from loaded prefs
  useEffect(() => {
    if (!prefsLoading) {
      setCharts(config.charts);
      setTimeWindow(config.timeWindow);
    }
  }, [config, prefsLoading]);

  // Collect all unique channel IDs that are needed
  const allChannelIds = useMemo(() => {
    const set = new Set<string>();
    for (const chart of charts) {
      for (const ch of chart.channels) set.add(ch);
    }
    return Array.from(set);
  }, [charts]);

  const { data, clear } = useTelemetry(allChannelIds, timeWindow);

  const channelMap = useMemo(
    () => new Map(channels.map((c) => [c.id, c])),
    [channels]
  );

  // Quick toggle adds/removes single-channel line chart
  const enabledChannels = useMemo(() => {
    const set = new Set<string>();
    for (const chart of charts) {
      for (const ch of chart.channels) set.add(ch);
    }
    return set;
  }, [charts]);

  const persistConfig = useCallback(
    (newCharts: ChartConfig[], newWindow?: number) => {
      const cfg: DashboardConfig = {
        timeWindow: newWindow ?? timeWindow,
        charts: newCharts,
      };
      savePrefs(cfg);
    },
    [timeWindow, savePrefs]
  );

  const toggleChannel = useCallback(
    (id: string) => {
      setCharts((prev) => {
        // Check if there's a single-channel line chart for this channel
        const idx = prev.findIndex(
          (c) => c.channels.length === 1 && c.channels[0] === id && c.type === "line"
        );
        let next: ChartConfig[];
        if (idx >= 0) {
          next = prev.filter((_, i) => i !== idx);
        } else {
          next = [...prev, { id: `c_${Date.now()}`, channels: [id], type: "line" }];
        }
        persistConfig(next);
        return next;
      });
    },
    [persistConfig]
  );

  const handleAddChart = useCallback(
    (chart: ChartConfig) => {
      setCharts((prev) => {
        const next = [...prev, chart];
        persistConfig(next);
        return next;
      });
    },
    [persistConfig]
  );

  const removeChart = useCallback(
    (chartId: string) => {
      setCharts((prev) => {
        const next = prev.filter((c) => c.id !== chartId);
        persistConfig(next);
        return next;
      });
    },
    [persistConfig]
  );

  const changeChartType = useCallback(
    (chartId: string, newType: ChartConfig["type"]) => {
      setCharts((prev) => {
        const next = prev.map((c) => {
          if (c.id !== chartId) return c;
          // Gauge/numeric only support single channel
          const chs = newType !== "line" ? [c.channels[0]] : c.channels;
          return { ...c, type: newType, channels: chs };
        });
        persistConfig(next);
        return next;
      });
    },
    [persistConfig]
  );

  const handleTimeWindowChange = useCallback(
    (value: string) => {
      const tw = parseInt(value);
      setTimeWindow(tw);
      persistConfig(charts, tw);
    },
    [charts, persistConfig]
  );

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

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
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Window:</span>
          <Select value={String(timeWindow)} onValueChange={handleTimeWindowChange}>
            <SelectTrigger className="w-[80px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10s</SelectItem>
              <SelectItem value="20">20s</SelectItem>
              <SelectItem value="30">30s</SelectItem>
              <SelectItem value="60">60s</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAddDialogOpen(true)}>
          <Plus className="mr-2 h-3 w-3" />
          Add Chart
        </Button>
      </div>

      <TelemetryStats channels={channels} frame={latestFrame} />

      <div className="grid gap-6 lg:grid-cols-[1fr_250px]">
        <div className="space-y-4">
          {charts.map((chart) => {
            const firstCh = channelMap.get(chart.channels[0]);
            if (!firstCh) return null;

            if (chart.type === "gauge") {
              const value = latestFrame?.channels[chart.channels[0]] ?? null;
              return (
                <div key={chart.id} className="relative group">
                  <GaugeChart
                    title={firstCh.name}
                    unit={firstCh.unit}
                    value={value}
                    min={firstCh.min}
                    max={firstCh.max}
                    color={CHART_COLORS[0]}
                  />
                  <ChartControls
                    chartId={chart.id}
                    chartType={chart.type}
                    onChangeType={changeChartType}
                    onRemove={removeChart}
                  />
                </div>
              );
            }

            if (chart.type === "numeric") {
              return (
                <div key={chart.id} className="relative group">
                  <NumericChart
                    title={firstCh.name}
                    unit={firstCh.unit}
                    data={data[chart.channels[0]] || []}
                    min={firstCh.min}
                    max={firstCh.max}
                  />
                  <ChartControls
                    chartId={chart.id}
                    chartType={chart.type}
                    onChangeType={changeChartType}
                    onRemove={removeChart}
                  />
                </div>
              );
            }

            // Line chart (supports multi-series)
            const series: ChartSeries[] = chart.channels
              .map((chId, i) => {
                const ch = channelMap.get(chId);
                if (!ch) return null;
                return {
                  channelId: chId,
                  label: ch.name,
                  color: CHART_COLORS[i % CHART_COLORS.length],
                  data: data[chId] || [],
                };
              })
              .filter(Boolean) as ChartSeries[];

            const title =
              series.length === 1
                ? series[0].label
                : series.map((s) => s.label).join(", ");

            const unit =
              series.length === 1
                ? firstCh.unit
                : Array.from(new Set(chart.channels.map((id) => channelMap.get(id)?.unit || ""))).join(
                    " / "
                  );

            return (
              <div key={chart.id} className="relative group">
                <LiveChart
                  title={title}
                  unit={unit}
                  series={series}
                  timeWindow={timeWindow}
                  min={series.length === 1 ? firstCh.min : undefined}
                  max={series.length === 1 ? firstCh.max : undefined}
                />
                <ChartControls
                  chartId={chart.id}
                  chartType={chart.type}
                  onChangeType={changeChartType}
                  onRemove={removeChart}
                />
              </div>
            );
          })}
          {charts.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <BarChart3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium">No charts configured</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Use &quot;Add Chart&quot; or toggle channels from the sidebar to get started.
                </p>
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

      <AddChartDialog
        open={addDialogOpen}
        channels={channels}
        onClose={() => setAddDialogOpen(false)}
        onAdd={handleAddChart}
      />
    </div>
  );
}

function ChartControls({
  chartId,
  chartType,
  onChangeType,
  onRemove,
}: {
  chartId: string;
  chartType: ChartConfig["type"];
  onChangeType: (id: string, type: ChartConfig["type"]) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(["line", "gauge", "numeric"] as const).map((type) => (
            <DropdownMenuItem
              key={type}
              className={chartType === type ? "font-semibold" : ""}
              onClick={() => onChangeType(chartId, type)}
            >
              {type === "line" ? "Line Chart" : type === "gauge" ? "Gauge" : "Numeric"}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onRemove(chartId)}
          >
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
