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
  error?: string | null;
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
    color = "bg-status-success";
    label = "Fresh";
  } else if (ratio <= 1) {
    color = "bg-status-warning";
    label = "Aging";
  } else {
    color = "bg-destructive";
    label = "Stale";
  }

  const windowLabel = validityWindow >= 3600
    ? `${Math.round(validityWindow / 3600)}h`
    : `${Math.round(validityWindow / 60)}m`;

  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      title={`Data freshness — this value should be updated within ${windowLabel}. ${label === "Stale" ? "Consider re-checking this measurement." : ""}`}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label} ({formatTimeAgo(timestamp)})
    </span>
  );
}

export function FormFieldComponent({ field, value, onChange, timestamp, previousValue, validityWindow, error }: Props) {
  const hasError = !!error;
  const errorId = `${field.name}-error`;
  const hints = (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
      {hasError && (
        <span id={errorId} className="text-xs text-destructive font-medium" role="alert">{error}</span>
      )}
      {field.inject && (
        <span className="text-xs text-muted-foreground" title="This field can be auto-populated from Motec LDX log files">
          Auto-filled from LDX
        </span>
      )}
      {timestamp != null && validityWindow != null && (
        <StalenessIndicator timestamp={timestamp} validityWindow={validityWindow} />
      )}
      {timestamp != null && validityWindow == null && (
        <span className="text-xs text-muted-foreground">Updated {formatTimeAgo(timestamp)}</span>
      )}
      {previousValue != null && (
        <span className="text-xs text-muted-foreground" title="Value from the previous track session, shown for comparison">
          Previous run: {previousValue}{field.unit ? ` ${field.unit}` : ""}
        </span>
      )}
    </div>
  );

  const errorClass = hasError ? "border-destructive focus-visible:ring-destructive" : "";

  if (field.type === "textarea") {
    return (
      <div className="space-y-1">
        <Label htmlFor={field.name}>
          {fieldLabel(field)}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Textarea
          id={field.name}
          rows={3}
          value={value}
          placeholder={fieldPlaceholder(field)}
          onChange={(e) => onChange(e.target.value)}
          maxLength={10000}
          className={errorClass}
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : undefined}
        />
        {hints}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div className="space-y-1">
        <Label htmlFor={field.name}>
          {fieldLabel(field)}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger id={field.name} className={errorClass} aria-invalid={hasError} aria-describedby={hasError ? errorId : undefined}>
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
      <Label htmlFor={field.name}>
        {fieldLabel(field)}
        {field.required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Input
        id={field.name}
        type={field.type === "number" ? "number" : "text"}
        inputMode={field.type === "number" ? "decimal" : undefined}
        value={value}
        placeholder={fieldPlaceholder(field)}
        onChange={(e) => onChange(e.target.value)}
        onWheel={field.type === "number" ? (e) => (e.target as HTMLInputElement).blur() : undefined}
        maxLength={field.type === "number" ? undefined : 10000}
        className={errorClass}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
      />
      {hints}
    </div>
  );
}
