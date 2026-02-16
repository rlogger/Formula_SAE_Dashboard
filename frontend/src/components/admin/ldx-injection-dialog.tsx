"use client";

import useSWR from "swr";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { InjectionLogEntry } from "@/types";
import { formatLocalTime } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { FileText } from "lucide-react";

type Props = {
  fileName: string | null;
  onClose: () => void;
};

export function LdxInjectionDialog({ fileName, onClose }: Props) {
  const { token } = useAuth();
  const { data: injections } = useSWR<InjectionLogEntry[]>(
    fileName && token
      ? [`/admin/ldx-files/${encodeURIComponent(fileName)}/injections`, token]
      : null,
    ([path, t]: [string, string]) =>
      apiFetch<InjectionLogEntry[]>(path, {}, t)
  );

  return (
    <Dialog open={!!fileName} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Injections: {fileName}</DialogTitle>
        </DialogHeader>
        {injections && injections.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Field ID</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {injections.map((entry, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">
                    {entry.field_id}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {entry.value}
                  </TableCell>
                  <TableCell>
                    <Badge variant={entry.was_update ? "default" : "secondary"}>
                      {entry.was_update ? "Update" : "Static"}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatLocalTime(entry.injected_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : injections ? (
          <EmptyState
            icon={<FileText className="h-10 w-10" />}
            title="No injections recorded"
            description="No values were injected into this file."
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
