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
  timestamp?: number;
  previousValue?: string | null;
  validityWindow?: number;
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

function formatTimeAgo(unixTs: number): string {
  const seconds = Math.floor(Date.now() / 1000 - unixTs);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StalenessIndicator({ timestamp, validityWindow }: { timestamp: number; validityWindow: number }) {
  const age = Date.now() / 1000 - timestamp;
  const ratio = age / validityWindow;

  let color: string;
  let label: string;
  if (ratio <= 0.5) {
    color = "bg-green-500";
    label = "Fresh";
  } else if (ratio <= 1) {
    color = "bg-yellow-500";
    label = "Aging";
  } else {
    color = "bg-red-500";
    label = "Stale";
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label} ({formatTimeAgo(timestamp)})
    </span>
  );
}

export function FormFieldComponent({ field, value, onChange, timestamp, previousValue, validityWindow }: Props) {
  const hints = (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
      {timestamp != null && validityWindow != null && (
        <StalenessIndicator timestamp={timestamp} validityWindow={validityWindow} />
      )}
      {timestamp != null && validityWindow == null && (
        <span className="text-xs text-muted-foreground">Updated {formatTimeAgo(timestamp)}</span>
      )}
      {previousValue != null && (
        <span className="text-xs text-muted-foreground">
          Previous run: {previousValue}{field.unit ? ` ${field.unit}` : ""}
        </span>
      )}
    </div>
  );

  if (field.type === "textarea") {
    return (
      <div className="space-y-1">
        <Label htmlFor={field.name}>{fieldLabel(field)}</Label>
        <Textarea
          id={field.name}
          rows={3}
          value={value}
          placeholder={fieldPlaceholder(field)}
          onChange={(e) => onChange(e.target.value)}
        />
        {hints}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="space-y-1">
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
        {hints}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Label htmlFor={field.name}>{fieldLabel(field)}</Label>
      <Input
        id={field.name}
        type={field.type === "number" ? "number" : "text"}
        value={value}
        placeholder={fieldPlaceholder(field)}
        onChange={(e) => onChange(e.target.value)}
      />
      {hints}
    </div>
  );
}
