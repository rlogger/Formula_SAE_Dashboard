import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  label?: string;
};

export function LoadingSpinner({ className, label }: Props) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 p-8", className)}>
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      {label && (
        <p className="text-sm text-muted-foreground">{label}</p>
      )}
    </div>
  );
}
