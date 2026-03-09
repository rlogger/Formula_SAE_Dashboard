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
  source: "simulated" | "serial" | "udp_broadcast";
  channels: Record<string, number>;
};

export type SerialConfig = {
  port: string;
  baud_rate: number;
  data_format: "csv" | "motec_binary" | "auto";
  csv_channel_order: string[];
  csv_separator: string;
  timeout: number;
  reconnect_interval: number;
};

export type UdpBroadcastConfig = {
  port: number;
  bind_address: string;
  packet_format: "csv" | "json" | "raw" | "auto";
  csv_channel_order: string[];
  csv_separator: string;
  capture_enabled: boolean;
};

export type UdpStatus = {
  state: "stopped" | "listening" | "receiving" | "error";
  port: number;
  bind_address: string;
  packet_format: string;
  last_frame_time: number;
  frames_received: number;
  packets_received: number;
  errors: number;
  available: boolean;
  capture_enabled: boolean;
  capture_count: number;
};

export type CapturedPacket = {
  timestamp: number;
  source: string;
  size: number;
  hex: string;
  ascii: string;
  parsed_ok: boolean;
  channels: Record<string, number>;
  error: string;
};

export type TelemetrySourceStatus = {
  active_source: "simulated" | "serial" | "udp_broadcast";
  source_preference: string;
  serial: {
    state: "disconnected" | "connecting" | "connected" | "error";
    port: string;
    baud_rate: number;
    format: string;
    last_frame_time: number;
    frames_received: number;
    errors: number;
    available: boolean;
  };
  udp: UdpStatus;
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
