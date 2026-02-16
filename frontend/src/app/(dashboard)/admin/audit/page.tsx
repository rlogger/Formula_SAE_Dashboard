"use client";

import { useAuditLog } from "@/hooks/use-audit-log";
import { AuditLogTable } from "@/components/admin/audit-log-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/shared/loading-spinner";

export default function AuditPage() {
  const { data: logs, isLoading } = useAuditLog(200);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground">
          Track all form changes across the team.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent Changes</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditLogTable logs={logs || []} />
        </CardContent>
      </Card>
    </div>
  );
}
