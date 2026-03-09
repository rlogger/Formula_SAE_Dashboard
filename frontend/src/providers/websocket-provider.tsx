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

type ConnectionState = "disconnected" | "connected" | "reconnecting" | "failed";

type WebSocketContextType = {
  connected: boolean;
  connectionState: ConnectionState;
  latestFrame: TelemetryFrame | null;
  dataSource: "simulated" | "serial" | "udp_broadcast" | null;
  reconnectAttempt: number;
  connect: () => void;
  disconnect: () => void;
};

export const WebSocketContext = createContext<WebSocketContextType>({
  connected: false,
  connectionState: "disconnected",
  latestFrame: null,
  dataSource: null,
  reconnectAttempt: 0,
  connect: () => {},
  disconnect: () => {},
});

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [connected, setConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [latestFrame, setLatestFrame] = useState<TelemetryFrame | null>(null);
  const [dataSource, setDataSource] = useState<"simulated" | "serial" | "udp_broadcast" | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const wsRef = useRef<TelemetryWebSocket | null>(null);

  const connect = useCallback(() => {
    if (!token || wsRef.current) return;
    const ws = new TelemetryWebSocket(token, {
      onMessage: (data) => {
        if (
          !data ||
          typeof data !== "object" ||
          !("channels" in data) ||
          typeof (data as Record<string, unknown>).channels !== "object"
        ) {
          return;
        }
        const frame = data as TelemetryFrame;
        setLatestFrame(frame);
        if (frame.source) {
          setDataSource(frame.source);
        }
      },
      onOpen: () => {
        setConnected(true);
        setConnectionState("connected");
        setReconnectAttempt(0);
      },
      onClose: (reason) => {
        setConnected(false);
        if (reason === "Unauthorized") {
          setConnectionState("failed");
        }
      },
      onReconnecting: (attempt) => {
        setConnectionState("reconnecting");
        setReconnectAttempt(attempt);
      },
      onReconnectFailed: () => {
        setConnectionState("failed");
      },
    });
    wsRef.current = ws;
    ws.connect();
  }, [token]);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    ws?.disconnect();
    setConnected(false);
    setConnectionState("disconnected");
    setLatestFrame(null);
    setDataSource(null);
    setReconnectAttempt(0);
  }, []);

  useEffect(() => {
    return () => {
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.disconnect();
    };
  }, [token]);

  return (
    <WebSocketContext.Provider
      value={{ connected, connectionState, latestFrame, dataSource, reconnectAttempt, connect, disconnect }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}
