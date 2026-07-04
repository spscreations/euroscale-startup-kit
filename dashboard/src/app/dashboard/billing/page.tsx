"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  Crown,
  ArrowUpRight,
  Check,
  FileText,
  Download,
  Loader2,
  ReceiptText,
  CreditCard,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useUsage } from "@/hooks/useUsage";
import { useCreatePayment } from "@/hooks/useCreatePayment";
import { API_BASE_URL } from "@/lib/constants";
import toast from "react-hot-toast";

// ── Tier hierarchy ──────────────────────────────────────────────────────────
const TIER_RANK: Record<string, number> = {
  free: 0,
  scale: 1,
  team: 2,
  business: 3,
  enterprise: 4,
};

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  scale: "Scale",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
};

interface PlanOption {
  key: string;
  label: string;
  price: string;
  features: string[];
}

const PLANS: PlanOption[] = [
  {
    key: "scale",
    label: "Scale",
    price: "€29/mo",
    features: [
      "10 databases",
      "30 GB storage",
      "100k reads / 50k writes",
      "Autoscale compute (up to 2 CU)",
      "Email support",
    ],
  },
  {
    key: "team",
    label: "Team",
    price: "€99/mo",
    features: [
      "25 databases",
      "100 GB storage",
      "500k reads / 250k writes",
      "Autoscale compute (up to 8 CU)",
      "Priority support",
    ],
  },
  {
    key: "business",
    label: "Business",
    price: "€399/mo",
    features: [
      "100 databases",
      "500 GB storage",
      "5M reads / 2.5M writes",
      "Autoscale compute (up to 32 CU)",
      "Dedicated support & SLA",
    ],
  },
];

