"use client";

import AuthGuard from "@/components/AuthGuard";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Database,
  Plus,
  Settings,
  LogOut,
  Menu,
  X,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import TierBadge from "@/components/TierBadge";
import { useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Databases", icon: Database, exact: true },
  { href: "/dashboard/browse", label: "Browse Data", icon: Search },
  { href: "/dashboard/create", label: "New database", icon: Plus },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { session, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sidebar = (
    <>
      {/* Logo */}
      <div className="h-14 flex items-center gap-2.5 px-4 border-b border-border-subtle">
        <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-xs font-bold text-white shrink-0">
          E
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary leading-tight truncate">
            EuroScale
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = item.href === "/dashboard"
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent-subtle text-accent-text"
                  : "text-text-secondary hover:text-text-primary hover:bg-surface-2",
              )}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-2 py-3 border-t border-border-subtle">
        <div className="flex items-center gap-2.5 px-2.5 py-1.5 mb-1.5">
          <div className="w-7 h-7 rounded-full bg-accent-subtle flex items-center justify-center text-xs font-semibold text-accent-text shrink-0">
            {session?.name?.charAt(0)?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-text-primary truncate leading-tight">
                {session?.name ?? "User"}
              </p>
              <TierBadge />
            </div>
            <p className="text-xs text-text-muted truncate leading-tight">
              {session?.email ?? ""}
            </p>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2.5 px-2.5 py-2 rounded-md text-sm font-medium text-text-muted hover:text-error-text hover:bg-error-subtle transition-colors"
        >
          <LogOut size={18} />
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <AuthGuard>
      <div className="min-h-screen bg-bg-primary flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-56 shrink-0 border-r border-border-subtle bg-surface-1 flex-col">
          {sidebar}
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
            <aside className="relative w-64 max-w-[85vw] h-full bg-surface-1 border-r border-border-subtle flex flex-col animate-slide-up">
              {sidebar}
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 bg-bg-primary pb-14 md:pb-0">
          {/* Mobile top bar */}
          <div className="md:hidden flex items-center justify-between h-12 px-4 border-b border-border-subtle bg-bg-primary/95 backdrop-blur-sm sticky top-0 z-30">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
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
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-1 border-t border-border-subtle flex items-center justify-around px-2 py-1.5 safe-area-bottom">
          {navItems.map((item) => {
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
                  {item.label === "New database" ? "Create" : item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </AuthGuard>
  );
}
