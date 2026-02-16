"use client";

import { useAuth } from "@/hooks/use-auth";
import { EmptyState } from "@/components/shared/empty-state";
import { Shield } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();

  if (!user?.is_admin) {
    return (
      <EmptyState
        icon={<Shield className="h-12 w-12" />}
        title="Admin access required"
        description="You don't have permission to access this section."
      />
    );
  }

  return <>{children}</>;
}
