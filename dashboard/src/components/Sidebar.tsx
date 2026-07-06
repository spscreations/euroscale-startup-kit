"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Clock,
  Database,
  Plus,
  Settings,
  LogOut,
  Search,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import TierBadge from "@/components/TierBadge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const navItems = [
  { href: "/dashboard", label: "Databases", icon: Database, exact: true },
  { href: "/dashboard/backups", label: "Backups", icon: Clock },
  { href: "/dashboard/browse", label: "Browse Data", icon: Search },
  { href: "/dashboard/create", label: "New database", icon: Plus },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

interface SidebarProps {
  onNavClick?: () => void;
}

export default function Sidebar({ onNavClick }: SidebarProps) {
  const pathname = usePathname();
  const { session, logout } = useAuth();

  return (
    <>
      {/* Logo */}
      <div className="h-14 flex items-center gap-2.5 px-4 shadow-border">
        <Image
          src="/logo.png"
          alt="EuroScale"
          width={32}
          height={32}
          className="rounded-md shrink-0"
          priority
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary leading-tight truncate">
            EuroScale
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          return (
            <Button
              key={item.href}
              variant="ghost"
              size="sm"
              render={<Link href={item.href} />}
              onClick={onNavClick}
              className={cn(
                "w-full justify-start gap-2.5 px-2.5 py-2 h-auto rounded-md text-sm font-medium",
                "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1",
                isActive
                  ? "bg-accent-subtle text-accent-text hover:bg-accent-subtle/80"
                  : "text-text-secondary hover:text-text-primary hover:bg-muted"
              )}
            >
              <item.icon size={18} />
              {item.label}
            </Button>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-2 py-3 shadow-border-strong">
        <div className="flex items-center gap-2.5 px-2.5 py-1.5 mb-1.5">
          <Avatar size="sm">
            <AvatarFallback className="bg-accent-subtle text-accent-text text-xs font-semibold">
              {session?.name?.charAt(0)?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
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
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          className={cn(
            "w-full justify-start gap-2.5 px-2.5 py-2 h-auto rounded-md text-sm font-medium",
            "text-text-muted hover:text-error-text hover:bg-error-subtle",
            "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
          )}
        >
          <LogOut size={18} />
          Sign out
        </Button>
      </div>
    </>
  );
}
