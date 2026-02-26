"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Loader2, Save } from "lucide-react";

type Props = {
  schema: FormSchema;
  values: Record<string, string | null>;
  timestamps?: Record<string, number>;
  previousValues?: Record<string, string | null>;
  onSubmit: (values: Record<string, string | null>) => Promise<void>;
};

export function FormRenderer({ schema, values, timestamps, previousValues, onSubmit }: Props) {
  const [draft, setDraft] = useState<Record<string, string | null>>(values);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setDraft(values);
  }, [values]);

  useEffect(() => {
    setSaveResult(null);
  }, [schema.role]);

  const updateField = (name: string, value: string) => {
    setDraft((prev) => ({ ...prev, [name]: value }));
    setSaveResult(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveResult(null);
    try {
      await onSubmit(draft);
      setSaveResult({ type: "success", text: "Saved successfully" });
      toast.success("Form saved successfully");
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

  const renderField = (field: FormField) => (
    <FormFieldComponent
      key={field.name}
      field={field}
      value={draft[field.name] ?? ""}
      onChange={(value) => updateField(field.name, value)}
      timestamp={timestamps?.[field.name]}
      previousValue={field.lookback ? previousValues?.[field.name] : undefined}
      validityWindow={field.validity_window}
    />
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{schema.form_name}</CardTitle>
        <CardDescription>
          Fill out the fields below and save your changes.
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
