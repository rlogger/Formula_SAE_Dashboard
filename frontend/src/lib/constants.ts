export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "/api";

export const ROLES = [
  "DAQ",
  "Chief",
  "suspension",
  "electronic",
  "drivetrain",
  "driver",
  "chasis",
  "aero",
  "ergo",
] as const;

export const ROUTES = {
  login: "/login",
  dashboard: "/",
  forms: "/forms",
  admin: "/admin",
  adminUsers: "/admin/users",
  adminAudit: "/admin/audit",
  adminLdx: "/admin/ldx",
  telemetry: "/telemetry",
} as const;
