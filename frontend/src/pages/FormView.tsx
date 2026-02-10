import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { FormSchema, FormField } from "../types";

type Props = {
  schema: FormSchema | null;
  values: Record<string, string | null>;
  onSubmit: (values: Record<string, string | null>) => Promise<void>;
  readOnly?: boolean;
  headerContent?: ReactNode;
};

function renderField(
  field: FormField,
  value: string,
  onChange: (name: string, value: string | null) => void
) {
  if (field.type === "textarea") {
    return (
      <div className="field" key={field.name}>
        <label>{field.label}</label>
        <textarea
          rows={3}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(field.name, e.target.value)}
        />
      </div>
    );
  }
  if (field.type === "select") {
    return (
      <div className="field" key={field.name}>
        <label>{field.label}</label>
        <select
          value={value}
          onChange={(e) => onChange(field.name, e.target.value)}
        >
          <option value="">Select...</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }
  const inputType = field.type === "number" ? "number" : "text";
  return (
    <div className="field" key={field.name}>
      <label>{field.label}</label>
      <input
        type={inputType}
        value={value}
        placeholder={field.placeholder}
        onChange={(e) => onChange(field.name, e.target.value)}
      />
    </div>
  );
}

export default function FormView({ schema, values, onSubmit, headerContent }: Props) {
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Record<string, string | null>>(values);

  // Compute tabs from schema fields
  const tabs = useMemo(() => {
    if (!schema) return [];
    const seen = new Set<string>();
    const result: string[] = [];
    for (const field of schema.fields) {
      if (field.tab && !seen.has(field.tab)) {
        seen.add(field.tab);
        result.push(field.tab);
      }
    }
    return result;
  }, [schema]);

  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Reset active tab when schema changes
  useEffect(() => {
    setActiveTab(tabs.length > 0 ? tabs[0] : null);
  }, [schema?.role]);

  useEffect(() => {
    setDraft(values);
  }, [values, schema?.role]);

  if (!schema) {
    return (
      <div className="card">
        {headerContent}
        <p>No form available.</p>
      </div>
    );
  }

  const updateField = (name: string, value: string | null) => {
    setDraft((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    await onSubmit(draft);
    setSaving(false);
  };

  const hasTabs = tabs.length > 0;

  // Fields for the current tab
  const tabbedFields = hasTabs
    ? schema.fields.filter((f) => f.tab === activeTab)
    : [];

  // Fields without a tab (always visible, like notes)
  const globalFields = schema.fields.filter((f) => !f.tab);

  return (
    <div className="card">
      {headerContent}
      <h3>{schema.form_name}</h3>

      {hasTabs && (
        <div className="tab-bar">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`tab-btn${activeTab === tab ? " active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {hasTabs &&
          tabbedFields.map((field) =>
            renderField(field, draft[field.name] ?? "", updateField)
          )}

        {!hasTabs &&
          globalFields.map((field) =>
            renderField(field, draft[field.name] ?? "", updateField)
          )}

        {hasTabs && globalFields.length > 0 && (
          <div style={{ borderTop: "1px solid #e5e7eb", marginTop: 16, paddingTop: 16 }}>
            {globalFields.map((field) =>
              renderField(field, draft[field.name] ?? "", updateField)
            )}
          </div>
        )}

        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </form>
    </div>
  );
}
