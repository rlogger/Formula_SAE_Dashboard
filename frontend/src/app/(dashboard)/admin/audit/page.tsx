"use client";

import { useState } from "react";
import { useAuditLog } from "@/hooks/use-audit-log";
import { AuditLogTable } from "@/components/admin/audit-log-table";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/shared/loading-spinner";

const PAGE_SIZE = 20;

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAuditLog(page, PAGE_SIZE);

  if (isLoading) return <LoadingSpinner label="Loading audit log..." />;

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <h1 className="font-heading text-3xl font-extrabold uppercase tracking-wide">Audit Log</h1>
      <Card>
        <CardContent className="p-0">
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
