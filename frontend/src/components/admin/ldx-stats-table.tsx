"use client";

import useSWR from "swr";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { LdxFileStats } from "@/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { BarChart3 } from "lucide-react";

export function LdxStatsTable() {
  const { token } = useAuth();
  const { data: stats } = useSWR<LdxFileStats[]>(
    token ? ["/admin/ldx-stats", token] : null,
    ([path, t]: [string, string]) =>
      apiFetch<LdxFileStats[]>(path, {}, t)
  );

  if (!stats || stats.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 className="h-10 w-10" />}
        title="No injection stats"
        description="Stats will appear after LDX files are processed."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>File</TableHead>
          <TableHead className="text-right">Total Injected</TableHead>
          <TableHead className="text-right">Updates</TableHead>
          <TableHead className="text-right">Static</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stats.map((s) => (
          <TableRow key={s.file_name}>
            <TableCell className="font-medium">{s.file_name}</TableCell>
            <TableCell className="text-right">{s.total}</TableCell>
            <TableCell className="text-right">{s.updates}</TableCell>
            <TableCell className="text-right">{s.static}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
