"use client";

import { useCallback, useState, type FormEvent } from "react";
import {
  Shield,
  Globe,
  Plus,
  Trash2,
  Copy,
  Check,
  X,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { cn, copyToClipboard, formatDate } from "@/lib/utils";
import { useIPWhitelist } from "@/hooks/useIPWhitelist";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// ── CIDR Validation ────────────────────────────────────────────────────────

/**
 * Validates a CIDR notation string (IPv4 only).
 * Accepts formats like "192.168.1.0/24" or "10.0.0.1/32".
 */
function isValidCIDR(cidr: string): boolean {
  const parts = cidr.split("/");
  if (parts.length !== 2) return false;

  const ip = parts[0]!;
  const prefix = parts[1]!;

  // Validate prefix (0-32)
  const prefixNum = parseInt(prefix, 10);
  if (isNaN(prefixNum) || prefixNum < 0 || prefixNum > 32) return false;
  if (String(prefixNum) !== prefix) return false; // no leading zeros

  // Validate IPv4 address
  const octets = ip.split(".");
  if (octets.length !== 4) return false;

  for (const octet of octets) {
    const num = parseInt(octet!, 10);
    if (isNaN(num) || num < 0 || num > 255) return false;
    if (String(num) !== octet) return false; // no leading zeros
  }

  return true;
}

// ── Types ───────────────────────────────────────────────────────────────────

interface IPWhitelistProps {
  databaseId: string;
}

// ── Add Entry Dialog ─────────────────────────────────────────────────────────

interface AddEntryDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (cidr: string, description: string) => Promise<void>;
  isAdding: boolean;
}

function isIPv4(ip: string): boolean {
  const octets = ip.split(".");
  if (octets.length !== 4) return false;
  for (const octet of octets) {
    const num = parseInt(octet!, 10);
    if (isNaN(num) || num < 0 || num > 255) return false;
    if (String(num) !== octet) return false;
  }
  return true;
}

function AddEntryDialog({
  open,
  onClose,
  onAdd,
  isAdding,
}: AddEntryDialogProps) {
  const [cidr, setCidr] = useState("");
  const [description, setDescription] = useState("");
  const [cidrError, setCidrError] = useState<string | null>(null);
  const [isDetectingIp, setIsDetectingIp] = useState(false);

  const validateAndSetCidr = useCallback((value: string) => {
    setCidr(value);
    if (value && !isValidCIDR(value)) {
      setCidrError("Invalid CIDR format (e.g., 192.168.1.0/24)");
    } else {
      setCidrError(null);
    }
  }, []);

  const handleUseCurrentIp = useCallback(async () => {
    setIsDetectingIp(true);
    try {
      let data: { ip?: string } | null = null;
      try {
        const res = await fetch("https://api.ipify.org?format=json");
        if (!res.ok) throw new Error("ipify failed");
        data = (await res.json()) as { ip?: string };
      } catch {
        const res = await fetch("https://api64.ipify.org?format=json");
        if (!res.ok) throw new Error("ipify64 failed");
        data = (await res.json()) as { ip?: string };
      }

      const ip = data?.ip?.trim();
      if (!ip) throw new Error("No IP in response");

      if (!isIPv4(ip)) {
        toast.error("Only IPv4 is supported for now");
        return;
      }

      const nextCidr = `${ip}/32`;
      setCidr(nextCidr);
      setCidrError(null);
      setDescription((prev) => (prev.trim() ? prev : "My current IP"));
    } catch {
      toast.error("Could not detect public IP");
    } finally {
      setIsDetectingIp(false);
    }
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!cidr.trim() || !isValidCIDR(cidr.trim())) {
        setCidrError("Please enter a valid CIDR");
        return;
      }
      try {
        await onAdd(cidr.trim(), description.trim());
        setCidr("");
        setDescription("");
        setCidrError(null);
        onClose();
      } catch (err) {
        // Error handled by caller via toast
      }
    },
    [cidr, description, onAdd, onClose],
  );

  const handleClose = useCallback(() => {
    setCidr("");
    setDescription("");
    setCidrError(null);
    setIsDetectingIp(false);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add IP to Whitelist</DialogTitle>
          <DialogDescription>
            Allow connections from a specific IP or range
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="cidr-input"
                className="text-xs font-medium uppercase tracking-wider text-text-muted"
              >
                CIDR Range
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUseCurrentIp}
                disabled={isAdding || isDetectingIp}
                className="h-7 gap-1.5 px-2 text-[11px]"
              >
                {isDetectingIp ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Globe size={12} />
                )}
                Use my current IP
              </Button>
            </div>
            <Input
              id="cidr-input"
              type="text"
              value={cidr}
              onChange={(e) => validateAndSetCidr(e.target.value)}
              placeholder="e.g. 192.168.1.0/24, 10.0.0.1/32"
              className={cn(
                cidrError && "border-error-subtle focus:border-error focus:ring-error",
              )}
              autoFocus
              disabled={isAdding || isDetectingIp}
            />
            {cidrError && (
              <p className="mt-1 text-[11px] text-error-text">{cidrError}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="desc-input"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted"
            >
              Description
            </label>
            <Input
              id="desc-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Office VPN, Production server"
              disabled={isAdding}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isAdding}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!cidr.trim() || !!cidrError || isAdding}
            >
              {isAdding ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus size={14} />
                  Add Entry
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Remove Confirm Dialog ──────────────────────────────────────────────────

interface RemoveConfirmProps {
  open: boolean;
  cidr: string;
  onConfirm: () => void;
  onCancel: () => void;
  isRemoving: boolean;
}

function RemoveConfirmDialog({
  open,
  cidr,
  onConfirm,
  onCancel,
  isRemoving,
}: RemoveConfirmProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove Whitelist Entry</DialogTitle>
          <DialogDescription>
            Connections from{" "}
            <code className="font-mono text-text-secondary bg-surface-2 px-1 py-0.5 rounded text-[11px]">
              {cidr}
            </code>{" "}
            will be blocked. This action can be undone by re-adding the
            entry.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isRemoving}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isRemoving}
          >
            {isRemoving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Removing...
              </>
            ) : (
              <>
                <Trash2 size={14} />
                Remove Entry
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Whitelist Entry Row ─────────────────────────────────────────────────────

function WhitelistEntryRow({
  cidr,
  description,
  createdAt,
  onRemove,
}: {
  cidr: string;
  description: string;
  createdAt: string;
  onRemove: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await copyToClipboard(cidr);
      setCopied(true);
      toast.success("CIDR copied to clipboard");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Failed to copy");
    }
  }, [cidr]);

  return (
    <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2.5 transition-colors hover:bg-surface-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-success-subtle">
          <Globe size={13} className="text-success-text" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-xs font-medium text-text-primary truncate font-mono">
              {cidr}
            </code>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-text-muted">
            {description && (
              <span className="truncate max-w-[160px]">{description}</span>
            )}
            <span className="text-text-disabled">
              Added {formatDate(createdAt)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleCopy}
          title="Copy CIDR"
          aria-label="Copy CIDR"
        >
          {copied ? (
            <Check size={13} className="text-success" />
          ) : (
            <Copy size={13} />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onRemove}
          className="text-text-muted hover:text-error-text hover:bg-error-subtle"
          title="Remove entry"
          aria-label="Remove entry"
        >
          <Trash2 size={13} />
        </Button>
      </div>
    </div>
  );
}

