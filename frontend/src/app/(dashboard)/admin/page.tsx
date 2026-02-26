"use client";

import Link from "next/link";
import { Users, FileText, FolderOpen, Gauge, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUsers } from "@/hooks/use-users";
import { useAuditLog } from "@/hooks/use-audit-log";
import { useLdxFiles } from "@/hooks/use-ldx-files";
import { useSensors } from "@/hooks/use-sensors";

export default function AdminPage() {
  const { data: users } = useUsers();
  const { data: auditData } = useAuditLog(1, 5);
  const { data: files } = useLdxFiles();
  const { data: sensors } = useSensors();

  const stats = [
    {
      label: "Users",
      value: users?.length ?? 0,
      icon: Users,
      href: "/admin/users",
    },
    {
      label: "Sensors",
      value: sensors?.length ?? 0,
      icon: Gauge,
      href: "/admin/sensors",
    },
    {
      label: "Total Changes",
      value: auditData?.total ?? 0,
      icon: FileText,
      href: "/admin/audit",
    },
    {
      label: "LDX Files",
      value: files?.length ?? 0,
      icon: FolderOpen,
      href: "/admin/ldx",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Manage users, view audit logs, and configure the system.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.href} href={stat.href}>
            <Card className="transition-colors hover:bg-accent">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.label}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-racing" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stat.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {auditData && auditData.items.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {auditData.items.slice(0, 5).map((entry, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0"
                >
                  <div>
                    <span className="font-medium">{entry.changed_by_name ?? "System"}</span>
                    <span className="text-muted-foreground">
                      {" "}changed{" "}
                    </span>
                    <span className="font-medium">{entry.field_name}</span>
                    <span className="text-muted-foreground">
                      {" "}in{" "}
                    </span>
                    <span>{entry.form_name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                    {new Date(entry.changed_at + "Z").toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
