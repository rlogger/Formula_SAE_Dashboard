"use client";

import { Badge } from "@/components/ui/badge";
import { Radio, Wifi, WifiOff } from "lucide-react";

type Props = {
  connected: boolean;
  dataSource?: "simulated" | "serial" | null;
};

export function ConnectionStatus({ connected, dataSource }: Props) {
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

  return (
    <Badge variant="default" className="gap-1">
      <Wifi className="h-3 w-3" />
      Simulated
    </Badge>
  );
}
