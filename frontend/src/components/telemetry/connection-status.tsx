"use client";

import { Badge } from "@/components/ui/badge";
import { Loader2, Radio, RadioTower, Wifi, WifiOff, XCircle } from "lucide-react";

type ConnectionState = "disconnected" | "connected" | "reconnecting" | "failed";

type Props = {
  connected: boolean;
  connectionState?: ConnectionState;
  dataSource?: "simulated" | "serial" | "udp_broadcast" | null;
  reconnectAttempt?: number;
};

export function ConnectionStatus({ connected, connectionState, dataSource, reconnectAttempt }: Props) {
  if (connectionState === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        Connection Lost
      </Badge>
    );
  }

  if (connectionState === "reconnecting") {
    return (
      <Badge variant="secondary" className="gap-1 bg-yellow-500/20 text-yellow-700 dark:text-yellow-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Reconnecting{reconnectAttempt ? ` (${reconnectAttempt})` : ""}...
      </Badge>
    );
  }

  if (!connected) {
    return (
      <Badge variant="secondary" className="gap-1">
        <WifiOff className="h-3 w-3" />
        Disconnected
      </Badge>
    );
  }

  if (dataSource === "serial") {
    return (
      <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
        <Radio className="h-3 w-3" />
        Live Modem
      </Badge>
    );
  }

  if (dataSource === "udp_broadcast") {
    return (
      <Badge variant="default" className="gap-1 bg-blue-600 hover:bg-blue-700">
        <RadioTower className="h-3 w-3" />
        WiFi Broadcast
      </Badge>
    );
  }

  return (
    <Badge variant="default" className="gap-1">
      <Wifi className="h-3 w-3" />
      Simulated
    </Badge>
  );
}
