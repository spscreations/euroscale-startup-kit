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
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

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
    <div className="space-y-6">
      {/* Current plan skeleton */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
          <Skeleton className="h-4 w-48" />
        </CardContent>
      </Card>

      {/* Plan cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-3">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-7 w-16" />
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((j) => (
                  <Skeleton key={j} className="h-3 w-full" />
                ))}
              </div>
              <Skeleton className="h-9 w-full rounded-md" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Invoice skeleton */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-5 w-24" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        </CardContent>
      </Card>
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
      <Card>
        <CardContent className="p-4">
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
        </CardContent>
      </Card>

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
              <Card
                key={plan.key}
                className={cn(
                  isCurrent
                    ? "border-accent bg-accent-subtle"
                    : "border-border-subtle bg-surface-1",
                )}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{plan.label}</CardTitle>
                  <CardDescription className="text-lg font-bold text-text-primary mt-1">
                    {plan.price}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pb-2">
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
                </CardContent>

                <CardFooter>
                  {isCurrent ? (
                    <Button
                      variant="secondary"
                      disabled
                      className="w-full min-h-[44px] text-xs font-semibold"
                    >
                      Current Plan
                    </Button>
                  ) : isLower ? (
                    <Button
                      variant="outline"
                      disabled
                      className="w-full min-h-[44px] text-xs font-medium"
                    >
                      Already included
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => handleUpgrade(plan.key)}
                      disabled={isUpgrading || paymentLoading}
                      className="w-full min-h-[44px] text-xs font-semibold"
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
                    </Button>
                  )}
                </CardFooter>
              </Card>
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

        <Card>
          <CardContent className="p-0">
            {invoicesLoading ? (
              /* Loading skeleton for invoices */
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-md" />
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs">Amount</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Invoice</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(inv.date)}
                        </TableCell>
                        <TableCell>{inv.description}</TableCell>
                        <TableCell className="font-medium">
                          {inv.amount}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              inv.status === "paid"
                                ? "default"
                                : inv.status === "pending"
                                  ? "secondary"
                                  : inv.status === "failed"
                                    ? "destructive"
                                    : "outline"
                            }
                            className="text-[11px] font-medium"
                          >
                            {formatStatus(inv.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <a
                            href={inv.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-accent-text transition-colors hover:bg-accent-subtle"
                          >
                            <Download size={12} />
                            PDF
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
