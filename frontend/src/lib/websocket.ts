import { API_URL } from "./constants";

type WebSocketCallbacks = {
  onMessage: (data: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
};

export class TelemetryWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private token: string;
  private callbacks: WebSocketCallbacks;
  private shouldReconnect = true;

  constructor(token: string, callbacks: WebSocketCallbacks) {
    this.token = token;
    this.callbacks = callbacks;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    let wsBase: string;
    if (API_URL) {
      wsBase = API_URL.replace(/^http/, "ws");
    } else {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsBase = `${proto}//${window.location.host}`;
    }
    this.ws = new WebSocket(
      `${wsBase}/ws/telemetry?token=${encodeURIComponent(this.token)}`
    );

    this.ws.onopen = () => {
      this.callbacks.onOpen?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.callbacks.onMessage(data);
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.callbacks.onClose?.();
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.connect(), 2000);
      }
    };

    this.ws.onerror = (error) => {
      this.callbacks.onError?.(error);
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
