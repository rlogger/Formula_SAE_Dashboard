import { API_URL } from "./constants";

type WebSocketCallbacks = {
  onMessage: (data: unknown) => void;
  onOpen?: () => void;
  onClose?: (reason?: string) => void;
  onError?: (error: Event) => void;
  onReconnecting?: (attempt: number, maxAttempts: number) => void;
  onReconnectFailed?: () => void;
};

const MAX_RECONNECT_DELAY = 30_000;
const MAX_RECONNECT_ATTEMPTS = 20;
const STALE_CONNECTION_TIMEOUT = 15_000; // 15s without messages = stale

export class TelemetryWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;
  private token: string;
  private callbacks: WebSocketCallbacks;
  private shouldReconnect = true;
  private attempt = 0;
  private lastMessageTime = 0;
  private malformedCount = 0;
  private readonly MAX_MALFORMED = 50;

  constructor(token: string, callbacks: WebSocketCallbacks) {
    this.token = token;
    this.callbacks = callbacks;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    // Clean up any lingering connection
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }

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
      this.malformedCount = 0;
      this.lastMessageTime = Date.now();
      this.startStaleDetection();
      this.callbacks.onOpen?.();
    };

    this.ws.onmessage = (event) => {
      this.lastMessageTime = Date.now();
      try {
        if (typeof event.data !== "string") return;
        const data = JSON.parse(event.data);
        if (!data || typeof data !== "object") return;
        this.callbacks.onMessage(data);
      } catch {
        this.malformedCount++;
        if (this.malformedCount >= this.MAX_MALFORMED) {
          console.warn("[WS] Too many malformed messages, reconnecting...");
          this.forceReconnect();
        }
      }
    };

    this.ws.onclose = (event) => {
      this.stopStaleDetection();
      const reason = event.reason || (event.code === 4001 ? "Unauthorized" : undefined);
      this.callbacks.onClose?.(reason);

      // Don't reconnect on auth failures
      if (event.code === 4001) {
        this.shouldReconnect = false;
      }

      if (this.shouldReconnect && this.attempt < MAX_RECONNECT_ATTEMPTS) {
        const base = Math.min(1000 * Math.pow(2, this.attempt), MAX_RECONNECT_DELAY);
        const jitter = base * 0.2 * Math.random();
        const delay = base + jitter;
        this.attempt++;
        this.callbacks.onReconnecting?.(this.attempt, MAX_RECONNECT_ATTEMPTS);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
      } else if (this.shouldReconnect && this.attempt >= MAX_RECONNECT_ATTEMPTS) {
        this.callbacks.onReconnectFailed?.();
      }
    };

    this.ws.onerror = (error) => {
      this.callbacks.onError?.(error);
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.attempt = 0;
    this.stopStaleDetection();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get reconnectAttempt(): number {
    return this.attempt;
  }

  private forceReconnect(): void {
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  private startStaleDetection(): void {
    this.stopStaleDetection();
    this.staleTimer = setInterval(() => {
      if (this.lastMessageTime && Date.now() - this.lastMessageTime > STALE_CONNECTION_TIMEOUT) {
        console.warn("[WS] Connection appears stale, reconnecting...");
        this.forceReconnect();
      }
    }, 5000);
  }

  private stopStaleDetection(): void {
    if (this.staleTimer) {
      clearInterval(this.staleTimer);
      this.staleTimer = null;
    }
  }
}
