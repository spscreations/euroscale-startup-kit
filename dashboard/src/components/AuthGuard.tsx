"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
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
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const isPublic = publicPaths.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    );
    if (isPublic) {
      setChecking(false);
      return;
    }
    if (!isAuthenticated()) {
      router.replace(loginPath);
      return;
    }
    setChecking(false);
  }, [pathname, router, loginPath, publicPaths]);

  if (checking) {
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

  const isPublic = publicPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  if (isPublic) return <>{children}</>;

  return <>{children}</>;
}
