import { API_URL } from "./constants";

const DEFAULT_TIMEOUT = 30_000; // 30 seconds

export class ApiError extends Error {
  public readonly status: number;
  public readonly statusText: string;

  constructor(message: string, status: number, statusText: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
  timeout: number = DEFAULT_TIMEOUT
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMsg: string;
      switch (response.status) {
        case 401:
          errorMsg = "Your session has expired. Please sign in again.";
          break;
        case 403:
          errorMsg = "You don't have permission to perform this action.";
          break;
        case 404:
          errorMsg = "The requested resource was not found.";
          break;
        case 429:
          errorMsg = "Too many requests. Please wait a moment and try again.";
          break;
        default:
          errorMsg = "Request failed";
      }

      const text = await response.text();
      try {
        const data = JSON.parse(text);
        if (typeof data.detail === "string") errorMsg = data.detail;
        else if (Array.isArray(data.detail)) errorMsg = data.detail.map((d: { msg?: string }) => d.msg || String(d)).join("; ");
        else if (typeof data.message === "string") errorMsg = data.message;
      } catch {
        if (text) errorMsg = text;
      }

      throw new ApiError(errorMsg, response.status, response.statusText);
    }

    const text = await response.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError("Invalid response from server", response.status, "ParseError");
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(
        "Request timed out. Please check your connection and try again.",
        0,
        "Timeout"
      );
    }
    if (err instanceof TypeError && err.message.includes("fetch")) {
      throw new ApiError(
        "Unable to connect to the server. Please check your network connection.",
        0,
        "NetworkError"
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
