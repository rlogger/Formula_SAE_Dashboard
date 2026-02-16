export type TelemetryChannel = {
  id: string;
  name: string;
  unit: string;
  min: number;
  max: number;
  group: string;
};

export type TelemetryFrame = {
  timestamp: number;
  channels: Record<string, number>;
};

export type DataPoint = {
  time: number;
  value: number;
};
