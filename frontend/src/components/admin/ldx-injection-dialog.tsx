"use client";

import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { InjectionLogEntry, LdxReinjectResult, LdxDiffResponse } from "@/types";
import { formatLocalTime } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { FileText, GitCompare } from "lucide-react";

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

  const { data: diff, mutate: mutateDiff } = useSWR<LdxDiffResponse>(
    fileName && token
      ? [`/admin/ldx-files/${encodeURIComponent(fileName)}/diff`, token]
      : null,
    ([path, t]: [string, string]) =>
      apiFetch<LdxDiffResponse>(path, {}, t),
    { revalidateOnFocus: false }
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
      await mutateDiff();
      onReinjected?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reinject file"
      );
    } finally {
      setIsReinjecting(false);
    }
  };

  const changedCount = diff?.entries.filter((e) => e.changed).length ?? 0;

  return (
    <Dialog open={!!fileName} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <DialogTitle>{fileName}</DialogTitle>
            {diff?.short_comment && (
              <p className="text-sm text-muted-foreground mt-1">
                {diff.short_comment}
              </p>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleReinject}
            disabled={!fileName || isReinjecting}
            className="bg-racing hover:bg-racing-hover text-white shrink-0"
          >
            {isReinjecting ? "Reinjecting..." : "Reinject Values"}
          </Button>
        </DialogHeader>

        <Tabs defaultValue="diff">
          <TabsList>
            <TabsTrigger value="diff">
              <GitCompare className="mr-2 h-4 w-4" />
              Preview Changes
              {changedCount > 0 && (
                <Badge variant="default" className="ml-2 bg-racing text-white text-[10px] px-1.5 py-0">
                  {changedCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">
              <FileText className="mr-2 h-4 w-4" />
              Injection History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="diff">
            {diff && diff.entries.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field</TableHead>
                    <TableHead>Current in LDX</TableHead>
                    <TableHead>Stored Value</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diff.entries.map((entry) => (
                    <TableRow key={entry.field_id} className={entry.changed ? "bg-status-warning-muted/30" : ""}>
                      <TableCell className="font-medium">{entry.field_id}</TableCell>
                      <TableCell className="max-w-[150px] truncate text-muted-foreground">
                        {entry.current_value ?? <span className="italic">new</span>}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate font-medium">
                        {entry.new_value}
                      </TableCell>
                      <TableCell>
                        {entry.changed ? (
                          <Badge variant="default" className="bg-status-warning text-white">
                            Changed
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Match</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : diff ? (
              <EmptyState
                icon={<GitCompare className="h-10 w-10" />}
                title="No stored values"
                description="No injection history found for this file."
              />
            ) : null}
          </TabsContent>

          <TabsContent value="history">
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
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
