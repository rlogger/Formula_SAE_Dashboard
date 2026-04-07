"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Activity,
  ClipboardList,
  FileText,
  FolderOpen,
  Gauge,
  LayoutDashboard,
  LogOut,
  Moon,
  Radio,
  Sun,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

type CommandItem = {
  label: string;
  section: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  action?: () => void;
  keywords?: string;
  shortcut?: string;
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();

  const items = useMemo<CommandItem[]>(() => {
    const nav: CommandItem[] = [
      { label: "Forms", section: "Navigate", icon: ClipboardList, href: "/forms", keywords: "form submit", shortcut: "G F" },
      { label: "Telemetry", section: "Navigate", icon: Activity, href: "/telemetry", keywords: "live data charts", shortcut: "G T" },
    ];

    if (user?.is_admin) {
      nav.push(
        { label: "Admin Overview", section: "Admin", icon: LayoutDashboard, href: "/admin", keywords: "dashboard stats", shortcut: "G A" },
        { label: "Users", section: "Admin", icon: Users, href: "/admin/users", keywords: "manage accounts" },
        { label: "Sensors", section: "Admin", icon: Gauge, href: "/admin/sensors", keywords: "channels telemetry" },
        { label: "Modem", section: "Admin", icon: Radio, href: "/admin/modem", keywords: "serial udp config" },
        { label: "Audit Log", section: "Admin", icon: FileText, href: "/admin/audit", keywords: "changes history" },
        { label: "LDX Files", section: "Admin", icon: FolderOpen, href: "/admin/ldx", keywords: "injection data import" },
      );
    }

    nav.push(
      {
        label: theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode",
        section: "Actions",
        icon: theme === "dark" ? Sun : Moon,
        action: () => setTheme(theme === "dark" ? "light" : "dark"),
        keywords: "theme toggle",
      },
      {
        label: "Log Out",
        section: "Actions",
        icon: LogOut,
        action: () => { logout(); router.push("/login"); },
        keywords: "sign out exit",
      },
    );

    return nav;
  }, [user, theme, setTheme, logout, router]);

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.section.toLowerCase().includes(q) ||
        item.keywords?.toLowerCase().includes(q)
    );
  }, [items, query]);

  const execute = useCallback(
    (item: CommandItem) => {
      setOpen(false);
      if (item.href) router.push(item.href);
      else item.action?.();
    },
    [router]
  );

  // Global Ctrl+K / Cmd+K listener + "g" prefix navigation
  useEffect(() => {
    let gPending = false;
    let gTimer: ReturnType<typeof setTimeout>;

    const handler = (e: KeyboardEvent) => {
      // Skip if typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }

      // "g" prefix navigation: g then f/t/a within 500ms
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === "g" && !gPending) {
          gPending = true;
          gTimer = setTimeout(() => { gPending = false; }, 500);
          return;
        }
        if (gPending) {
          gPending = false;
          clearTimeout(gTimer);
          const routes: Record<string, string> = { f: "/forms", t: "/telemetry", a: "/admin" };
          const route = routes[e.key];
          if (route) {
            e.preventDefault();
            router.push(route);
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      clearTimeout(gTimer);
    };
  }, [router]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Keyboard navigation inside dialog
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      execute(filtered[selectedIndex]);
    }
  };

  // Clamp selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Group items by section
  const sections = useMemo(() => {
    const map = new Map<string, { item: CommandItem; globalIndex: number }[]>();
    filtered.forEach((item, i) => {
      const list = map.get(item.section) || [];
      list.push({ item, globalIndex: i });
      map.set(item.section, list);
    });
    return map;
  }, [filtered]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md p-0 gap-0 overflow-hidden" onKeyDown={handleKeyDown}>
        <DialogHeader className="sr-only">
          <DialogTitle>Quick Navigation</DialogTitle>
        </DialogHeader>
        <div className="flex items-center border-b border-b-racing/10 px-3">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, actions..."
            className="border-0 shadow-none focus-visible:ring-0 h-12 text-sm"
          />
          <kbd className="shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>
        <div className="max-h-[300px] overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </p>
          )}
          {Array.from(sections.entries()).map(([section, entries]) => (
            <div key={section}>
              <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {section}
              </p>
              {entries.map(({ item, globalIndex }) => (
                <button
                  key={item.label}
                  onClick={() => execute(item)}
                  onMouseEnter={() => setSelectedIndex(globalIndex)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors text-left",
                    globalIndex === selectedIndex
                      ? "bg-racing/10 text-foreground dark:bg-racing/15"
                      : "text-muted-foreground hover:bg-accent/50"
                  )}
                >
                  <item.icon className={cn("h-4 w-4 shrink-0", globalIndex === selectedIndex && "text-racing")} />
                  <span className="flex-1">{item.label}</span>
                  {item.shortcut && (
                    <kbd className="ml-auto shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {item.shortcut}
                    </kbd>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
