"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(values);
  }, [values]);

  useEffect(() => {
    setMessage(null);
  }, [schema.role]);

  const updateField = (name: string, value: string) => {
    setDraft((prev) => ({ ...prev, [name]: value }));
    setMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await onSubmit(draft);
      setMessage("Saved successfully");
    } catch (err) {
      setMessage((err as Error).message);
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
            {message && (
              <p
                className={`text-sm ${
                  message.includes("success")
                    ? "text-green-600 dark:text-green-400"
                    : "text-destructive"
                }`}
              >
                {message}
              </p>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
