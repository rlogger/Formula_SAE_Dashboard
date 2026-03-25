"use client";

import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { InjectionLogEntry, LdxReinjectResult } from "@/types";
import { formatLocalTime } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
  onReinjected?: () => void;
};

export function LdxInjectionDialog({
  fileName,
  onClose,
  onReinjected,
}: Props) {
  const { token } = useAuth();
  const [isReinjecting, setIsReinjecting] = useState(false);
  const { data: injections, mutate } = useSWR<InjectionLogEntry[]>(
    fileName && token
      ? [`/admin/ldx-files/${encodeURIComponent(fileName)}/injections`, token]
      : null,
    ([path, t]: [string, string]) =>
      apiFetch<InjectionLogEntry[]>(path, {}, t)
  );

  const handleReinject = async () => {
    if (!fileName || !token) return;

    setIsReinjecting(true);
    try {
      const result = await apiFetch<LdxReinjectResult>(
        `/admin/ldx-files/${encodeURIComponent(fileName)}/reinject`,
        { method: "POST" },
        token
      );
      const changed = result.created + result.updated;
      if (changed > 0) {
        toast.success(
          `Restored ${changed} injected value${changed === 1 ? "" : "s"} in ${fileName}`
        );
      } else {
        toast.success(`${fileName} already has all injected values`);
      }
      await mutate();
      onReinjected?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reinject file"
      );
    } finally {
      setIsReinjecting(false);
    }
  };

  return (
    <Dialog open={!!fileName} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between gap-4">
          <DialogTitle>Injections: {fileName}</DialogTitle>
          <Button
            type="button"
            size="sm"
            onClick={handleReinject}
            disabled={!fileName || isReinjecting}
          >
            {isReinjecting ? "Reinjecting..." : "Reinject Values"}
          </Button>
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
