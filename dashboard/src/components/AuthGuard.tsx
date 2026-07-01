"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
  /** Optional redirect path when not authenticated (default /login). */
  loginPath?: string;
  /** Optional paths that don't require auth (e.g. "/signup"). */
  publicPaths?: string[];
}

/**
 * Client component that gates protected routes behind authentication.
 *
 * - If the user is NOT authenticated, they are redirected to `loginPath`.
 * - If the user IS authenticated, `children` are rendered.
 * - While checking, a branded loading spinner is shown.
 * - `publicPaths` lets you whitelist routes that bypass the guard
 *   (useful when wrapping the entire layout).
 */
export default function AuthGuard({
  children,
  loginPath = "/login",
  publicPaths = ["/login", "/signup"],
}: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Allow public paths without auth
    if (publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      setChecking(false);
      return;
    }

    if (!isAuthenticated()) {
      router.replace(loginPath);
      return;
    }

    setChecking(false);
  }, [pathname, router, loginPath, publicPaths]);

  // Loading state while checking auth
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy-900">
        <div className="text-center space-y-4 animate-fade">
          <Loader2 size={32} className="animate-spin text-purple-400 mx-auto" />
          <p className="text-sm text-slate-500 font-medium tracking-wide">
            Checking authentication…
          </p>
        </div>
      </div>
    );
  }

  // If we're on a public path, render children immediately
  if (publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return <>{children}</>;
  }

  // Authenticated — render the protected content
  return <>{children}</>;
}
