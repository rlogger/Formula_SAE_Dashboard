"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";
import { SerialConfig, TelemetrySourceStatus } from "@/types/telemetry";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { toast } from "sonner";
import { Radio, RefreshCw, Save } from "lucide-react";

export default function ModemPage() {
  const { token } = useAuth();
  const [status, setStatus] = useState<TelemetrySourceStatus | null>(null);
  const [config, setConfig] = useState<SerialConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [statusData, configData] = await Promise.all([
        apiFetch<TelemetrySourceStatus>("/telemetry/source", {}, token),
        apiFetch<SerialConfig>("/admin/serial/config", {}, token),
      ]);
      setStatus(statusData);
      setConfig(configData);
    } catch {
      toast.error("Failed to load modem status. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh status every 5 seconds
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

  const handleSourceChange = async (source: string) => {
    if (!token) return;
    try {
      await apiFetch("/admin/serial/source", {
        method: "PUT",
        body: JSON.stringify({ source }),
      }, token);
      toast.success(`Telemetry source set to ${source}`);
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

  if (loading) return <LoadingSpinner label="Loading modem configuration..." />;

  const stateColors: Record<string, string> = {
    connected: "bg-green-600",
    connecting: "bg-yellow-500",
    disconnected: "bg-gray-400",
    error: "bg-red-500",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Modem Configuration
        </h1>
        <p className="text-muted-foreground">
          Configure the Digi Bee SX serial modem for live Motec telemetry.
        </p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Modem Status
          </CardTitle>
          <CardDescription>
            Motec CAN &rarr; RS232 &rarr; Digi Bee SX TX &rarr; Digi Bee SX RX &rarr; Dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Active Source</p>
                <Badge
                  variant="default"
                  className={
                    status.active_source === "serial"
                      ? "bg-green-600 hover:bg-green-700 mt-1"
                      : "mt-1"
                  }
                >
                  {status.active_source === "serial" ? "Live Modem" : "Simulated"}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Serial State</p>
                <Badge
                  variant="secondary"
                  className={`${stateColors[status.serial.state] || ""} text-white mt-1`}
                >
                  {status.serial.state}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Frames Received</p>
                <p className="text-lg font-semibold mt-1">
                  {status.serial.frames_received.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Errors</p>
                <p className="text-lg font-semibold mt-1">
                  {status.serial.errors}
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
          <div className="flex items-center gap-4">
            <Select
              value={status?.source_preference || "auto"}
              onValueChange={handleSourceChange}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (prefer modem)</SelectItem>
                <SelectItem value="serial">Serial modem only</SelectItem>
                <SelectItem value="simulated">Simulated only</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleRestart}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Restart Reader
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Serial Configuration */}
      {config && (
        <Card>
          <CardHeader>
            <CardTitle>Serial Port Configuration</CardTitle>
            <CardDescription>
              Settings for the RS232 connection to the Digi Bee SX RX modem.
            </CardDescription>
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
                    setConfig({ ...config, csv_separator: e.target.value })
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
                  Comma-separated sensor IDs matching the order of values in CSV
                  output from the Motec CAN-to-Serial converter
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
    </div>
  );
}
