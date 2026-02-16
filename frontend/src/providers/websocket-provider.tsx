"use client";

import React, {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { TelemetryWebSocket } from "@/lib/websocket";
import { TelemetryFrame } from "@/types/telemetry";
import { useAuth } from "@/hooks/use-auth";

type WebSocketContextType = {
  connected: boolean;
  latestFrame: TelemetryFrame | null;
  connect: () => void;
  disconnect: () => void;
};

export const WebSocketContext = createContext<WebSocketContextType>({
  connected: false,
  latestFrame: null,
  connect: () => {},
  disconnect: () => {},
});

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [connected, setConnected] = useState(false);
  const [latestFrame, setLatestFrame] = useState<TelemetryFrame | null>(null);
  const wsRef = useRef<TelemetryWebSocket | null>(null);

  const connect = useCallback(() => {
    if (!token || wsRef.current) return;
    const ws = new TelemetryWebSocket(token, {
      onMessage: (data) => setLatestFrame(data as TelemetryFrame),
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
    });
    wsRef.current = ws;
    ws.connect();
  }, [token]);

  const disconnect = useCallback(() => {
    wsRef.current?.disconnect();
    wsRef.current = null;
    setConnected(false);
    setLatestFrame(null);
  }, []);

  useEffect(() => {
    return () => {
      wsRef.current?.disconnect();
      wsRef.current = null;
    };
  }, []);

  return (
    <WebSocketContext.Provider
      value={{ connected, latestFrame, connect, disconnect }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}
