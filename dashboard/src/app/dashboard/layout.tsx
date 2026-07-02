"use client";

import AuthGuard from "@/components/AuthGuard";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Database,
  Plus,
  Settings,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

const navItems = [
  { href: "/dashboard", label: "Databases", icon: Database },
  { href: "/dashboard/create", label: "New Database", icon: Plus },
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
      <div className="min-h-screen bg-navy-900 flex">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 border-r border-purple-500/10 bg-navy-800/50 flex flex-col">
          {/* Logo */}
          <div className="h-16 flex items-center gap-3 px-6 border-b border-purple-500/10">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-400 flex items-center justify-center text-xs font-bold text-white">
              E
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100 leading-tight">
                EuroScale
              </p>
              <p className="text-[10px] text-slate-500 tracking-wider uppercase leading-tight">
                Dashboard
              </p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map((item) => {
              const isActive =
                item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-purple-500/15 text-purple-300 border border-purple-500/20"
                      : "text-slate-400 hover:text-slate-200 hover:bg-navy-700/50 border border-transparent"
                  )}
                >
                  <item.icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User / Logout */}
          <div className="px-3 py-4 border-t border-purple-500/10">
            <div className="flex items-center gap-3 px-3 py-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-sm font-semibold text-purple-300">
                {session?.name?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">
                  {session?.name ?? "User"}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {session?.email ?? ""}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:text-red-300 hover:bg-red-500/10 transition-all duration-200 border border-transparent"
            >
              <LogOut size={18} />
              Sign out
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0">{children}</main>
      </div>
    </AuthGuard>
  );
}
