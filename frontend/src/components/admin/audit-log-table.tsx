"use client";

import { AuditLog } from "@/types";
import { formatLocalTime } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { FileText } from "lucide-react";

type Props = {
  logs: AuditLog[];
};

export function AuditLogTable({ logs }: Props) {
  if (logs.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-10 w-10" />}
        title="No changes recorded"
        description="Form changes will appear here."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Form</TableHead>
          <TableHead>Field</TableHead>
          <TableHead>Old Value</TableHead>
          <TableHead>New Value</TableHead>
          <TableHead>When</TableHead>
          <TableHead>User</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow key={log.id}>
            <TableCell className="font-medium">{log.form_name}</TableCell>
            <TableCell>{log.field_name}</TableCell>
            <TableCell className="max-w-[150px] truncate text-muted-foreground">
              {log.old_value || "-"}
            </TableCell>
            <TableCell className="max-w-[150px] truncate">
              {log.new_value || "-"}
            </TableCell>
            <TableCell className="whitespace-nowrap text-sm">
              {formatLocalTime(log.changed_at)}
            </TableCell>
            <TableCell>
              {log.changed_by_name || log.changed_by || "N/A"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
