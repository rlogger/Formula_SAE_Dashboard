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
    const message = await response.text();
    throw new Error(message || "Login failed");
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
