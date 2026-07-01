"use client";

import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { session, isLoading } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-[#0a0f2a] to-slate-950">
      {/* Navigation */}
      <nav className="border-b border-white/5">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#6d5dfd] to-[#a78bfa] flex items-center justify-center text-white font-bold text-sm">
              E
            </div>
            <span className="text-lg font-semibold text-white">{APP_NAME}</span>
          </div>
          <div className="flex items-center gap-4">
            {isLoading ? (
              <div className="h-8 w-20 animate-pulse rounded-lg bg-white/5" />
            ) : session ? (
              <Link
                href="/databases"
                className="rounded-lg bg-[#6d5dfd] px-4 py-2 text-sm font-medium text-white hover:bg-[#5b4de5] transition-colors"
              >
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="rounded-lg bg-[#6d5dfd] px-4 py-2 text-sm font-medium text-white hover:bg-[#5b4de5] transition-colors"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="mx-auto max-w-6xl px-6 pt-24 pb-32">
        <div className="text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-[#6d5dfd]/20 bg-[#6d5dfd]/5 px-4 py-1.5 text-sm text-[#a78bfa]">
            <span className="h-2 w-2 rounded-full bg-[#34d399] animate-pulse" />
            European Cloud — GDPR Compliant
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl">
            Serverless MySQL
            <br />
            <span className="bg-gradient-to-r from-[#6d5dfd] to-[#a78bfa] bg-clip-text text-transparent">
              Built for Europe
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
            Provision and scale Vitess-powered MySQL databases with zero ops.
            PlanetScale-compatible APIs, automated backups, and full GDPR
            compliance — hosted on sovereign European infrastructure.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/signup"
              className="rounded-lg bg-[#6d5dfd] px-8 py-3 text-base font-medium text-white hover:bg-[#5b4de5] transition-colors"
            >
              Start free
            </Link>
            <a
              href="#how-it-works"
              className="rounded-lg border border-white/10 px-8 py-3 text-base font-medium text-slate-300 hover:bg-white/5 transition-colors"
            >
              How it works
            </a>
          </div>
        </div>

        {/* Features grid */}
        <div
          id="how-it-works"
          className="mt-32 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-white/5 bg-white/[0.02] p-6 hover:bg-white/[0.04] transition-colors"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#6d5dfd]/10 text-[#a78bfa]">
                {feature.icon}
              </div>
              <h3 className="text-base font-semibold text-white">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <footer className="mt-32 border-t border-white/5 pt-8 text-center text-sm text-slate-500">
          &copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.
          Hosted in the EU.
        </footer>
      </main>
    </div>
  );
}

const features = [
  {
    icon: "⚡",
    title: "Instant Provisioning",
    description:
      "Provision a Vitess database in seconds with auto-generated credentials and TLS.",
  },
  {
    icon: "🔄",
    title: "Automatic Scaling",
    description:
      "Scale reads and writes horizontally across Vitess tablets with zero downtime.",
  },
  {
    icon: "🔒",
    title: "GDPR Compliant",
    description:
      "All data stays on sovereign European infrastructure with encryption at rest and in transit.",
  },
  {
    icon: "💾",
    title: "Automated Backups",
    description:
      "Daily snapshots with point-in-time recovery. Off-site backup copies in a second region.",
  },
  {
    icon: "🔑",
    title: "Credential Rotation",
    description:
      "Rotate database credentials with a single API call. Old credentials are immediately invalidated.",
  },
  {
    icon: "📊",
    title: "Real-time Monitoring",
    description:
      "Track query performance, connection pools, and storage usage from the dashboard.",
  },
];
