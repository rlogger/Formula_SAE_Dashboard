"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { useForms } from "@/hooks/use-forms";
import { InjectionLogEntry, LdxReinjectResult, LdxDiffResponse } from "@/types";
import { formatLocalTime } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { FileText, GitCompare, ListChecks, RefreshCw, RotateCcw } from "lucide-react";

type Props = {
  fileName: string | null;
  onClose: () => void;
  onReinjected?: () => void;
};

function toFormLabel(formName: string): string {
  return formName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type SelectedField = { form_name: string; field_name: string };

function fieldKey(form_name: string, field_name: string): string {
  return `${form_name}::${field_name}`;
}

export function LdxInjectionDialog({ fileName, onClose, onReinjected }: Props) {
  const { token } = useAuth();
  const [isReinjecting, setIsReinjecting] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());

  const { data: forms } = useForms();

  const { data: injections, mutate } = useSWR<InjectionLogEntry[]>(
    fileName && token
      ? [`/admin/ldx-files/${encodeURIComponent(fileName)}/injections`, token]
      : null,
    ([path, t]: [string, string]) => apiFetch<InjectionLogEntry[]>(path, {}, t)
  );

  const { data: diff, error: diffError, mutate: mutateDiff } = useSWR<LdxDiffResponse>(
    fileName && token
      ? [`/admin/ldx-files/${encodeURIComponent(fileName)}/diff`, token]
      : null,
    ([path, t]: [string, string]) => apiFetch<LdxDiffResponse>(path, {}, t),
    { revalidateOnFocus: false, shouldRetryOnError: false }
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
      toast.success(
        changed > 0
          ? `Restored ${changed} value${changed === 1 ? "" : "s"} in ${fileName}`
          : `${fileName} is already up to date`
      );
      await mutate();
      await mutateDiff();
      onReinjected?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Restore failed");
    } finally {
      setIsReinjecting(false);
    }
  };

  const handleReprocess = async (fields?: SelectedField[]) => {
    if (!fileName || !token) return;
    setIsReprocessing(true);
    try {
      const init: { method: string; body?: string } = { method: "POST" };
      if (fields && fields.length > 0) {
        init.body = JSON.stringify({ fields });
      }
      const result = await apiFetch<LdxReinjectResult>(
        `/admin/ldx-files/${encodeURIComponent(fileName)}/reprocess`,
        init,
        token
      );
      const total = result.created + result.updated + result.unchanged;
      const label = fields && fields.length > 0 ? `${fields.length} selected field${fields.length === 1 ? "" : "s"}` : "current forms";
      toast.success(
        `Reprocessed ${fileName} — ${total} value${total === 1 ? "" : "s"} from ${label}`
      );
      setSelectedFields(new Set());
      await mutate();
      await mutateDiff();
      onReinjected?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reprocess failed");
    } finally {
      setIsReprocessing(false);
    }
  };

  const toggleField = (form_name: string, field_name: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      const k = fieldKey(form_name, field_name);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const toggleFormAll = (form_name: string, field_names: string[], shouldSelect: boolean) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      for (const fn of field_names) {
        const k = fieldKey(form_name, fn);
        if (shouldSelect) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  };

  const selectedList = useMemo<SelectedField[]>(() => {
    return Array.from(selectedFields).map((k) => {
      const [form_name, field_name] = k.split("::");
      return { form_name, field_name };
    });
  }, [selectedFields]);

  const reprocessableForms = useMemo(() => {
    if (!forms) return [];
    return forms.filter((f) => f.fields.length > 0);
  }, [forms]);

  const changedCount = diff?.entries.filter((e) => e.changed).length ?? 0;
  const busy = isReinjecting || isReprocessing;

  // Group injection history by form_name
  const historyByForm = injections?.reduce<Record<string, InjectionLogEntry[]>>(
    (acc, entry) => {
      const key = entry.form_name || "Unknown";
      (acc[key] ??= []).push(entry);
      return acc;
    },
    {}
  );

  return (
    <Dialog open={!!fileName} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="font-mono text-sm font-semibold truncate">{fileName}</DialogTitle>
              {diff?.short_comment && (
                <p className="text-sm text-muted-foreground mt-0.5">{diff.short_comment}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleReinject}
                disabled={!fileName || busy}
                title="Re-apply the values logged when this file was first processed"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {isReinjecting ? "Restoring…" : "Restore"}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => handleReprocess()}
                disabled={!fileName || busy}
                className="bg-racing hover:bg-racing-hover text-white"
                title="Re-inject using latest form values — clears and replaces previous history"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                {isReprocessing ? "Reprocessing…" : "Reprocess All"}
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            <strong>Restore</strong> replays the logged values from first processing.{" "}
            <strong>Reprocess All</strong> replaces history using the latest form values.{" "}
            Use the <strong>Fields</strong> tab to reprocess only specific fields.
          </p>
        </DialogHeader>

        <Tabs defaultValue="diff">
          <TabsList>
            <TabsTrigger value="diff">
              <GitCompare className="mr-2 h-4 w-4" />
              Preview
              {changedCount > 0 && (
                <Badge variant="default" className="ml-2 bg-racing text-white text-[10px] px-1.5 py-0">
                  {changedCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="fields">
              <ListChecks className="mr-2 h-4 w-4" />
              Fields
              {selectedFields.size > 0 && (
                <Badge variant="default" className="ml-2 bg-racing text-white text-[10px] px-1.5 py-0">
                  {selectedFields.size}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">
              <FileText className="mr-2 h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="diff">
            {diff && diff.entries.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Field</TableHead>
                    <TableHead>In File</TableHead>
                    <TableHead>Stored</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diff.entries.map((entry) => (
                    <TableRow key={entry.field_id} className={entry.changed ? "bg-status-warning-muted/30" : ""}>
                      <TableCell className="font-medium font-mono text-xs">{entry.field_id}</TableCell>
                      <TableCell className="max-w-[150px] truncate text-muted-foreground text-sm">
                        {entry.current_value ?? <span className="italic">new</span>}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate font-medium text-sm">
                        {entry.new_value}
                      </TableCell>
                      <TableCell>
                        {entry.changed ? (
                          <Badge variant="default" className="bg-status-warning text-white">Changed</Badge>
                        ) : (
                          <Badge variant="secondary">Match</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : diffError ? (
              <EmptyState
                icon={<GitCompare className="h-10 w-10" />}
                title="No injection history"
                description="This file hasn't been processed yet. Drop it into the watch directory to inject values."
              />
            ) : diff ? (
              <EmptyState
                icon={<GitCompare className="h-10 w-10" />}
                title="All values match"
                description="Every stored value already matches what's in the file."
              />
            ) : null}
          </TabsContent>

          <TabsContent value="fields">
            {reprocessableForms.length > 0 ? (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Select fields to re-inject with their latest values. Unselected fields keep their existing injection history and XML values.
                </p>
                <div className="space-y-3">
                  {reprocessableForms.map((form) => {
                    const allFieldNames = form.fields.map((f) => f.name);
                    const selectedInForm = allFieldNames.filter((fn) =>
                      selectedFields.has(fieldKey(form.form_name, fn))
                    );
                    const allChecked = selectedInForm.length === allFieldNames.length;
                    const someChecked = selectedInForm.length > 0 && !allChecked;
                    return (
                      <div key={form.form_name} className="rounded-md border p-3">
                        <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`form-${form.form_name}`}
                              checked={allChecked ? true : someChecked ? "indeterminate" : false}
                              onCheckedChange={(checked) =>
                                toggleFormAll(form.form_name, allFieldNames, checked === true)
                              }
                            />
                            <label
                              htmlFor={`form-${form.form_name}`}
                              className="text-sm font-semibold cursor-pointer"
                            >
                              {toFormLabel(form.form_name)}
                            </label>
                            {form.admin_only && (
                              <Badge variant="outline" className="text-[10px]">Admin</Badge>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {selectedInForm.length} / {allFieldNames.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {form.fields.map((field) => {
                            const k = fieldKey(form.form_name, field.name);
                            const checked = selectedFields.has(k);
                            return (
                              <label
                                key={field.name}
                                htmlFor={`field-${form.form_name}-${field.name}`}
                                className="flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1 hover:bg-muted/50"
                              >
                                <Checkbox
                                  id={`field-${form.form_name}-${field.name}`}
                                  checked={checked}
                                  onCheckedChange={() => toggleField(form.form_name, field.name)}
                                />
                                <span className="truncate">{field.label}</span>
                                {field.unit && (
                                  <span className="text-[11px] text-muted-foreground shrink-0">
                                    ({field.unit})
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-2 pt-2 border-t sticky bottom-0 bg-background">
                  <span className="text-xs text-muted-foreground">
                    {selectedFields.size} field{selectedFields.size === 1 ? "" : "s"} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedFields(new Set())}
                      disabled={selectedFields.size === 0 || busy}
                    >
                      Clear
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleReprocess(selectedList)}
                      disabled={selectedFields.size === 0 || busy}
                      className="bg-racing hover:bg-racing-hover text-white"
                      title="Re-inject only selected fields, preserving history for the rest"
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      {isReprocessing ? "Reprocessing…" : "Reprocess Selected"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<ListChecks className="h-10 w-10" />}
                title="No forms loaded"
                description="Form definitions are still loading or unavailable."
              />
            )}
          </TabsContent>

          <TabsContent value="history">
            {historyByForm && Object.keys(historyByForm).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(historyByForm).map(([formName, entries]) => (
                  <div key={formName}>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1 px-1">
                      {toFormLabel(formName)}
                    </p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Field</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>When</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entries.map((entry, i) => (
                          <TableRow key={`${entry.field_id}-${entry.injected_at}-${i}`}>
                            <TableCell className="font-mono text-xs font-medium">{entry.field_id}</TableCell>
                            <TableCell className="max-w-[180px] truncate text-sm">{entry.value}</TableCell>
                            <TableCell>
                              <Badge variant={entry.was_update ? "default" : "secondary"}>
                                {entry.was_update ? "Update" : "Static"}
                              </Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                              {formatLocalTime(entry.injected_at)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ))}
              </div>
            ) : injections !== undefined ? (
              <EmptyState
                icon={<FileText className="h-10 w-10" />}
                title="No injection history"
                description="No values were logged when this file was processed."
              />
            ) : null}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
