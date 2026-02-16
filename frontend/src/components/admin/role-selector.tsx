"use client";

import { cn } from "@/lib/utils";

type Props = {
  roles: string[];
  selectedRoles: string[];
  isAdmin: boolean;
  onToggle: (role: string) => void;
  error?: string | null;
};

export function RoleSelector({
  roles,
  selectedRoles,
  isAdmin,
  onToggle,
  error,
}: Props) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Roles (choose 1-2) or Admin
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onToggle("admin")}
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition-colors",
            isAdmin
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input hover:bg-accent"
          )}
        >
          Admin
        </button>
        {roles.map((role) => {
          const selected = selectedRoles.includes(role);
          const disabled =
            !selected && !isAdmin && selectedRoles.length >= 2;
          return (
            <button
              key={role}
              type="button"
              disabled={disabled || isAdmin}
              onClick={() => onToggle(role)}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input hover:bg-accent",
                (disabled || isAdmin) && "cursor-not-allowed opacity-50"
              )}
            >
              {role}
            </button>
          );
        })}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
