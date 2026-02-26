import { API_URL } from "./constants";

type WebSocketCallbacks = {
  onMessage: (data: unknown) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
};

const MAX_RECONNECT_DELAY = 30_000;
const MAX_RECONNECT_ATTEMPTS = 20;

export class TelemetryWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private token: string;
  private callbacks: WebSocketCallbacks;
  private shouldReconnect = true;
  private attempt = 0;

  constructor(token: string, callbacks: WebSocketCallbacks) {
    this.token = token;
    this.callbacks = callbacks;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    let wsBase: string;
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    if (API_URL.startsWith("http")) {
      wsBase = API_URL.replace(/^http/, "ws");
    } else {
      wsBase = `${proto}//${window.location.host}${API_URL}`;
    }
    this.ws = new WebSocket(
      `${wsBase}/ws/telemetry?token=${encodeURIComponent(this.token)}`
    );

    this.ws.onopen = () => {
      this.attempt = 0;
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
      if (this.shouldReconnect && this.attempt < MAX_RECONNECT_ATTEMPTS) {
        const base = Math.min(1000 * Math.pow(2, this.attempt), MAX_RECONNECT_DELAY);
        const jitter = base * 0.2 * Math.random();
        const delay = base + jitter;
        this.attempt++;
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
      }
    };

    this.ws.onerror = (error) => {
      this.callbacks.onError?.(error);
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.attempt = 0;
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
