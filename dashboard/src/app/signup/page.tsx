"use client";

import { useState, type FormEvent, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  ArrowRight,
  Loader2,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

function getPasswordChecks(pw: string) {
  return {
    minLength: pw.length >= 8,
    hasUpper: /[A-Z]/.test(pw),
    hasNumber: /[0-9]/.test(pw),
  };
}

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const checks = useMemo(() => getPasswordChecks(password), [password]);
  const passwordsMatch = password === confirm && confirm.length > 0;
  const allChecksPass = checks.minLength && checks.hasUpper && checks.hasNumber;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !email.trim() || !password.trim() || !confirm.trim()) {
      setError("Please fill in all fields.");
      return;
    }
    if (!allChecksPass) {
      setError("Please meet all password requirements.");
      return;
    }
    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }
    if (!agreedToTerms) {
      setError("You must agree to the Terms of Service and Privacy Policy.");
      return;
    }
    setLoading(true);
    try {
      await signup(name, email, password);
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
          <p className="text-sm text-text-muted mt-1">Create your account</p>
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
              {/* Full Name */}
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-medium text-text-secondary">
                  Full name
                </Label>
                <div className="relative">
                  <User
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-disabled pointer-events-none z-10"
                  />
                  <Input
                    id="name"
                    type="text"
                    autoComplete="name"
                    placeholder="Alex Johnson"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={loading}
                    className="pl-9 h-9"
                  />
                </div>
              </div>

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
                    placeholder="alex@company.com"
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
                    autoComplete="new-password"
                    placeholder="Min. 8 characters"
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
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </Button>
                </div>
                {password.length > 0 && (
                  <div className="mt-2 space-y-1 rounded-lg bg-surface-2 border border-border-subtle p-3 animate-fade-in">
                    <Req met={checks.minLength} label="At least 8 characters" />
                    <Req met={checks.hasUpper} label="One uppercase letter" />
                    <Req met={checks.hasNumber} label="One number" />
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <Label htmlFor="confirm" className="text-xs font-medium text-text-secondary">
                  Confirm password
                </Label>
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-text-disabled pointer-events-none z-10"
                  />
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repeat your password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    disabled={loading}
                    className="pl-9 pr-9 h-9"
                  />
                  {confirm.length > 0 &&
                    (passwordsMatch ? (
                      <Check
                        size={16}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-success"
                      />
                    ) : (
                      <X
                        size={16}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-error"
                      />
                    ))}
                </div>
              </div>

              {/* Terms */}
              <div className="flex items-start gap-3">
                <input
                  id="terms"
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  disabled={loading}
                  className="mt-0.5 h-5 w-5 min-w-[44px] min-h-[44px] rounded border-border-default bg-surface-2 accent-accent cursor-pointer"
                />
                <label
                  htmlFor="terms"
                  className="text-xs text-text-muted leading-relaxed cursor-pointer select-none"
                >
                  I agree to the{" "}
                  <span className="text-accent-text hover:text-accent-hover underline underline-offset-2 transition-colors">
                    Terms of Service
                  </span>{" "}
                  and{" "}
                  <span className="text-accent-text hover:text-accent-hover underline underline-offset-2 transition-colors">
                    Privacy Policy
                  </span>
                </label>
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
                    Creating account…
                  </>
                ) : (
                  <>
                    Create account
                    <ArrowRight size={16} />
                  </>
                )}
              </Button>
            </form>

            <p className="text-center text-sm text-text-muted">
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-accent-text hover:text-accent-hover underline underline-offset-4 transition-colors font-medium"
              >
                Sign in
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

function Req({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {met ? (
        <Check size={13} className="text-success shrink-0" />
      ) : (
        <X size={13} className="text-text-disabled shrink-0" />
      )}
      <span
        className={cn(
          "transition-colors",
          met ? "text-success-text" : "text-text-muted"
        )}
      >
        {label}
      </span>
    </div>
  );
}
