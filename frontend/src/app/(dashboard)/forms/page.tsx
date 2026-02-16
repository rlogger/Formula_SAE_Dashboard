"use client";

import { useState, useEffect } from "react";
import { useForms } from "@/hooks/use-forms";
import { useFormValues } from "@/hooks/use-form-values";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";
import { FormRenderer } from "@/components/forms/form-renderer";
import { FormSelector } from "@/components/forms/form-selector";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { EmptyState } from "@/components/shared/empty-state";
import { ClipboardList } from "lucide-react";

export default function FormsPage() {
  const { token } = useAuth();
  const { data: forms, isLoading } = useForms();
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const { data: valuesData, mutate: mutateValues } =
    useFormValues(activeRole);

  useEffect(() => {
    if (forms && forms.length > 0 && !activeRole) {
      setActiveRole(forms[0].role);
    }
  }, [forms, activeRole]);

  if (isLoading) return <LoadingSpinner />;

  if (!forms || forms.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList className="h-12 w-12" />}
        title="No forms available"
        description="You don't have access to any forms."
      />
    );
  }

  const activeForm = forms.find((f) => f.role === activeRole);

  const handleSubmit = async (values: Record<string, string | null>) => {
    if (!token || !activeRole) return;
    await apiFetch(
      `/forms/${activeRole}/submit`,
      { method: "POST", body: JSON.stringify({ values }) },
      token
    );
    mutateValues();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Forms</h1>
        <p className="text-muted-foreground">
          View and edit your subteam forms.
        </p>
      </div>
      <FormSelector
        forms={forms}
        activeRole={activeRole}
        onSelect={setActiveRole}
      />
      {activeForm && (
        <FormRenderer
          schema={activeForm}
          values={valuesData?.values || {}}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
