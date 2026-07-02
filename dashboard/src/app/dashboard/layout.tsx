"use client";

import AuthGuard from "@/components/AuthGuard";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Database,
  Plus,
  Settings,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const navItems = [
  { href: "/dashboard", label: "Databases", icon: Database, exact: true },
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

  return (
    <AuthGuard>
      <div className="min-h-screen bg-bg-primary flex">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-border-subtle bg-surface-1 flex flex-col">
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
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent-subtle text-accent-text"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-2",
                  )}
                >
                  <item.icon size={16} />
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
                <p className="text-sm font-medium text-text-primary truncate leading-tight">
                  {session?.name ?? "User"}
                </p>
                <p className="text-xs text-text-muted truncate leading-tight">
                  {session?.email ?? ""}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              className="flex w-full items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm font-medium text-text-muted hover:text-error-text hover:bg-error-subtle transition-colors"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 bg-bg-primary">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
