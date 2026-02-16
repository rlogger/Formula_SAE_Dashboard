"use client";

import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff } from "lucide-react";

type Props = {
  connected: boolean;
};

export function ConnectionStatus({ connected }: Props) {
  return (
    <Badge variant={connected ? "default" : "secondary"} className="gap-1">
      {connected ? (
        <>
          <Wifi className="h-3 w-3" />
          Connected
        </>
      ) : (
        <>
          <WifiOff className="h-3 w-3" />
          Disconnected
        </>
      )}
    </Badge>
  );
}
