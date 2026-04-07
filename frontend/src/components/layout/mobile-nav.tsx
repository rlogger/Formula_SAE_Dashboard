"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { navItems, adminItems } from "@/lib/nav-items";
import { useAuth } from "@/hooks/use-auth";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <div className="lg:hidden">
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
        <Menu className="h-5 w-5" />
        <span className="sr-only">Open menu</span>
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar text-sidebar-foreground border-sidebar-border">
          <div className="h-1 bg-racing shadow-[0_2px_8px_hsl(var(--racing)/0.5)]" />
          <SheetHeader className="border-b border-sidebar-border px-4 py-3">
            <SheetTitle className="flex items-center gap-2.5 text-left text-white">
              <Image
                src="/images/fsae_logo.jpg"
                alt="SCR"
                width={24}
                height={24}
                className="rounded"
              />
              <span className="font-heading font-bold uppercase tracking-wider">
                SCR Dashboard
              </span>
            </SheetTitle>
            <SheetDescription className="sr-only">
              Navigation menu
            </SheetDescription>
          </SheetHeader>
          <nav aria-label="Main navigation" className="px-3 py-4">
            <div className="space-y-1">
              {navItems.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
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
                        onClick={() => setOpen(false)}
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
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}
