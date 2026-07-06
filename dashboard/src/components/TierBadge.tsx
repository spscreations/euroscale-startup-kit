"use client";

import { useUsage } from "@/hooks/useUsage";
import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  scale: "Scale",
  team: "Team",
  business: "Business",
  enterprise: "Enterprise",
};

const TIER_STYLES: Record<string, string> = {
  free: "",
  scale: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  team: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  business: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  enterprise: "bg-green-500/10 text-green-400 border-green-500/20",
};

export default function TierBadge() {
  const { data, isLoading } = useUsage();

  if (isLoading || !data) return null;

  const tier = data.tier || "free";
  const label = TIER_LABELS[tier] || tier;
  const customStyle = TIER_STYLES[tier] || TIER_STYLES.free;

  return (
    <Badge
      variant={tier === "free" ? "secondary" : "outline"}
      className={cn(
        "gap-1 rounded-full text-[11px] font-semibold leading-none px-2 py-0.5 h-auto",
        customStyle
      )}
    >
      {tier === "enterprise" && <Star size={10} />}
      {label}
    </Badge>
  );
}
