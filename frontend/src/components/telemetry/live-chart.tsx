"use client";

import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { DataPoint } from "@/types/telemetry";
import { CHART_COLORS } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatTime(unix: number): string {
  const d = new Date(unix * 1000);
  const m = d.getMinutes().toString().padStart(2, "0");
  const s = d.getSeconds().toString().padStart(2, "0");
  return `${m}:${s}`;
}

export type ChartSeries = {
  channelId: string;
  label: string;
  color?: string;
  data: DataPoint[];
};

type Props = {
  title: string;
  unit: string;
  series: ChartSeries[];
  timeWindow?: number;
  min?: number;
  max?: number;
};

export const LiveChart = React.memo(function LiveChart({
  title,
  unit,
  series,
  timeWindow = 20,
  min,
  max,
}: Props) {
  // Merge all series into a single array keyed by time
  const { merged, domain } = useMemo(() => {
    const timeMap = new Map<number, Record<string, number>>();
    let latestTime = 0;

    for (const s of series) {
      for (const pt of s.data) {
        if (pt.time > latestTime) latestTime = pt.time;
        const existing = timeMap.get(pt.time) || { time: pt.time };
        existing[s.channelId] = pt.value;
        timeMap.set(pt.time, existing);
      }
    }

    const merged = Array.from(timeMap.values()).sort(
      (a, b) => (a.time as number) - (b.time as number)
    );

    const dom: [number, number] =
      latestTime === 0
        ? [0, timeWindow]
        : [latestTime - timeWindow, latestTime];

    return { merged, domain: dom };
  }, [series, timeWindow]);

  const isMulti = series.length > 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {title}{" "}
          <span className="text-muted-foreground font-normal">({unit})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={merged}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="time"
                type="number"
                domain={domain}
                tickFormatter={formatTime}
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[min ?? "auto", max ?? "auto"]}
                tick={{ fontSize: 11 }}
                width={45}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "var(--radius)",
                  fontSize: 12,
                }}
                labelFormatter={(label) => formatTime(Number(label))}
                formatter={(value) => [
                  typeof value === "number" ? value.toFixed(2) : "--",
                ]}
              />
              {isMulti && <Legend />}
              {series.map((s, i) => (
                <Line
                  key={s.channelId}
                  type="monotone"
                  dataKey={s.channelId}
                  name={s.label}
                  stroke={s.color || CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
});
