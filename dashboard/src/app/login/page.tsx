"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-bg-primary">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Brand */}
        <div className="text-center mb-8">
          <Image
            src="/logo.png"
            alt="EuroScale"
            width={48}
            height={48}
            className="mx-auto mb-3"
            priority
          />
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            EuroScale
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Sign in to your account
          </p>
        </div>

        {/* Card */}
        <Card className="border-border-subtle bg-surface-1">
          <CardContent className="space-y-4">
            {/* Error */}
            {error && (
              <div
                className="rounded-lg border border-error-subtle bg-error-subtle px-3 py-2.5 text-sm text-error-text flex items-start gap-2"
                role="alert"
              >
                <AlertCircle size={15} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-text-secondary">
                  Email address
                </Label>
                <div className="relative">
                  <Mail
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-disabled pointer-events-none z-10"
                  />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="pl-9 h-9"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium text-text-secondary">
                  Password
                </Label>
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-disabled pointer-events-none z-10"
                  />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="pl-9 pr-9 h-9"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </Button>
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={loading}
                size="lg"
                className="w-full min-h-[44px]"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight size={16} />
                  </>
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-text-muted">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="text-accent-text hover:text-accent-hover underline underline-offset-4 transition-colors font-medium"
              >
                Create one
              </Link>
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-text-disabled mt-6">
          EU sovereign infrastructure · GDPR by architecture
        </p>
      </div>
    </main>
  );
}