// ── Main IPWhitelist Component ──────────────────────────────────────────────

export default function IPWhitelist({ databaseId }: IPWhitelistProps) {
  const {
    entries,
    isLoading,
    error,
    addEntry,
    removeEntry,
    isAdding,
    isRemoving,
  } = useIPWhitelist(databaseId);

  const [showAdd, setShowAdd] = useState(false);
  const [removingCidr, setRemovingCidr] = useState<string | null>(null);

  const handleAdd = useCallback(
    async (cidr: string, description: string) => {
      try {
        await addEntry(cidr, description);
        toast.success("IP whitelist entry added");
      } catch (e: unknown) {
        toast.error(
          e instanceof Error ? e.message : "Failed to add whitelist entry",
        );
        throw e;
      }
    },
    [addEntry],
  );

  const handleRemove = useCallback(async () => {
    if (!removingCidr) return;
    try {
      await removeEntry(removingCidr);
      toast.success("IP whitelist entry removed");
    } catch (e: unknown) {
      toast.error(
        e instanceof Error ? e.message : "Failed to remove whitelist entry",
      );
    }
    setRemovingCidr(null);
  }, [removingCidr, removeEntry]);

  const removingEntry = entries.find((e) => e.cidr === removingCidr);

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-text-disabled" />
            <Skeleton className="h-4 w-24 rounded" />
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5 pt-5">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-warning-text" />
            <CardTitle className="text-sm font-semibold">IP Whitelist</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-5 text-center">
          <p className="text-xs text-text-muted">
            Could not load IP whitelist.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* Section header */}
      <CardHeader className="border-b border-border-subtle px-5 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-accent-text" />
            <CardTitle className="text-sm font-semibold">
              IP Whitelist
            </CardTitle>
          </div>
          <Button
            onClick={() => setShowAdd(true)}
            size="sm"
          >
            <Plus size={14} />
            Add IP
          </Button>
        </div>
        <p className="mt-1 text-xs text-text-muted">
          Only IPs listed here can connect to this database.{" "}
          {entries.length > 0
            ? `${entries.length} entr${entries.length !== 1 ? "ies" : "y"} configured`
            : "No entries — all IPs are blocked."}
        </p>
      </CardHeader>

      {/* Warning when no entries */}
      {entries.length === 0 && (
        <CardContent>
          <div className="rounded-lg border border-warning-subtle bg-warning-subtle/30 p-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle
                size={14}
                className="text-warning-text shrink-0 mt-0.5"
              />
              <div>
                <p className="text-xs font-medium text-warning-text">
                  No IPs whitelisted
                </p>
                <p className="mt-1 text-[11px] text-text-muted">
                  All incoming connections will be blocked until you add at least
                  one IP address or range.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      )}

      {/* Entry list */}
      {entries.length > 0 && (
        <CardContent className="space-y-1.5 pt-5">
          {entries.map((entry) => (
            <WhitelistEntryRow
              key={entry.cidr}
              cidr={entry.cidr}
              description={entry.description}
              createdAt={entry.createdAt}
              onRemove={() => setRemovingCidr(entry.cidr)}
            />
          ))}
        </CardContent>
      )}

      {/* Footer hint */}
      <div className="px-5 pb-4">
        <p className="text-xs text-text-muted">
          Use CIDR notation: <code className="text-text-secondary bg-surface-2 px-1 py-0.5 rounded text-[11px]">/32</code> for a single IP,{" "}
          <code className="text-text-secondary bg-surface-2 px-1 py-0.5 rounded text-[11px]">/24</code> for a subnet. Changes take effect immediately.
        </p>
      </div>

      {/* Dialogs */}
      <AddEntryDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={handleAdd}
        isAdding={isAdding}
      />
      <RemoveConfirmDialog
        open={removingCidr !== null}
        cidr={removingCidr ?? ""}
        onConfirm={handleRemove}
        onCancel={() => setRemovingCidr(null)}
        isRemoving={isRemoving}
      />
    </Card>
  );
}
