"use client";

import { useEffect, useState } from "react";
import { FormField } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";

export type PreviousLdxChoice = "previous" | "current";

type PendingField = {
  field: FormField;
  oldValue: string | null | undefined;
  newValue: string;
};

type Props = {
  open: boolean;
  fields: PendingField[];
  previousLdxName: string | null;
  isAdmin: boolean;
  formAdminOnly: boolean;
  onCancel: () => void;
  onConfirm: (choices: Record<string, PreviousLdxChoice>) => void;
};

export function PreviousLdxDialog({
  open,
  fields,
  previousLdxName,
  isAdmin,
  formAdminOnly,
  onCancel,
  onConfirm,
}: Props) {
  const [choices, setChoices] = useState<Record<string, PreviousLdxChoice>>({});

  useEffect(() => {
    if (!open) return;
    const initial: Record<string, PreviousLdxChoice> = {};
    for (const { field } of fields) {
      initial[field.name] = "current";
    }
    setChoices(initial);
  }, [open, fields]);

  const setChoice = (name: string, value: PreviousLdxChoice) => {
    setChoices((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply to previous or current run?</DialogTitle>
          <DialogDescription>
            The value{fields.length === 1 ? "" : "s"} below can be applied retroactively to the
            last processed LDX file{previousLdxName ? <> (<span className="font-mono">{previousLdxName}</span>)</> : ""},
            or saved normally for the next LDX file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {fields.map(({ field, newValue }) => {
            const restricted = !isAdmin && (formAdminOnly || field.admin_only);
            return (
              <div key={field.name} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {field.label}
                      {field.unit && <span className="ml-1 text-xs text-muted-foreground">({field.unit})</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">New value: <span className="font-mono">{newValue || "(empty)"}</span></p>
                  </div>
                  {restricted && (
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <Lock className="h-3 w-3" /> Admin
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={choices[field.name] === "previous" ? "default" : "outline"}
                    size="sm"
                    disabled={!previousLdxName || restricted}
                    onClick={() => setChoice(field.name, "previous")}
                    className={choices[field.name] === "previous" ? "bg-racing hover:bg-racing-hover text-white" : ""}
                  >
                    Previous LDX
                  </Button>
                  <Button
                    type="button"
                    variant={choices[field.name] === "current" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setChoice(field.name, "current")}
                    className={choices[field.name] === "current" ? "bg-racing hover:bg-racing-hover text-white" : ""}
                  >
                    Next LDX
                  </Button>
                </div>
                {restricted && (
                  <p className="text-[11px] text-muted-foreground">
                    Only admins can apply this field to the previous LDX.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(choices)}
            className="bg-racing hover:bg-racing-hover text-white"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
