"use client";

import { useState, useCallback } from "react";
import { HardDrive, Cpu, Zap, Info, Loader2 } from "lucide-react";
import { cn, formatBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

type StorageCardProps = {
  // ── Storage ──
  storageUsedBytes: number;
  storageLimitBytes: number;
  storagePricePerGB: number;

  // ── Compute ──
  currentCpuUsed: number;
  currentCpuLimit: number;
  cuPricePerHour: number;

  // ── Tier capabilities ──
  maxAutoscaleCU: number;
  canAutoscale: boolean;

  // ── Actions ──
  databaseId: string;
  onApplyStorage: (additionalGb: number) => void;
  onApplyAutoscale: (enabled: boolean, threshold: number, increment: number) => void;
  isApplying: boolean;
};

const ESTIMATED_MONTHLY_HOURS = 730;

export default function StorageCard({
  storageUsedBytes,
  storageLimitBytes,
  storagePricePerGB,
  currentCpuUsed,
  currentCpuLimit,
  cuPricePerHour,
  maxAutoscaleCU,
  canAutoscale,
  databaseId,
  onApplyStorage,
  onApplyAutoscale,
  isApplying,
}: StorageCardProps) {
  // ── Storage state ──
  const [additionalStorageGB, setAdditionalStorageGB] = useState(0);
  const [autoscaleEnabled, setAutoscaleEnabled] = useState(false);
  const [autoscaleThreshold, setAutoscaleThreshold] = useState(80);
  const [autoscaleIncrement, setAutoscaleIncrement] = useState(20);

  // ── Compute state ──
  const [additionalCU, setAdditionalCU] = useState(0);

  // ── Derived values ──
  const storageUsedGB = storageUsedBytes / (1024 * 1024 * 1024);
  const storageLimitGB = storageLimitBytes / (1024 * 1024 * 1024);
  const storageProgress =
    storageLimitBytes > 0
      ? Math.round((storageUsedBytes / storageLimitBytes) * 100)
      : 0;

  const storageCost = additionalStorageGB * storagePricePerGB;
  const computeCost =
    additionalCU * cuPricePerHour * ESTIMATED_MONTHLY_HOURS;
  const totalAddonCost = storageCost + computeCost;

  // ── Handlers ──
  const handleSliderChange =
    (setter: (v: number) => void) =>
    (value: number | readonly number[]) => {
      setter(Array.isArray(value) ? value[0] ?? 0 : value);
    };

  const handleApply = useCallback(() => {
    if (!databaseId) {
      toast.error("No database selected");
      return;
    }
    if (additionalStorageGB === 0 && additionalCU === 0 && !autoscaleEnabled) {
      toast.error("No changes to apply");
      return;
    }
    if (additionalStorageGB > 0) {
      onApplyStorage(additionalStorageGB);
    }
    if (autoscaleEnabled) {
      onApplyAutoscale(autoscaleEnabled, autoscaleThreshold, autoscaleIncrement);
    }
    // Reset state after apply
    setAdditionalStorageGB(0);
    setAdditionalCU(0);
  }, [
    databaseId,
    additionalStorageGB,
    additionalCU,
    autoscaleEnabled,
    autoscaleThreshold,
    autoscaleIncrement,
    onApplyStorage,
    onApplyAutoscale,
  ]);

  return (
    <div className="space-y-4">
      {/* ── Storage Section ── */}
      <div className="rounded-md border border-border-subtle bg-surface-2 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <HardDrive size={14} className="text-text-secondary" />
          <span className="text-xs font-medium text-text-primary">Storage</span>
          <span className="text-[11px] text-muted-foreground ml-auto">
            €{storagePricePerGB.toFixed(2)}/GB/mo
          </span>
        </div>

        {/* Current usage */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Current usage</span>
            <span className="text-text-primary font-medium tabular-nums">
              {storageUsedGB.toFixed(1)} GB / {storageLimitGB.toFixed(0)} GB
            </span>
          </div>
          <Progress
            value={storageProgress}
            className="h-2 [&_[data-slot=progress-indicator]]:bg-accent-text"
          />
        </div>

        {/* Additional Storage */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-muted-foreground">
              Additional Storage:{" "}
              <span className="text-text-primary font-mono font-medium">
                {additionalStorageGB} GB
              </span>
            </label>
            <span className="text-xs text-muted-foreground tabular-nums">
              +€{storageCost.toFixed(2)}/mo
            </span>
          </div>
          <Slider
            value={[additionalStorageGB]}
            onValueChange={handleSliderChange(setAdditionalStorageGB)}
            min={0}
            max={1000}
            step={1}
            className="[&_[data-slot=slider-track]]:bg-border [&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-range]]:bg-accent-text"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0 GB</span>
            <span>1000 GB</span>
          </div>
        </div>

        {/* Autoscale toggle */}
        <Separator className="my-1" />
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Switch
              checked={autoscaleEnabled}
              onCheckedChange={setAutoscaleEnabled}
            />
            <span
              className={cn(
                "text-xs font-medium",
                autoscaleEnabled ? "text-accent-text" : "text-muted-foreground",
              )}
            >
              Autoscale storage
            </span>
            {autoscaleEnabled && (
              <Badge variant="secondary" className="ml-auto">
                <Zap size={10} />
                Autoscale Active
              </Badge>
            )}
          </div>

          {autoscaleEnabled && (
            <div className="space-y-2 pl-7">
              <p className="text-[11px] text-text-muted">
                When storage reaches{" "}
                <Input
                  type="number"
                  min={50}
                  max={95}
                  value={autoscaleThreshold}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 50 && v <= 95)
                      setAutoscaleThreshold(v);
                  }}
                  className="inline-flex w-12 h-5 px-1 text-center text-[11px] mx-0.5 align-middle"
                />
                %, auto-add{" "}
                <Input
                  type="number"
                  min={5}
                  max={100}
                  value={autoscaleIncrement}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v >= 5 && v <= 100)
                      setAutoscaleIncrement(v);
                  }}
                  className="inline-flex w-12 h-5 px-1 text-center text-[11px] mx-0.5 align-middle"
                />
                %
              </p>
              <p className="text-[10px] text-muted-foreground italic">
                Estimated next invoice: €
                {(storageLimitGB * (autoscaleIncrement / 100) * storagePricePerGB).toFixed(2)}{" "}
                at current usage patterns
              </p>
            </div>
          )}

          {!canAutoscale && autoscaleEnabled && (
            <p className="text-[10px] text-warning-text italic pl-7">
              Autoscale not available on your current tier. Upgrade to enable.
            </p>
          )}
        </div>
      </div>

      {/* ── Compute Section ── */}
      <div className="rounded-md border border-border-subtle bg-surface-2 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Cpu size={14} className="text-text-secondary" />
          <span className="text-xs font-medium text-text-primary">Compute</span>
          <span className="text-[11px] text-muted-foreground ml-auto">
            €{cuPricePerHour.toFixed(2)}/CU-hr
          </span>
        </div>

        {/* Current CPU usage */}
        <div className="flex items-center justify-between text-xs py-1">
          <span className="text-text-muted">Current usage</span>
          <span className="text-text-primary font-medium tabular-nums">
            {currentCpuUsed.toFixed(1)} CU / {currentCpuLimit} CU
          </span>
        </div>

        {/* Additional CU */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-muted-foreground">
              Additional CU:{" "}
              <span className="text-text-primary font-mono font-medium">
                {additionalCU} CU
              </span>
            </label>
            <span className="text-xs text-muted-foreground tabular-nums">
              ≈ €{computeCost.toFixed(2)}/mo
            </span>
          </div>
          <Slider
            value={[additionalCU]}
            onValueChange={handleSliderChange(setAdditionalCU)}
            min={0}
            max={maxAutoscaleCU > 0 ? maxAutoscaleCU : 4}
            step={1}
            className="[&_[data-slot=slider-track]]:bg-border [&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-range]]:bg-accent-text"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0 CU</span>
            <span>{maxAutoscaleCU > 0 ? maxAutoscaleCU : 4} CU</span>
          </div>
        </div>
      </div>

      {/* ── Cost Summary & Apply ── */}
      {(storageCost > 0 || computeCost > 0 || autoscaleEnabled) && (
        <div className="flex items-center justify-between rounded-md bg-accent-subtle px-3 py-2">
          <span className="text-xs font-medium text-accent-text">
            Estimated add-on cost
          </span>
          <span className="text-xs font-bold text-accent-text tabular-nums">
            €{totalAddonCost.toFixed(2)}/mo
          </span>
        </div>
      )}

      <Button
        onClick={handleApply}
        disabled={isApplying}
        className="w-full"
      >
        {isApplying ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Applying...
          </>
        ) : (
          "Apply Changes"
        )}
      </Button>
    </div>
  );
}
