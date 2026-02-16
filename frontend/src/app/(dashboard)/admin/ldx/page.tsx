"use client";

import { useEffect, useState } from "react";
import { useLdxFiles } from "@/hooks/use-ldx-files";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";
import { LdxFileTable } from "@/components/admin/ldx-file-table";
import { WatchDirectoryForm } from "@/components/admin/watch-directory-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/shared/loading-spinner";

export default function LdxPage() {
  const { token } = useAuth();
  const { data: files, isLoading, mutate: mutateFiles } = useLdxFiles();
  const [watchDir, setWatchDir] = useState("");

  useEffect(() => {
    if (!token) return;
    apiFetch<{ path: string | null }>("/admin/watch-directory", {}, token)
      .then((data) => setWatchDir(data.path || ""))
      .catch(() => setWatchDir(""));
  }, [token]);

  if (isLoading) return <LoadingSpinner />;

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
        <CardHeader>
          <CardTitle>LDX Files</CardTitle>
        </CardHeader>
        <CardContent>
          <LdxFileTable files={files || []} />
        </CardContent>
      </Card>
    </div>
  );
}
