"use client";

import { useRouter } from "next/navigation";
import { LogOut, Moon, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { MobileNav } from "./mobile-nav";
import { Breadcrumbs } from "./breadcrumbs";

export function Header() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6">
      <MobileNav />
      <Breadcrumbs />
      <div className="flex-1" />
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
        {user && (
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {user.username}
              {user.is_admin && (
                <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                  Admin
                </span>
              )}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
