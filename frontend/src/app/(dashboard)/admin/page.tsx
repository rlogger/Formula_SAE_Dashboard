"use client";

import Link from "next/link";
import { Users, FileText, FolderOpen } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUsers } from "@/hooks/use-users";
import { useAuditLog } from "@/hooks/use-audit-log";
import { useLdxFiles } from "@/hooks/use-ldx-files";

export default function AdminPage() {
  const { data: users } = useUsers();
  const { data: logs } = useAuditLog(5);
  const { data: files } = useLdxFiles();

  const stats = [
    {
      label: "Users",
      value: users?.length ?? 0,
      icon: Users,
      href: "/admin/users",
    },
    {
      label: "Recent Changes",
      value: logs?.length ?? 0,
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
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Link key={stat.href} href={stat.href}>
            <Card className="transition-colors hover:bg-accent">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.label}
                </CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stat.value}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
