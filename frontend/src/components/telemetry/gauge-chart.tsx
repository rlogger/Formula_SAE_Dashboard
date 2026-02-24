"use client";

import { useMemo } from "react";
import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  PolarAngleAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  title: string;
  unit: string;
  value: number | null;
  min: number;
  max: number;
  color?: string;
};

export function GaugeChart({
  title,
  unit,
  value,
  min,
  max,
  color = "hsl(222, 47%, 40%)",
}: Props) {
  const displayValue = value ?? 0;
  const range = max - min || 1;
  const percent = Math.max(0, Math.min(100, ((displayValue - min) / range) * 100));

  const data = useMemo(
    () => [{ name: title, value: percent, fill: color }],
    [title, percent, color]
  );

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
          <ResponsiveContainer width="100%" height={150}>
            <RadialBarChart
              cx="50%"
              cy="100%"
              innerRadius="80%"
              outerRadius="100%"
              startAngle={180}
              endAngle={0}
              data={data}
              barSize={12}
            >
              <PolarAngleAxis
                type="number"
                domain={[0, 100]}
                angleAxisId={0}
                tick={false}
              />
              <RadialBar
                background={{ fill: "hsl(var(--muted))" }}
                dataKey="value"
                cornerRadius={6}
                angleAxisId={0}
              />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="text-center -mt-8">
            <p className="text-3xl font-bold tabular-nums">
              {value !== null ? displayValue.toFixed(1) : "--"}
            </p>
            <p className="text-xs text-muted-foreground">
              {min} — {max} {unit}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
