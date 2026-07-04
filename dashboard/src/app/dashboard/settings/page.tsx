"use client";

import { useCallback, useState } from "react";
import {
  User,
  Bell,
  CreditCard,
  Shield,
  Check,
  Pencil,
  Key,
  X,
  Mail,
  Sparkles,
  ArrowUpRight,
  ExternalLink,
  Zap,
  BadgeCheck,
  ChevronRight,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import ApiKeys from "@/components/ApiKeys";
import AllowedIPs from "@/components/AllowedIPs";
import toast from "react-hot-toast";

interface NPref {
  id: string;
  label: string;
  desc: string;
  en: boolean;
  icon: React.ComponentType<{ size: number; className?: string }>;
}

function mkN(): NPref[] {
  return [
    {
      id: "billing",
      label: "Billing alerts",
      desc: "Invoices, payment failures, and plan changes",
      en: true,
      icon: CreditCard,
    },
    {
      id: "usage",
      label: "Usage thresholds",
      desc: "When database storage or connections near limits",
      en: true,
      icon: Zap,
    },
    {
      id: "backups",
      label: "Backup notifications",
      desc: "Daily backup success or failure reports",
      en: true,
      icon: Shield,
    },
    {
      id: "security",
      label: "Security alerts",
      desc: "New login from unrecognized device or location",
      en: false,
      icon: Shield,
    },
    {
      id: "product",
      label: "Product updates",
      desc: "New features, maintenance windows, and changelog",
      en: false,
      icon: Sparkles,
    },
  ];
}

interface BPlan {
  name: string;
  price: string;
  period: string;
  status: "active" | "past_due" | "canceled";
  features: string[];
  usagePct: number;
  usageLbl: string;
}

function mkB(): BPlan {
  return {
    name: "Scale",
    price: "€9",
    period: "per month",
    status: "active",
    features: [
      "Up to 10 databases",
      "5 GB storage per database",
      "Daily automated backups",
      "99.95% SLA",
      "Priority email support",
      "Team members (up to 5)",
    ],
    usagePct: 45,
    usageLbl: "5 of 10 databases used",
  };
}

function SectionCard({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: React.ComponentType<{ size: number; className?: string }>;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 animate-slide-up overflow-hidden">
      <div className="border-b border-border-subtle px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-subtle">
            <Icon size={16} className="text-accent-text" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              {title}
            </h2>
            {desc && (
              <p className="text-xs text-text-muted">{desc}</p>
            )}
          </div>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Tgl({
  en,
  on,
  id,
}: {
  en: boolean;
  on: (v: boolean) => void;
  id: string;
}) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={en}
      onClick={() => on(!en)}
      className={cn(
        "relative h-4.5 w-8 shrink-0 rounded-full transition-colors duration-200",
        en ? "bg-accent" : "bg-surface-3",
      )}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all duration-200",
          en ? "translate-x-[14px]" : "translate-x-0",
        )}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { session } = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(session?.name ?? "User");
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState(mkN);

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setEditing(false);
    toast.success("Profile name updated");
  }, [name]);

  const togglePref = useCallback((id: string) => {
    setPrefs((pr) =>
      pr.map((x) => (x.id === id ? { ...x, en: !x.en } : x)),
    );
    toast.success("Notification preference updated");
  }, []);

  const plan = mkB();

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 px-6 py-6">
        <div className="mb-1">
          <h1 className="text-lg font-semibold text-text-primary">
            Settings
          </h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Manage your account, API keys, and billing
          </p>
        </div>

        {/* Profile */}
        <SectionCard icon={User} title="Profile">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-sm font-bold text-accent-text">
              {session?.name?.charAt(0)?.toUpperCase() ??
                name.charAt(0).toUpperCase() ??
                "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted">
                  Name
                </label>
                {editing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="flex-1 rounded-lg border border-border-subtle bg-surface-2 px-3 py-1.5 text-sm text-text-primary placeholder:text-text-disabled outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleSave()}
                    />
                    <button
                      onClick={handleSave}
                      disabled={saving || !name.trim()}
                      className={cn(
                        "rounded-lg p-1.5 transition-colors",
                        saving || !name.trim()
                          ? "text-text-disabled cursor-not-allowed"
                          : "text-success hover:bg-success-subtle",
                      )}
                    >
                      {saving ? (
                        <span className="block h-4 w-4 animate-spin rounded-full border-2 border-success/30 border-t-success" />
                      ) : (
                        <Check size={15} />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setEditing(false);
                        setName(session?.name ?? "User");
                      }}
                      className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">
                      {session?.name ?? name}
                    </span>
                    <button
                      onClick={() => setEditing(true)}
                      className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-2 hover:text-accent-text min-w-[44px] min-h-[44px] flex items-center justify-center"
                      title="Edit name"
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted">
                  Email
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-text-secondary">
                    {session?.email ?? "user@example.com"}
                  </span>
                  <BadgeCheck size={13} className="text-success" />
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Member since
              </p>
              <p className="mt-0.5 text-xs text-text-secondary">June 2026</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted">
                Account ID
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-text-disabled">
                {session?.id
                  ? "usr_" + session.id.slice(0, 8)
                  : "usr_abc12345"}
              </p>
            </div>
          </div>
        </SectionCard>

        {/* API Keys */}
        <SectionCard
          icon={Key}
          title="API Keys"
          desc="Manage programmatic access to the EuroScale API"
        >
          <ApiKeys />
        </SectionCard>

        {/* Allowed IPs */}
        <SectionCard
          icon={Shield}
          title="Allowed IPs"
          desc="Restrict API access to specific IP addresses"
        >
          <AllowedIPs />
        </SectionCard>

        {/* Notifications */}
        <SectionCard
          icon={Bell}
          title="Notifications"
          desc="Choose what you get notified about"
        >
          <div className="space-y-0.5">
            {prefs.map((x) => (
              <div
                key={x.id}
                className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-surface-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-2 text-text-muted">
                    <x.icon size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-primary">
                      {x.label}
                    </p>
                    <p className="text-xs text-text-muted truncate">
                      {x.desc}
                    </p>
                  </div>
                </div>
                <Tgl en={x.en} on={() => togglePref(x.id)} id={"pref-" + x.id} />
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-lg border border-dashed border-border-subtle p-3 text-center">
            <Mail size={18} className="mx-auto mb-1.5 text-text-disabled" />
            <p className="text-xs text-text-muted">
              Notifications sent to {session?.email ?? "your account email"}
            </p>
          </div>
        </SectionCard>

        {/* Billing */}
        <SectionCard icon={CreditCard} title="Billing" desc="Your current plan and usage">
          <div className="mb-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-text-primary">
                    {plan.name}
                  </h3>
                  <span className="rounded-full bg-success-subtle px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-success-text">
                    Active
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-text-muted">
                  {plan.price}{" "}
                  <span className="text-xs">{plan.period}</span>
                </p>
              </div>
              <button className="flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-border-default hover:text-text-primary min-h-[44px]">
                Change Plan
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
          <div className="mb-5">
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="text-text-muted">{plan.usageLbl}</span>
              <span className="text-text-secondary font-medium">
                {plan.usagePct}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: plan.usagePct + "%" }}
              />
            </div>
          </div>
          <div className="mb-5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {plan.features.map((f) => (
              <div
                key={f}
                className="flex items-center gap-1.5 text-xs text-text-secondary"
              >
                <Check size={12} className="text-success shrink-0" />
                {f}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3.5">
            <button className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-border-default hover:text-text-primary min-h-[44px]">
              <CreditCard size={13} />
              Payment Methods
              <ExternalLink size={11} />
            </button>
            <button className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-border-default hover:text-text-primary min-h-[44px]">
              <ArrowUpRight size={13} />
              View Invoices
            </button>
            <button className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-border-default hover:text-text-primary min-h-[44px]">
              <Globe size={13} />
              Manage Tax Info
            </button>
          </div>
        </SectionCard>

        <p className="text-center text-xs text-text-disabled pb-4">
          EuroScale — European Database Platform · Version 0.1.0
        </p>
      </div>
    </div>
  );
}
