"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FormField, FormSchema } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormFieldComponent } from "./form-field";
import { AlertCircle, Loader2, Save } from "lucide-react";

type Props = {
  schema: FormSchema;
  values: Record<string, string | null>;
  timestamps?: Record<string, number>;
  previousValues?: Record<string, string | null>;
  onSubmit: (values: Record<string, string | null>) => Promise<void>;
};

function validateField(field: FormField, value: string | null): string | null {
  const v = value ?? "";
  if (field.required && !v.trim()) {
    return `${field.label} is required`;
  }
  if (field.type === "number" && v.trim()) {
    const num = Number(v);
    if (isNaN(num)) {
      return `${field.label} must be a valid number`;
    }
  }
  if (field.type === "select" && field.options && v.trim()) {
    if (!field.options.includes(v)) {
      return `${field.label} must be one of the available options`;
    }
  }
  return null;
}

export function FormRenderer({ schema, values, timestamps, previousValues, onSubmit }: Props) {
  const [draft, setDraft] = useState<Record<string, string | null>>(values);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    setDraft(values);
    setFieldErrors({});
    setShowErrors(false);
  }, [values]);

  useEffect(() => {
    setSaveResult(null);
    setFieldErrors({});
    setShowErrors(false);
  }, [schema.role]);

  const updateField = (name: string, value: string) => {
    setDraft((prev) => ({ ...prev, [name]: value }));
    setSaveResult(null);
    // Clear the error for this field when user types
    if (fieldErrors[name]) {
      setFieldErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validateAll = useCallback((): boolean => {
    const errors: Record<string, string | null> = {};
    let hasError = false;
    for (const field of schema.fields) {
      const error = validateField(field, draft[field.name]);
      errors[field.name] = error;
      if (error) hasError = true;
    }
    setFieldErrors(errors);
    return !hasError;
  }, [schema.fields, draft]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);

    if (!validateAll()) {
      const errorCount = Object.values(fieldErrors).filter(Boolean).length || 1;
      setSaveResult({ type: "error", text: `Please fix ${errorCount} validation error${errorCount > 1 ? "s" : ""} before saving` });
      toast.error("Please fix validation errors before saving");
      return;
    }

    setSaving(true);
    setSaveResult(null);
    try {
      await onSubmit(draft);
      setSaveResult({ type: "success", text: "Saved successfully" });
      toast.success("Form saved successfully");
      setShowErrors(false);
    } catch (err) {
      const msg = (err as Error).message;
      setSaveResult({ type: "error", text: msg });
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const hasTabs = schema.tabs && schema.tabs.length > 0;

  const { tabbedFields, untabbedFields } = useMemo(() => {
    if (!hasTabs) return { tabbedFields: new Map<string, FormField[]>(), untabbedFields: schema.fields };
    const tabbed = new Map<string, FormField[]>();
    const untabbed = schema.fields.filter((f) => !f.tab);
    for (const tab of schema.tabs!) {
      tabbed.set(tab, schema.fields.filter((f) => f.tab === tab));
    }
    return { tabbedFields: tabbed, untabbedFields: untabbed };
  }, [schema, hasTabs]);

  const errorCount = showErrors ? Object.values(fieldErrors).filter(Boolean).length : 0;

  const renderField = (field: FormField) => (
    <FormFieldComponent
      key={field.name}
      field={field}
      value={draft[field.name] ?? ""}
      onChange={(value) => updateField(field.name, value)}
      timestamp={timestamps?.[field.name]}
      previousValue={field.lookback ? previousValues?.[field.name] : undefined}
      validityWindow={field.validity_window}
      error={showErrors ? fieldErrors[field.name] : null}
    />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{schema.form_name}</CardTitle>
        <CardDescription>
          Fill out the fields below and save your changes.
          {schema.fields.some((f) => f.required) && (
            <span className="text-destructive ml-1">* indicates required fields</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {hasTabs ? (
            <>
              <Tabs defaultValue={schema.tabs![0]}>
                <TabsList className="flex-wrap h-auto gap-1">
                  {schema.tabs!.map((tab) => (
                    <TabsTrigger key={tab} value={tab}>
                      {tab}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {schema.tabs!.map((tab) => (
                  <TabsContent key={tab} value={tab} className="space-y-4 mt-4">
                    {tabbedFields.get(tab)?.map(renderField)}
                  </TabsContent>
                ))}
              </Tabs>
              {untabbedFields.map(renderField)}
            </>
          ) : (
            schema.fields.map(renderField)
          )}

          {showErrors && errorCount > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                {errorCount} validation error{errorCount > 1 ? "s" : ""} — please fix before saving
              </span>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saving ? "Saving..." : "Save"}
            </Button>
            {saveResult && (
              <p
                className={`text-sm ${
                  saveResult.type === "success"
                    ? "text-green-600 dark:text-green-400"
                    : "text-destructive"
                }`}
              >
                {saveResult.text}
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
