"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { DataPoint } from "@/types/telemetry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  title: string;
  unit: string;
  data: DataPoint[];
  color?: string;
  min?: number;
  max?: number;
};

export function LiveChart({
  title,
  unit,
  data,
  color = "hsl(222.2, 47.4%, 11.2%)",
  min,
  max,
}: Props) {
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
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="time"
                tick={false}
                axisLine={false}
                tickLine={false}
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
                labelFormatter={() => ""}
                formatter={(value: number | undefined) => [
                  value !== undefined ? value.toFixed(2) : "--",
                  title,
                ]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