// ── Invoice type ────────────────────────────────────────────────────────────
interface Invoice {
  id: string;
  amount: string;
  date: string;
  description: string;
  status: string;
  pdf_url: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ── Skeleton ────────────────────────────────────────────────────────────────
function BillingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Current plan skeleton */}
      <div className="rounded-lg border border-border-subtle bg-surface-1 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="skeleton h-5 w-32" />
          <div className="skeleton h-8 w-20 rounded-md" />
        </div>
        <div className="skeleton h-4 w-48" />
      </div>

      {/* Plan cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-border-subtle bg-surface-1 p-4 space-y-3"
          >
            <div className="skeleton h-5 w-20" />
            <div className="skeleton h-7 w-16" />
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((j) => (
                <div key={j} className="skeleton h-3 w-full" />
              ))}
            </div>
            <div className="skeleton h-9 w-full rounded-md" />
          </div>
        ))}
      </div>

      {/* Invoice skeleton */}
      <div className="rounded-lg border border-border-subtle bg-surface-1 p-4 space-y-3">
        <div className="skeleton h-5 w-24" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-10 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function BillingPage() {
  const { session } = useAuth();
  const { data, isLoading: usageLoading } = useUsage();
  const { createPayment, isLoading: paymentLoading } = useCreatePayment();
  const searchParams = useSearchParams();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError, setInvoicesError] = useState<string | null>(null);
  const [upgradingTier, setUpgradingTier] = useState<string | null>(null);

  const currentTier = data?.tier ?? "free";
  const currentRank = TIER_RANK[currentTier] ?? 0;

  // ── Mollie redirect detection ───────────────────────────────────────────
  useEffect(() => {
    const paymentStatus = searchParams.get("payment");
    if (paymentStatus === "success") {
      toast.success("Payment successful! Your plan has been updated.");
    } else if (paymentStatus === "cancelled") {
      toast.error("Payment was cancelled. Your plan has not been changed.");
    }
  }, [searchParams]);

  // ── Fetch invoices ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.id) return;

    setInvoicesLoading(true);
    setInvoicesError(null);

    fetch(`${API_BASE_URL}/api/v1/invoices?user_id=${encodeURIComponent(session.id)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load invoices");
        const body = await res.json();
        setInvoices(body.invoices ?? []);
      })
      .catch((err) => {
        setInvoicesError(err.message ?? "Failed to load invoices");
        setInvoices([]);
      })
      .finally(() => setInvoicesLoading(false));
  }, [session?.id]);

  // ── Upgrade handler ─────────────────────────────────────────────────────
  const handleUpgrade = useCallback(
    async (tier: string) => {
      if (!session?.id) {
        toast.error("Not authenticated");
        return;
      }
      setUpgradingTier(tier);
      try {
        const result = await createPayment(tier);
        window.location.href = result.checkout_url;
      } catch (err: any) {
        toast.error(err.message ?? "Failed to start payment");
      } finally {
        setUpgradingTier(null);
      }
    },
    [session, createPayment],
  );

  // ── Loading ─────────────────────────────────────────────────────────────
  if (usageLoading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <h1 className="text-lg font-bold text-text-primary">Billing</h1>
        <BillingSkeleton />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-2">
        <CreditCard size={20} className="text-text-secondary" />
        <h1 className="text-lg font-bold text-text-primary">Billing</h1>
      </div>

      {/* ── Current Plan ─────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-border-subtle bg-surface-1 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown size={16} className="text-accent-text" />
            <h2 className="text-sm font-semibold text-text-primary">
              Current Plan:{" "}
              <span className="text-accent-text">
                {TIER_LABELS[currentTier] ?? currentTier}
              </span>
            </h2>
          </div>
          {currentTier !== "enterprise" && currentTier !== "business" && (
            <span className="text-xs text-text-muted">
              {TIER_LABELS[currentTier] === "Free"
                ? "Upgrade to unlock more resources"
                : "Need more? Upgrade below"}
            </span>
          )}
        </div>
      </section>

      {/* ── Upgrade Options ───────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-text-primary mb-3">
          Available Plans
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const planRank = TIER_RANK[plan.key] ?? 0;
            const isCurrent = plan.key === currentTier;
            const isLower = planRank <= currentRank;
            const isUpgrading = upgradingTier === plan.key;

            return (
              <div
                key={plan.key}
                className={cn(
                  "rounded-lg border p-4 space-y-4 transition-colors",
                  isCurrent
                    ? "border-accent bg-accent-subtle"
                    : "border-border-subtle bg-surface-1",
                )}
              >
                {/* Plan name + price */}
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">
                    {plan.label}
                  </h3>
                  <p className="text-lg font-bold text-text-primary mt-1">
                    {plan.price}
                  </p>
                </div>

                {/* Features */}
                <ul className="space-y-2">
                  {plan.features.map((feature, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-xs text-text-secondary"
                    >
                      <Check
                        size={14}
                        className="shrink-0 mt-0.5 text-accent-text"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* Action button */}
                {isCurrent ? (
                  <span className="block w-full rounded-md px-4 py-2 text-xs font-semibold text-accent-text bg-accent-subtle text-center min-h-[44px] flex items-center justify-center">
                    Current Plan
                  </span>
                ) : isLower ? (
                  <span className="block w-full rounded-md px-4 py-2 text-xs font-medium text-text-muted bg-surface-2 text-center min-h-[44px] flex items-center justify-center">
                    Already included
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleUpgrade(plan.key)}
                    disabled={isUpgrading || paymentLoading}
                    className={cn(
                      "w-full rounded-md px-4 py-2 text-xs font-semibold text-white transition-colors",
                      "bg-accent hover:bg-accent-hover active:bg-accent-pressed",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      "min-h-[44px] flex items-center justify-center gap-1.5",
                    )}
                  >
                    {isUpgrading ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Redirecting…
                      </>
                    ) : (
                      <>
                        Upgrade
                        <ArrowUpRight size={12} />
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Invoice History ───────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <ReceiptText size={16} className="text-text-secondary" />
          <h2 className="text-sm font-semibold text-text-primary">
            Invoice History
          </h2>
        </div>

        <div className="rounded-lg border border-border-subtle bg-surface-1 overflow-hidden">
          {invoicesLoading ? (
            /* Loading skeleton for invoices */
            <div className="animate-pulse p-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-10 w-full rounded-md" />
              ))}
            </div>
          ) : invoicesError ? (
            /* Error state */
            <div className="flex items-center gap-2 p-6 text-sm text-text-muted">
              <AlertCircle size={16} className="text-error shrink-0" />
              {invoicesError}
            </div>
          ) : invoices.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-10 text-text-muted gap-2">
              <FileText size={32} className="opacity-40" />
              <p className="text-sm">No invoices yet</p>
              <p className="text-xs">
                Invoices will appear here once you have active subscriptions.
              </p>
            </div>
          ) : (
            /* Invoice table */
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border-subtle text-text-muted">
                    <th className="text-left px-4 py-3 font-medium">Date</th>
                    <th className="text-left px-4 py-3 font-medium">
                      Description
                    </th>
                    <th className="text-left px-4 py-3 font-medium">Amount</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium">
                      Invoice
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-border-subtle last:border-0 hover:bg-surface-2 transition-colors"
                    >
                      <td className="px-4 py-3 text-text-primary whitespace-nowrap">
                        {formatDate(inv.date)}
                      </td>
                      <td className="px-4 py-3 text-text-primary">
                        {inv.description}
                      </td>
                      <td className="px-4 py-3 text-text-primary font-medium">
                        {inv.amount}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                            inv.status === "paid"
                              ? "bg-success/10 text-success"
                              : inv.status === "pending"
                                ? "bg-warning/10 text-warning"
                                : inv.status === "failed"
                                  ? "bg-error/10 text-error"
                                  : "bg-surface-2 text-text-muted",
                          )}
                        >
                          {formatStatus(inv.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <a
                          href={inv.pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                            "text-accent-text hover:bg-accent-subtle",
                          )}
                        >
                          <Download size={12} />
                          PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
