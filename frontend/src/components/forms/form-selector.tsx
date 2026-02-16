"use client";

import { FormSchema } from "@/types";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Props = {
  forms: FormSchema[];
  activeRole: string | null;
  onSelect: (role: string) => void;
};

export function FormSelector({ forms, activeRole, onSelect }: Props) {
  if (forms.length === 0) return null;

  return (
    <Tabs
      value={activeRole ?? forms[0].role}
      onValueChange={onSelect}
    >
      <TabsList className="flex-wrap h-auto gap-1">
        {forms.map((form) => (
          <TabsTrigger key={form.role} value={form.role}>
            {form.form_name}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
