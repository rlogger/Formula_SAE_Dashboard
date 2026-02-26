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
  "powertrain",
] as const;

export const CHART_COLORS = [
  "hsl(222, 47%, 40%)",
  "hsl(142, 50%, 40%)",
  "hsl(0, 60%, 50%)",
  "hsl(38, 80%, 50%)",
  "hsl(262, 50%, 50%)",
  "hsl(190, 60%, 40%)",
];

export const ROUTES = {
  login: "/login",
  dashboard: "/",
  forms: "/forms",
  admin: "/admin",
  adminUsers: "/admin/users",
  adminAudit: "/admin/audit",
  adminLdx: "/admin/ldx",
  adminSensors: "/admin/sensors",
  telemetry: "/telemetry",
} as const;
