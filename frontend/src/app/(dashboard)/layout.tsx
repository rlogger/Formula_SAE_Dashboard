"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { CommandPalette } from "@/components/shared/command-palette";

const PAGE_TITLES: Record<string, string> = {
  "/forms": "Forms",
  "/telemetry": "Telemetry",
  "/admin": "Admin",
  "/admin/users": "Users",
  "/admin/audit": "Audit Log",
  "/admin/ldx": "LDX Files",
  "/admin/modem": "Modem Config",
  "/admin/sensors": "Sensors",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const label = PAGE_TITLES[pathname] ?? PAGE_TITLES[Object.keys(PAGE_TITLES).find((k) => pathname.startsWith(k + "/")) ?? ""] ?? null;
    document.title = label ? `${label} — SCR Dashboard` : "SCR Dashboard";
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 p-4 lg:p-6 animate-slide-in">{children}</main>
      </div>
      <CommandPalette />
    </div>
  );
}
