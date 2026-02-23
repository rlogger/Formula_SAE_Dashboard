"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { FolderOpen, Loader2 } from "lucide-react";

type Props = {
  initialPath: string;
  onSaved: () => void;
};

export function WatchDirectoryForm({ initialPath, onSaved }: Props) {
  const { token } = useAuth();
  const [path, setPath] = useState(initialPath);

  useEffect(() => {
    setPath(initialPath);
  }, [initialPath]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSave = async () => {
    if (!token) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch(
        "/admin/watch-directory",
        { method: "PUT", body: JSON.stringify({ path }) },
        token
      );
      setMessage("Directory saved.");
      onSaved();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <Label>Watch Directory</Label>
      <div className="flex gap-2">
        <Input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="/path/to/ldx/files"
        />
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FolderOpen className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </div>
      {message && (
        <p
          className={`text-sm ${
            message.includes("saved")
              ? "text-green-600 dark:text-green-400"
              : "text-destructive"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
