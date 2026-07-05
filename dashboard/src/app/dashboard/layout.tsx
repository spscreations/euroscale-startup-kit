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
          <Sidebar />
        </aside>

        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="md:hidden fixed inset-0 z-50">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setSidebarOpen(false)}
            />
            {/* Drawer */}
            <aside className="relative w-64 max-w-[85vw] h-full bg-surface-1 shadow-border-strong flex flex-col animate-slide-up">
              <Sidebar onNavClick={() => setSidebarOpen(false)} />
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 bg-bg-primary pb-14 md:pb-0">
          {/* Mobile top bar */}
          <div className="md:hidden flex items-center justify-between h-12 px-4 shadow-border bg-bg-primary/95 backdrop-blur-sm sticky top-0 z-30">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <span className="text-sm font-semibold text-text-primary">
              EuroScale
            </span>
            {/* Spacer for centering */}
            <div className="w-9" />
          </div>

          {children}
        </main>

        {/* Mobile bottom nav bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-1 shadow-border-strong flex items-center justify-around px-2 py-1.5 safe-area-bottom">
          {mobileNavItems.map((item) => {
            const isActive = item.href === "/dashboard"
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-1 px-3 min-w-[44px] min-h-[44px] rounded-lg transition-colors",
                  isActive
                    ? "text-accent-text"
                    : "text-text-muted hover:text-text-secondary",
                )}
              >
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
