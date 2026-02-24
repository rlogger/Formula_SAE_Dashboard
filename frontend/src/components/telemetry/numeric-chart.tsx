"use client";

import { useMemo } from "react";
import { DataPoint } from "@/types/telemetry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

type Props = {
  title: string;
  unit: string;
  data: DataPoint[];
  min?: number;
  max?: number;
};

export function NumericChart({ title, unit, data, min, max }: Props) {
  const { current, trend } = useMemo(() => {
    if (data.length === 0) return { current: null, trend: "flat" as const };

    const current = data[data.length - 1].value;
    if (data.length < 10) return { current, trend: "flat" as const };

    const recent = data.slice(-10);
    const first = recent[0].value;
    const last = recent[recent.length - 1].value;
    const diff = last - first;
    const range = (max ?? 100) - (min ?? 0) || 1;
    const pct = (diff / range) * 100;

    if (pct > 1) return { current, trend: "up" as const };
    if (pct < -1) return { current, trend: "down" as const };
    return { current, trend: "flat" as const };
  }, [data, min, max]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {title}{" "}
          <span className="text-muted-foreground font-normal">({unit})</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] flex flex-col items-center justify-center">
          <div className="flex items-center gap-3">
            <p className="text-5xl font-bold tabular-nums">
              {current !== null ? current.toFixed(1) : "--"}
            </p>
            {trend === "up" && (
              <TrendingUp className="h-8 w-8 text-green-500" />
            )}
            {trend === "down" && (
              <TrendingDown className="h-8 w-8 text-red-500" />
            )}
            {trend === "flat" && (
              <Minus className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <p className="mt-2 text-lg text-muted-foreground">{unit}</p>
          {min !== undefined && max !== undefined && (
            <p className="text-xs text-muted-foreground mt-1">
              Range: {min} — {max}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
