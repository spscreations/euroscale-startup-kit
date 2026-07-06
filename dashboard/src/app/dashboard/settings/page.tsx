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
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";

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

  const initials = (session?.name?.charAt(0)?.toUpperCase() ?? name.charAt(0).toUpperCase() ?? "?");
  const userEmail = session?.email ?? "user@example.com";

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
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-4">
              <Avatar size="lg">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted">
                    Name
                  </label>
                  {editing ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="flex-1"
                        autoFocus
                        onKeyDown={(e) => e.key === "Enter" && handleSave()}
                      />
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={handleSave}
                        disabled={saving || !name.trim()}
                      >
                        {saving ? (
                          <span className="block h-4 w-4 animate-spin rounded-full border-2 border-success/30 border-t-success" />
                        ) : (
                          <Check size={15} className="text-success" />
                        )}
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        onClick={() => {
                          setEditing(false);
                          setName(session?.name ?? "User");
                        }}
                      >
                        <X size={15} />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {session?.name ?? name}
                      </span>
                      <Button
                        onClick={() => setEditing(true)}
                        size="icon-xs"
                        variant="ghost"
                        className="min-w-[44px] min-h-[44px]"
                        title="Edit name"
                      >
                        <Pencil size={13} />
                      </Button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-text-muted">
                    Email
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-text-secondary">
                      {userEmail}
                    </span>
                    <BadgeCheck size={13} className="text-success" />
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-3">
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
          </CardContent>
        </Card>

        {/* API Keys */}
        <Card>
          <CardHeader>
            <CardTitle>API Keys</CardTitle>
            <CardDescription>Manage programmatic access to the EuroScale API</CardDescription>
          </CardHeader>
          <CardContent>
            <ApiKeys />
          </CardContent>
        </Card>

        {/* Allowed IPs */}
        <Card>
          <CardHeader>
            <CardTitle>Allowed IPs</CardTitle>
            <CardDescription>Restrict API access to specific IP addresses</CardDescription>
          </CardHeader>
          <CardContent>
            <AllowedIPs />
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Choose what you get notified about</CardDescription>
          </CardHeader>
          <CardContent>
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
                  <Switch
                    checked={x.en}
                    onCheckedChange={() => togglePref(x.id)}
                    id={"pref-" + x.id}
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-dashed border-border-subtle p-3 text-center">
              <Mail size={18} className="mx-auto mb-1.5 text-text-disabled" />
              <p className="text-xs text-text-muted">
                Notifications sent to {userEmail}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Billing */}
        <Card>
          <CardHeader>
            <CardTitle>Billing</CardTitle>
            <CardDescription>Your current plan and usage</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
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
              <Button variant="outline" size="sm">
                Change Plan
                <ChevronRight size={13} />
              </Button>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                <span className="text-text-muted">{plan.usageLbl}</span>
                <span className="text-text-secondary font-medium">
                  {plan.usagePct}%
                </span>
              </div>
              <Progress value={plan.usagePct} className="h-1.5" />
            </div>

            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
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

            <Separator />
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm">
              <CreditCard size={13} />
              Payment Methods
              <ExternalLink size={11} />
            </Button>
            <Button variant="outline" size="sm">
              <ArrowUpRight size={13} />
              View Invoices
            </Button>
            <Button variant="outline" size="sm">
              <Globe size={13} />
              Manage Tax Info
            </Button>
          </CardFooter>
        </Card>

        <p className="text-center text-xs text-text-disabled pb-4">
          EuroScale — European Database Platform · Version 0.1.0
        </p>
      </div>
    </div>
  );
}
