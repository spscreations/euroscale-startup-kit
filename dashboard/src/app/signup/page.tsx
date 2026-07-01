"use client";

import { useState, type FormEvent, useMemo } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

interface PasswordChecks {
  minLength: boolean;
  hasUpper: boolean;
  hasNumber: boolean;
}

function getPasswordChecks(pw: string): PasswordChecks {
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

  const passwordChecks = useMemo(() => getPasswordChecks(password), [password]);
  const passwordsMatch = password === confirm && confirm.length > 0;
  const allChecksPass =
    passwordChecks.minLength && passwordChecks.hasUpper && passwordChecks.hasNumber;

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
      const message =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-navy-900">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-purple-500/5 blur-[120px]" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] rounded-full bg-cyan-400/5 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md animate-slide-up">
        {/* Branding */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
            <span className="gradient-text">EuroScale</span>
          </h1>
          <p className="text-sm text-slate-400 mt-2 font-medium tracking-wide uppercase">
            Create your account
          </p>
        </div>

        {/* Card */}
        <div className="glass-card p-8 md:p-10 animate-fade">
          <h2 className="text-xl font-semibold text-slate-100 mb-1">
            Get started
          </h2>
          <p className="text-sm text-slate-400 mb-6">
            Deploy your first database in minutes
          </p>

          {/* Error banner */}
          {error && (
            <div
              className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 animate-fade"
              role="alert"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Full Name */}
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-slate-300 mb-1.5"
              >
                Full name
              </label>
              <div className="relative">
                <User
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                />
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Alex Johnson"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  className={cn(
                    "w-full rounded-lg bg-navy-800 border border-purple-500/20 pl-10 pr-4 py-2.5",
                    "text-sm text-slate-100 placeholder:text-slate-600",
                    "focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50",
                    "transition-all duration-200",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-300 mb-1.5"
              >
                Email address
              </label>
              <div className="relative">
                <Mail
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="alex@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className={cn(
                    "w-full rounded-lg bg-navy-800 border border-purple-500/20 pl-10 pr-4 py-2.5",
                    "text-sm text-slate-100 placeholder:text-slate-600",
                    "focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50",
                    "transition-all duration-200",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-300 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className={cn(
                    "w-full rounded-lg bg-navy-800 border border-purple-500/20 pl-10 pr-10 py-2.5",
                    "text-sm text-slate-100 placeholder:text-slate-600",
                    "focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50",
                    "transition-all duration-200",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Password requirements */}
              {password.length > 0 && (
                <div className="mt-2 space-y-1 rounded-lg bg-navy-800/60 border border-purple-500/10 p-3 animate-fade">
                  <PasswordReq
                    met={passwordChecks.minLength}
                    label="At least 8 characters"
                  />
                  <PasswordReq
                    met={passwordChecks.hasUpper}
                    label="One uppercase letter"
                  />
                  <PasswordReq
                    met={passwordChecks.hasNumber}
                    label="One number"
                  />
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label
                htmlFor="confirm"
                className="block text-sm font-medium text-slate-300 mb-1.5"
              >
                Confirm password
              </label>
              <div className="relative">
                <Lock
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                />
                <input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={loading}
                  className={cn(
                    "w-full rounded-lg bg-navy-800 border border-purple-500/20 pl-10 pr-4 py-2.5",
                    "text-sm text-slate-100 placeholder:text-slate-600",
                    "focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50",
                    "transition-all duration-200",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                />
                {confirm.length > 0 &&
                  (passwordsMatch ? (
                    <Check
                      size={18}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-green-400"
                    />
                  ) : (
                    <X
                      size={18}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400"
                    />
                  ))}
              </div>
            </div>

            {/* Terms checkbox */}
            <div className="flex items-start gap-3 pt-1">
              <input
                id="terms"
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                disabled={loading}
                className="mt-0.5 h-4 w-4 rounded border-purple-500/30 bg-navy-800 text-purple-500 focus:ring-purple-500/50 cursor-pointer accent-purple-500"
              />
              <label
                htmlFor="terms"
                className="text-xs text-slate-400 leading-relaxed cursor-pointer select-none"
              >
                I agree to the{" "}
                <span className="text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors">
                  Terms of Service
                </span>{" "}
                and{" "}
                <span className="text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors">
                  Privacy Policy
                </span>
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full flex items-center justify-center gap-2 rounded-lg py-2.5",
                "text-sm font-semibold text-white",
                "bg-gradient-to-r from-purple-500 to-purple-400",
                "hover:from-purple-400 hover:to-purple-300",
                "focus:outline-none focus:ring-2 focus:ring-purple-500/50",
                "transition-all duration-200 shadow-lg shadow-purple-500/20",
                "disabled:opacity-60 disabled:cursor-not-allowed",
              )}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Creating account…
                </>
              ) : (
                <>
                  Create account
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Footer link */}
          <p className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-purple-400 hover:text-purple-300 underline underline-offset-4 transition-colors font-medium"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600 mt-6">
          EU sovereign infrastructure &bull; GDPR by architecture
        </p>
      </div>
    </main>
  );
}

/* ── Password requirement row ── */
function PasswordReq({ met, label }: { met: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {met ? (
        <Check size={14} className="text-green-400 shrink-0" />
      ) : (
        <X size={14} className="text-slate-600 shrink-0" />
      )}
      <span className={cn("transition-colors", met ? "text-green-300" : "text-slate-500")}>
        {label}
      </span>
    </div>
  );
}
