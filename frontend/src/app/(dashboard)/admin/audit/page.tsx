"use client";

import { useState } from "react";
import { useAuditLog } from "@/hooks/use-audit-log";
import { AuditLogTable } from "@/components/admin/audit-log-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/shared/loading-spinner";

const PAGE_SIZE = 20;

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAuditLog(page, PAGE_SIZE);

  if (isLoading) return <LoadingSpinner />;

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

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
          <AuditLogTable
            logs={data?.items ?? []}
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>
    </div>
  );
}
