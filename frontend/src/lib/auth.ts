import { API_URL } from "./constants";

export async function loginRequest(
  username: string,
  password: string
): Promise<string> {
  const body = new URLSearchParams();
  body.set("username", username);
  body.set("password", password);
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    let errorMsg = "Login failed";
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      errorMsg = data.detail || data.message || errorMsg;
    } catch {
      errorMsg = text || errorMsg;
    }
    throw new Error(errorMsg);
  }
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function setStoredToken(token: string): void {
  localStorage.setItem("token", token);
}

export function removeStoredToken(): void {
  localStorage.removeItem("token");
}
