"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItems, adminItems } from "@/lib/nav-items";
import { useAuth } from "@/hooks/use-auth";
import { ScrollArea } from "@/components/ui/scroll-area";

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <div className="hidden lg:block lg:w-64 bg-sidebar sidebar-depth text-sidebar-foreground">
      <div className="flex h-full flex-col">
        {/* Racing accent stripe — bold 4px band */}
        <div className="h-1 bg-racing shadow-[0_2px_8px_hsl(var(--racing)/0.5)]" />

        {/* Brand header */}
        <div className="flex h-14 items-center border-b border-sidebar-border px-4 bg-gradient-to-b from-racing/8 to-transparent">
          <Link
            href="/forms"
            className="flex items-center gap-2.5"
          >
            <Image
              src="/images/fsae_logo.jpg"
              alt="SCR"
              width={28}
              height={28}
              className="rounded ring-2 ring-racing/40"
            />
            <span className="font-heading text-base font-bold uppercase tracking-wider text-white">
              SCR Dashboard
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav aria-label="Main navigation" className="flex-1 min-h-0">
        <ScrollArea className="h-full px-3 py-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "border-l-2 border-racing bg-racing/10 font-medium text-white"
                      : "text-sidebar-muted hover:bg-white/5 hover:text-white"
                  )}
                >
                  <item.icon className={cn("h-4 w-4", active && "text-racing")} />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {user?.is_admin && (
            <>
              <div className="my-4 border-t border-sidebar-border" />
              <div className="mb-2 px-3">
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-sidebar-muted">
                  <Shield className="h-3 w-3" />
                  Admin
                </span>
              </div>
              <div className="space-y-1">
                {adminItems.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                        active
                          ? "border-l-2 border-racing bg-racing/10 font-medium text-white"
                          : "text-sidebar-muted hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <item.icon className={cn("h-4 w-4", active && "text-racing")} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </ScrollArea>
        </nav>

        {/* Keyboard shortcut hints */}
        <div className="border-t border-sidebar-border px-4 py-3 space-y-1.5">
          <div className="text-[11px] text-sidebar-muted">
            <kbd className="rounded border border-sidebar-border bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">
              Ctrl K
            </kbd>{" "}
            Quick nav
          </div>
          <div className="text-[11px] text-sidebar-muted">
            <kbd className="rounded border border-sidebar-border bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">
              G
            </kbd>{" "}
            <kbd className="rounded border border-sidebar-border bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">
              F
            </kbd>{" "}
            <kbd className="rounded border border-sidebar-border bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">
              T
            </kbd>{" "}
            <kbd className="rounded border border-sidebar-border bg-white/5 px-1.5 py-0.5 font-mono text-[10px]">
              A
            </kbd>{" "}
            Go to...
          </div>
        </div>
      </div>
    </div>
  );
}
