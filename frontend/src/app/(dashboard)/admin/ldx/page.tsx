"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLdxFiles } from "@/hooks/use-ldx-files";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";
import { LdxFileTable } from "@/components/admin/ldx-file-table";
import { LdxInjectionDialog } from "@/components/admin/ldx-injection-dialog";
import { LdxStatsTable } from "@/components/admin/ldx-stats-table";
import { WatchDirectoryForm } from "@/components/admin/watch-directory-form";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { Download, Trash2, ArrowDownToLine } from "lucide-react";

export default function LdxPage() {
  const { token } = useAuth();
  const { data: files, isLoading, mutate: mutateFiles } = useLdxFiles();
  const [watchDir, setWatchDir] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showExportClearConfirm, setShowExportClearConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiFetch<{ path: string | null }>("/admin/watch-directory", {}, token)
      .then((data) => setWatchDir(data.path || ""))
      .catch(() => setWatchDir(""));
  }, [token]);

  const handleExport = async () => {
    if (!token) return;
    try {
      const result = await apiFetch<{ status: string; filename: string }>(
        "/admin/export-db",
        { method: "POST" },
        token
      );
      setMessage(`Exported: ${result.filename}`);
      toast.success(`Exported: ${result.filename}`);
    } catch {
      setMessage("Export failed.");
      toast.error("Export failed");
    }
  };

  const handleClear = async () => {
    if (!token) return;
    try {
      await apiFetch("/admin/clear-data", { method: "POST" }, token);
      setMessage("All data cleared.");
      toast.success("All data cleared");
      mutateFiles();
    } catch {
      setMessage("Clear failed.");
      toast.error("Clear failed");
    }
  };

  const handleExportAndClear = async () => {
    if (!token) return;
    try {
      const result = await apiFetch<{ status: string; filename: string }>(
        "/admin/export-db",
        { method: "POST" },
        token
      );
      await apiFetch("/admin/clear-data", { method: "POST" }, token);
      setMessage(`Exported ${result.filename} and cleared all data.`);
      toast.success(`Exported ${result.filename} and cleared all data`);
      mutateFiles();
    } catch {
      setMessage("Export & Clear failed.");
      toast.error("Export & Clear failed");
    }
  };

  if (isLoading) return <LoadingSpinner label="Loading LDX files..." />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">LDX Files</h1>
        <p className="text-muted-foreground">
          Manage LDX file watching and view processed files.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <WatchDirectoryForm
            initialPath={watchDir}
            onSaved={() => mutateFiles()}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>LDX Files</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export Database
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExportClearConfirm(true)}
            >
              <ArrowDownToLine className="mr-2 h-4 w-4" />
              Export &amp; Clear
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowClearConfirm(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Clear Data
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {message && (
            <p className="mb-4 text-sm text-muted-foreground">{message}</p>
          )}
          <LdxFileTable
            files={files || []}
            onFileClick={(name) => setSelectedFile(name)}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Injection Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <LdxStatsTable />
        </CardContent>
      </Card>

      <LdxInjectionDialog
        fileName={selectedFile}
        onClose={() => setSelectedFile(null)}
      />

      <ConfirmDialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="Clear All Data"
        description="This will permanently delete all form values, audit logs, LDX file records, and injection logs. User accounts and settings will be preserved. This cannot be undone."
        confirmLabel="Clear All Data"
        destructive
        onConfirm={handleClear}
      />

      <ConfirmDialog
        open={showExportClearConfirm}
        onOpenChange={setShowExportClearConfirm}
        title="Export & Clear All Data"
        description="This will export the database to the watch directory and then clear all form values, audit logs, LDX file records, and injection logs. User accounts and settings will be preserved."
        confirmLabel="Export & Clear"
        destructive
        onConfirm={handleExportAndClear}
      />
    </div>
  );
}
