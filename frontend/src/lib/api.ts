import { API_URL } from "./constants";

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
  if (!response.ok) {
    let errorMsg = "Request failed";
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      errorMsg = data.detail || data.message || errorMsg;
    } catch {
      errorMsg = text || errorMsg;
    }
    throw new Error(errorMsg);
  }
  return response.json() as Promise<T>;
}
