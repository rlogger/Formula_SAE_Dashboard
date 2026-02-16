"use client";

import { FormField as FormFieldType } from "@/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  field: FormFieldType;
  value: string;
  onChange: (value: string) => void;
};

function fieldLabel(field: FormFieldType) {
  if (field.unit) return `${field.label} (${field.unit})`;
  return field.label;
}

function fieldPlaceholder(field: FormFieldType) {
  if (field.placeholder) return field.placeholder;
  if (field.unit) return field.unit;
  return undefined;
}

export function FormFieldComponent({ field, value, onChange }: Props) {
  if (field.type === "textarea") {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.name}>{fieldLabel(field)}</Label>
        <Textarea
          id={field.name}
          rows={3}
          value={value}
          placeholder={fieldPlaceholder(field)}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.name}>{fieldLabel(field)}</Label>
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger id={field.name}>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={field.name}>{fieldLabel(field)}</Label>
      <Input
        id={field.name}
        type={field.type === "number" ? "number" : "text"}
        value={value}
        placeholder={fieldPlaceholder(field)}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
