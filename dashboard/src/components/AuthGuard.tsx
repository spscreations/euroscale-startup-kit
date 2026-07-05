"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
  loginPath?: string;
  publicPaths?: string[];
}

export default function AuthGuard({
  children,
  loginPath = "/login",
  publicPaths = ["/login", "/signup"],
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading } = useAuth();

  const isPublic = publicPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  useEffect(() => {
    if (isPublic || isLoading) return;
    if (!isAuthenticated) {
      router.replace(loginPath);
    }
  }, [isPublic, isLoading, isAuthenticated, router, loginPath]);

  // Public pages render immediately
  if (isPublic) return <>{children}</>;

  // Show loading spinner while Better Auth resolves the session
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="text-center space-y-3 animate-fade-in">
          <Loader2
            size={24}
            className="animate-spin text-accent mx-auto"
          />
          <p className="text-sm text-text-muted font-medium">
            Checking authentication…
          </p>
        </div>
      </div>
    );
  }

  // Authenticated — render children
  if (isAuthenticated) return <>{children}</>;

  // Not authenticated and not loading — this shouldn't render because
  // the useEffect above will redirect, but return null as a fallback.
  return null;
}
