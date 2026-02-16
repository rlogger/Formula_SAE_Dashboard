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
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { FileText } from "lucide-react";

type Props = {
  logs: AuditLog[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
};

export function AuditLogTable({ logs, page, totalPages, onPageChange }: Props) {
  if (logs.length === 0 && page === 1) {
    return (
      <EmptyState
        icon={<FileText className="h-10 w-10" />}
        title="No changes recorded"
        description="Form changes will appear here."
      />
    );
  }

  return (
    <div>
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
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
