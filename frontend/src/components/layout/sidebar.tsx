"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { navItems, adminItems } from "@/lib/nav-items";
import { useAuth } from "@/hooks/use-auth";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <div className="hidden border-r bg-card lg:block lg:w-64">
      <div className="flex h-full flex-col">
        <div className="border-t-2 border-racing" />
        <div className="flex h-14 items-center border-b px-4">
          <Link href="/forms" className="flex items-center gap-2 font-semibold">
            <Image src="/images/fsae_logo.jpg" alt="SCR" width={24} height={24} className="rounded" />
            <span>SCR Dashboard</span>
          </Link>
        </div>
        <ScrollArea className="flex-1 px-3 py-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    active
                      ? "border-l-2 border-racing bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
          {user?.is_admin && (
            <>
              <Separator className="my-4" />
              <div className="mb-2 px-3">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
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
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        active
                          ? "border-l-2 border-racing bg-accent font-medium text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
