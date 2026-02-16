"use client";

import { useContext } from "react";
import { WebSocketContext } from "@/providers/websocket-provider";

export function useWebSocket() {
  return useContext(WebSocketContext);
}
