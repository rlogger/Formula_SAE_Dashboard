"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";
import {
  SerialConfig,
  TelemetrySourceStatus,
  UdpBroadcastConfig,
  CapturedPacket,
} from "@/types/telemetry";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { toast } from "sonner";
import {
  Radio,
  RadioTower,
  RefreshCw,
  Save,
  Eye,
  Trash2,
  Check,
  X,
} from "lucide-react";

const SOURCE_LABELS: Record<string, string> = {
  simulated: "Simulated",
  serial: "Live Modem",
  udp_broadcast: "WiFi Broadcast",
};

export default function ModemPage() {
  const { token } = useAuth();
  const [status, setStatus] = useState<TelemetrySourceStatus | null>(null);
  const [config, setConfig] = useState<SerialConfig | null>(null);
  const [udpConfig, setUdpConfig] = useState<UdpBroadcastConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingUdp, setSavingUdp] = useState(false);
  const [capturedPackets, setCapturedPackets] = useState<CapturedPacket[]>([]);
  const [captureLoading, setCaptureLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [statusData, configData, udpData] = await Promise.all([
        apiFetch<TelemetrySourceStatus>("/telemetry/source", {}, token),
        apiFetch<SerialConfig>("/admin/serial/config", {}, token),
        apiFetch<UdpBroadcastConfig>("/admin/udp/config", {}, token),
      ]);
      setStatus(statusData);
      setConfig(configData);
      setUdpConfig(udpData);
    } catch {
      toast.error("Failed to load configuration. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(async () => {
      try {
        const statusData = await apiFetch<TelemetrySourceStatus>(
          "/telemetry/source",
          {},
          token
        );
        setStatus(statusData);
      } catch {
        // ignore polling errors
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [token]);

  const handleSave = async () => {
    if (!token || !config) return;
    setSaving(true);
    try {
      await apiFetch("/admin/serial/config", {
        method: "PUT",
        body: JSON.stringify(config),
      }, token);
      toast.success("Serial configuration updated");
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUdp = async () => {
    if (!token || !udpConfig) return;
    setSavingUdp(true);
    try {
      await apiFetch("/admin/udp/config", {
        method: "PUT",
        body: JSON.stringify(udpConfig),
      }, token);
      toast.success("UDP broadcast configuration updated");
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save UDP config");
    } finally {
      setSavingUdp(false);
    }
  };

  const handleSourceChange = async (source: string) => {
    if (!token) return;
    try {
      await apiFetch("/admin/serial/source", {
        method: "PUT",
        body: JSON.stringify({ source }),
      }, token);
      toast.success(`Telemetry source set to ${SOURCE_LABELS[source] || source}`);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update source");
    }
  };

  const handleRestart = async () => {
    if (!token) return;
    try {
      await apiFetch("/admin/serial/restart", { method: "POST" }, token);
      toast.success("Serial reader restarted");
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restart");
    }
  };

  const handleRestartUdp = async () => {
    if (!token) return;
    try {
      await apiFetch("/admin/udp/restart", { method: "POST" }, token);
      toast.success("UDP listener restarted");
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restart UDP");
    }
  };

  const fetchCapture = useCallback(async () => {
    if (!token) return;
    setCaptureLoading(true);
    try {
      const packets = await apiFetch<CapturedPacket[]>(
        "/admin/udp/capture?limit=100",
        {},
        token
      );
      setCapturedPackets(packets);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch packets");
    } finally {
      setCaptureLoading(false);
    }
  }, [token]);

  const clearCapture = async () => {
    if (!token) return;
    try {
      await apiFetch("/admin/udp/capture/clear", { method: "POST" }, token);
      setCapturedPackets([]);
      toast.success("Capture buffer cleared");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear capture");
    }
  };

  if (loading) return <LoadingSpinner label="Loading configuration..." />;

  const stateColors: Record<string, string> = {
    connected: "bg-green-600",
    connecting: "bg-yellow-500",
    disconnected: "bg-gray-400",
    stopped: "bg-gray-400",
    listening: "bg-blue-500",
    receiving: "bg-green-600",
    error: "bg-red-500",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Telemetry Configuration
        </h1>
        <p className="text-muted-foreground">
          Configure serial modem and WiFi broadcast receiver for live Motec
          telemetry.
        </p>
      </div>

      {/* Combined Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Telemetry Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {status && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <p className="text-sm text-muted-foreground">Active Source</p>
                <Badge
                  variant="default"
                  className={`mt-1 ${
                    status.active_source === "serial"
                      ? "bg-green-600 hover:bg-green-700"
                      : status.active_source === "udp_broadcast"
                      ? "bg-blue-600 hover:bg-blue-700"
                      : ""
                  }`}
                >
                  {SOURCE_LABELS[status.active_source] || status.active_source}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Serial State</p>
                <Badge
                  variant="secondary"
                  className={`${stateColors[status.serial?.state] || ""} text-white mt-1`}
                >
                  {status.serial?.state || "unknown"}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">UDP State</p>
                <Badge
                  variant="secondary"
                  className={`${stateColors[status.udp?.state] || ""} text-white mt-1`}
                >
                  {status.udp?.state || "unknown"}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Serial Frames
                </p>
                <p className="text-lg font-semibold mt-1">
                  {(status.serial?.frames_received ?? 0).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  UDP Packets
                </p>
                <p className="text-lg font-semibold mt-1">
                  {status.udp?.packets_received?.toLocaleString() ?? "0"}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Source Preference */}
      <Card>
        <CardHeader>
          <CardTitle>Telemetry Source</CardTitle>
          <CardDescription>
            Choose which data source to use for the telemetry dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            <Select
              value={status?.source_preference || "auto"}
              onValueChange={handleSourceChange}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  Auto (modem &rarr; broadcast &rarr; sim)
                </SelectItem>
                <SelectItem value="serial">Serial modem only</SelectItem>
                <SelectItem value="udp_broadcast">
                  WiFi broadcast only
                </SelectItem>
                <SelectItem value="simulated">Simulated only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabbed config: Serial / UDP Broadcast / Packet Capture */}
      <Tabs defaultValue="udp" className="space-y-4">
        <TabsList>
          <TabsTrigger value="serial">
            <Radio className="mr-2 h-4 w-4" />
            Serial Modem
          </TabsTrigger>
          <TabsTrigger value="udp">
            <RadioTower className="mr-2 h-4 w-4" />
            WiFi Broadcast
          </TabsTrigger>
          <TabsTrigger value="capture">
            <Eye className="mr-2 h-4 w-4" />
            Packet Capture
          </TabsTrigger>
        </TabsList>

        {/* Serial tab */}
        <TabsContent value="serial">
          {config && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Serial Port Configuration</CardTitle>
                    <CardDescription>
                      RS232 connection to the Digi Bee SX RX modem. Data chain:
                      Motec CAN &rarr; RS232 &rarr; Digi Bee TX &rarr; Digi Bee
                      RX &rarr; Dashboard
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRestart}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Restart
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="port">Serial Port</Label>
                    <Input
                      id="port"
                      value={config.port}
                      onChange={(e) =>
                        setConfig({ ...config, port: e.target.value })
                      }
                      placeholder="/dev/ttyUSB0"
                    />
                    <p className="text-xs text-muted-foreground">
                      Device path for the Digi Bee SX RX modem
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="baud">Baud Rate</Label>
                    <Select
                      value={String(config.baud_rate)}
                      onValueChange={(v) =>
                        setConfig({ ...config, baud_rate: parseInt(v) })
                      }
                    >
                      <SelectTrigger id="baud">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="4800">4800</SelectItem>
                        <SelectItem value="9600">9600</SelectItem>
                        <SelectItem value="19200">19200</SelectItem>
                        <SelectItem value="38400">38400</SelectItem>
                        <SelectItem value="57600">57600</SelectItem>
                        <SelectItem value="115200">115200</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="format">Data Format</Label>
                    <Select
                      value={config.data_format}
                      onValueChange={(v) =>
                        setConfig({
                          ...config,
                          data_format: v as SerialConfig["data_format"],
                        })
                      }
                    >
                      <SelectTrigger id="format">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="csv">CSV (text lines)</SelectItem>
                        <SelectItem value="motec_binary">
                          Motec Binary (CAN frames)
                        </SelectItem>
                        <SelectItem value="auto">Auto-detect</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="separator">CSV Separator</Label>
                    <Input
                      id="separator"
                      value={config.csv_separator}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          csv_separator: e.target.value,
                        })
                      }
                      className="w-20"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="channels">CSV Channel Order</Label>
                    <Input
                      id="channels"
                      value={config.csv_channel_order.join(", ")}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          csv_channel_order: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="speed, rpm, throttle, ..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma-separated sensor IDs matching the order of values in
                      CSV output from the Motec CAN-to-Serial converter
                    </p>
                  </div>
                </div>
                <div className="mt-6">
                  <Button onClick={handleSave} disabled={saving}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving ? "Saving..." : "Save & Apply"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* UDP Broadcast tab */}
        <TabsContent value="udp">
          {udpConfig && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <RadioTower className="h-5 w-5" />
                      WiFi Broadcast Receiver
                    </CardTitle>
                    <CardDescription>
                      Passive UDP listener for broadcast-only telemetry. The car
                      broadcasts packets over WiFi and the dashboard listens
                      &mdash; no two-way connection required. Use the Packet
                      Capture tab to inspect raw traffic (like Wireshark).
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRestartUdp}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Restart
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="udp-port">UDP Port</Label>
                    <Input
                      id="udp-port"
                      type="number"
                      value={udpConfig.port}
                      onChange={(e) =>
                        setUdpConfig({
                          ...udpConfig,
                          port: parseInt(e.target.value) || 50000,
                        })
                      }
                      placeholder="50000"
                    />
                    <p className="text-xs text-muted-foreground">
                      Port to listen on for broadcast packets (1024-65535)
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="udp-bind">Bind Address</Label>
                    <Input
                      id="udp-bind"
                      value={udpConfig.bind_address}
                      onChange={(e) =>
                        setUdpConfig({
                          ...udpConfig,
                          bind_address: e.target.value,
                        })
                      }
                      placeholder="0.0.0.0"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use 0.0.0.0 to listen on all interfaces
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="udp-format">Packet Format</Label>
                    <Select
                      value={udpConfig.packet_format}
                      onValueChange={(v) =>
                        setUdpConfig({
                          ...udpConfig,
                          packet_format:
                            v as UdpBroadcastConfig["packet_format"],
                        })
                      }
                    >
                      <SelectTrigger id="udp-format">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">
                          Auto-detect (CSV or JSON)
                        </SelectItem>
                        <SelectItem value="csv">CSV (text lines)</SelectItem>
                        <SelectItem value="json">
                          JSON (&lcub;&quot;channel&quot;: value&rcub;)
                        </SelectItem>
                        <SelectItem value="raw">
                          Raw (capture only, no parsing)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Set to Raw when Wiresharking unknown traffic
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="udp-sep">CSV Separator</Label>
                    <Input
                      id="udp-sep"
                      value={udpConfig.csv_separator}
                      onChange={(e) =>
                        setUdpConfig({
                          ...udpConfig,
                          csv_separator: e.target.value,
                        })
                      }
                      className="w-20"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="udp-channels">CSV Channel Order</Label>
                    <Input
                      id="udp-channels"
                      value={udpConfig.csv_channel_order.join(", ")}
                      onChange={(e) =>
                        setUdpConfig({
                          ...udpConfig,
                          csv_channel_order: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder="speed, rpm, throttle, ..."
                    />
                  </div>
                  <div className="flex items-center gap-3 sm:col-span-2">
                    <Switch
                      id="capture-toggle"
                      checked={udpConfig.capture_enabled}
                      onCheckedChange={(checked) =>
                        setUdpConfig({
                          ...udpConfig,
                          capture_enabled: checked,
                        })
                      }
                    />
                    <Label htmlFor="capture-toggle">
                      Enable packet capture (for inspection / debugging)
                    </Label>
                  </div>
                </div>
                <div className="mt-6">
                  <Button onClick={handleSaveUdp} disabled={savingUdp}>
                    <Save className="mr-2 h-4 w-4" />
                    {savingUdp ? "Saving..." : "Save & Apply"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Packet Capture tab */}
        <TabsContent value="capture">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Eye className="h-5 w-5" />
                    Packet Capture
                  </CardTitle>
                  <CardDescription>
                    Inspect raw UDP packets received from the WiFi broadcaster.
                    Use this alongside Wireshark to verify packet format and map
                    data fields before switching out of Raw mode.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchCapture}
                    disabled={captureLoading}
                  >
                    <RefreshCw
                      className={`mr-2 h-4 w-4 ${
                        captureLoading ? "animate-spin" : ""
                      }`}
                    />
                    Refresh
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearCapture}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Clear
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {status?.udp && (
                <div className="grid gap-3 sm:grid-cols-4 mb-4">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">
                      Listener State
                    </p>
                    <Badge
                      variant="secondary"
                      className={`${
                        stateColors[status.udp.state] || ""
                      } text-white mt-1`}
                    >
                      {status.udp.state}
                    </Badge>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">
                      Packets Received
                    </p>
                    <p className="text-lg font-semibold">
                      {status.udp.packets_received.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">
                      Parsed Frames
                    </p>
                    <p className="text-lg font-semibold">
                      {status.udp.frames_received.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">
                      Parse Errors
                    </p>
                    <p className="text-lg font-semibold">
                      {status.udp.errors}
                    </p>
                  </div>
                </div>
              )}
              {capturedPackets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Eye className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No captured packets yet. Click Refresh to load the capture
                    buffer, or ensure the UDP listener is running and receiving
                    traffic.
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {capturedPackets.map((pkt, i) => (
                      <div
                        key={i}
                        className="rounded-md border p-3 text-sm font-mono space-y-1"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {new Date(pkt.timestamp * 1000).toLocaleTimeString(
                              [],
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                                fractionalSecondDigits: 3,
                              }
                            )}{" "}
                            &mdash; {pkt.source}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-muted-foreground">
                              {pkt.size} bytes
                            </span>
                            {pkt.parsed_ok ? (
                              <Badge
                                variant="secondary"
                                className="bg-green-600 text-white text-xs px-1.5 py-0"
                              >
                                <Check className="h-3 w-3 mr-0.5" />
                                parsed
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="bg-yellow-500 text-white text-xs px-1.5 py-0"
                              >
                                <X className="h-3 w-3 mr-0.5" />
                                raw
                              </Badge>
                            )}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground break-all">
                          <span className="font-semibold text-foreground">
                            HEX:{" "}
                          </span>
                          {pkt.hex
                            .match(/.{1,2}/g)
                            ?.join(" ")
                            .toUpperCase() || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground break-all">
                          <span className="font-semibold text-foreground">
                            ASCII:{" "}
                          </span>
                          {pkt.ascii || "—"}
                        </div>
                        {pkt.parsed_ok &&
                          Object.keys(pkt.channels).length > 0 && (
                            <div className="text-xs text-green-700 dark:text-green-400">
                              <span className="font-semibold">
                                Channels:{" "}
                              </span>
                              {Object.entries(pkt.channels)
                                .map(([k, v]) => `${k}=${v}`)
                                .join(", ")}
                            </div>
                          )}
                        {pkt.error && (
                          <div className="text-xs text-red-600 dark:text-red-400">
                            Error: {pkt.error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
