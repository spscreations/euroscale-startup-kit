import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="max-w-lg w-full text-center space-y-8 animate-fade-in">
        {/* Brand */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-text-primary">
            EuroScale
          </h1>
          <p className="text-base text-text-secondary leading-relaxed max-w-sm mx-auto">
            Sovereign EU database infrastructure — managed Vitess clusters on
            European soil.
          </p>
        </div>

        {/* Status indicator */}
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-1 px-3 py-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
          </span>
          <span className="text-xs text-text-muted">Dashboard is live</span>
        </div>

        {/* CTAs */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-hover active:bg-accent-pressed transition-colors min-h-[44px]"
          >
            Sign in
            <ArrowRight size={15} />
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-1 px-5 py-3 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors min-h-[44px]"
          >
            Create account
          </Link>
        </div>

        {/* Footer */}
        <p className="text-xs text-text-disabled pt-2">
          EU sovereign infrastructure · GDPR by architecture
        </p>
      </div>
    </main>
  );
}
