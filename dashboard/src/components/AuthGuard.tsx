"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui/skeleton";

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
    (p) => pathname === p || pathname.startsWith(p + "/")
  );

  useEffect(() => {
    if (isPublic || isLoading) return;
    if (!isAuthenticated) {
      router.replace(loginPath);
    }
  }, [isPublic, isLoading, isAuthenticated, router, loginPath]);

  // Public pages render immediately
  if (isPublic) return <>{children}</>;

  // Show loading skeleton while Better Auth resolves the session
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary">
        <div className="text-center space-y-4 animate-fade-in">
          <Skeleton className="h-8 w-8 rounded-full mx-auto" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-48 mx-auto" />
            <Skeleton className="h-3 w-32 mx-auto" />
          </div>
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
