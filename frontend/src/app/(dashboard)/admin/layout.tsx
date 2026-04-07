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
        description="This section is for team admins only. If you need access, ask a team admin to promote your account."
      />
    );
  }

  return <>{children}</>;
}
