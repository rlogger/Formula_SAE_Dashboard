import {
  Activity,
  ClipboardList,
  FileText,
  FolderOpen,
  Gauge,
  LayoutDashboard,
  Radio,
  Users,
} from "lucide-react";

export const navItems = [
  { label: "Forms", href: "/forms", icon: ClipboardList },
  { label: "Telemetry", href: "/telemetry", icon: Activity },
] as const;

export const adminItems = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Sensors", href: "/admin/sensors", icon: Gauge },
  { label: "Modem", href: "/admin/modem", icon: Radio },
  { label: "Audit Log", href: "/admin/audit", icon: FileText },
  { label: "LDX Files", href: "/admin/ldx", icon: FolderOpen },
] as const;
