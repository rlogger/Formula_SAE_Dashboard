"use client";

import { use } from "react";
import { useForms } from "@/hooks/use-forms";
import { useFormValues } from "@/hooks/use-form-values";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";
import { FormRenderer } from "@/components/forms/form-renderer";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { EmptyState } from "@/components/shared/empty-state";
import { ClipboardList } from "lucide-react";

export default function FormByRolePage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = use(params);
  const { token } = useAuth();
  const { data: forms, isLoading } = useForms();
  const { data: valuesData, mutate: mutateValues } = useFormValues(role);

  if (isLoading) return <LoadingSpinner />;

  const form = forms?.find((f) => f.role === role);

  if (!form) {
    return (
      <EmptyState
        icon={<ClipboardList className="h-12 w-12" />}
        title="Form not found"
        description={`No form found for role "${role}".`}
      />
    );
  }

  const handleSubmit = async (values: Record<string, string | null>) => {
    if (!token) return;
    await apiFetch(
      `/forms/${role}/submit`,
      { method: "POST", body: JSON.stringify({ values }) },
      token
    );
    mutateValues();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{form.form_name}</h1>
        <p className="text-muted-foreground">
          Fill out and save the form below.
        </p>
      </div>
      <FormRenderer
        schema={form}
        values={valuesData?.values || {}}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
