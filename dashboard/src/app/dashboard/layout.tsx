"use client";

import AuthGuard from "@/components/AuthGuard";
import Sidebar from "@/components/Sidebar";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clock,
  Database,
  Plus,
  Settings,
  Search,
  CreditCard,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

const mobileNavItems = [
  { href: "/dashboard", label: "Databases", icon: Database },
  { href: "/dashboard/backups", label: "Backups", icon: Clock },
  { href: "/dashboard/browse", label: "Browse Data", icon: Search },
  { href: "/dashboard/create", label: "Create", icon: Plus },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-bg-primary flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-56 shrink-0 shadow-border bg-surface-1 flex-col">
          <ScrollArea className="flex-1 flex flex-col">
            <Sidebar />
          </ScrollArea>
        </aside>

        {/* Mobile sidebar Sheet */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent
            side="left"
            className="w-64 max-w-[85vw] p-0 bg-surface-1"
            showCloseButton={false}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <Sidebar onNavClick={() => setSidebarOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 bg-bg-primary pb-14 md:pb-0">
          {/* Mobile top bar */}
          <div className="md:hidden flex items-center justify-between h-10 px-4 shadow-border bg-bg-primary/95 backdrop-blur-sm sticky top-0 z-30">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="-ml-2"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </Button>
            <span className="text-sm font-semibold text-text-primary font-display">
              EuroScale
            </span>
            {/* Spacer for centering */}
            <div className="w-9" />
          </div>

          <Separator className="md:hidden" />

          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>

        {/* Mobile bottom nav bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-1 shadow-border-strong flex items-center justify-around px-2 py-1.5 safe-area-bottom">
          {mobileNavItems.map((item, idx) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === item.href
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-1 px-3 min-w-[44px] min-h-[44px] rounded-lg transition-colors relative animate-choreographed-enter",
                  isActive
                    ? "text-accent-text"
                    : "text-text-muted hover:text-text-secondary"
                )}
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                {/* Active dot indicator */}
                {isActive && (
                  <div className="absolute top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent-text" />
                )}
                <item.icon size={20} />
                <span className="text-[10px] font-medium leading-none">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </AuthGuard>
  );
}
