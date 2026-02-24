export type TelemetryChannel = {
  id: string;
  name: string;
  unit: string;
  min: number;
  max: number;
  group: string;
};

export type TelemetrySensor = {
  id: number;
  sensor_id: string;
  name: string;
  unit: string;
  min_value: number;
  max_value: number;
  group: string;
  sort_order: number;
  enabled: boolean;
};

export type TelemetryFrame = {
  timestamp: number;
  channels: Record<string, number>;
};

export type DataPoint = {
  time: number;
  value: number;
};

export type ChartConfig = {
  id: string;
  channels: string[];
  type: "line" | "gauge" | "numeric";
};

export type DashboardConfig = {
  timeWindow: number;
  charts: ChartConfig[];
};
