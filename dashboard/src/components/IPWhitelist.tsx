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
import toast from "react-hot-toast";

// ── CIDR Validation ────────────────────────────────────────────────────────

/**
 * Validates a CIDR notation string (IPv4 only).
 * Accepts formats like "192.168.1.0/24" or "10.0.0.1/32".
 */
function isValidCIDR(cidr: string): boolean {
  const parts = cidr.split("/");
  if (parts.length !== 2) return false;

  const ip = parts[0];
  const prefix = parts[1];

  // Validate prefix (0-32)
  const prefixNum = parseInt(prefix, 10);
  if (isNaN(prefixNum) || prefixNum < 0 || prefixNum > 32) return false;
  if (String(prefixNum) !== prefix) return false; // no leading zeros

  // Validate IPv4 address
  const octets = ip.split(".");
  if (octets.length !== 4) return false;

  for (const octet of octets) {
    const num = parseInt(octet, 10);
    if (isNaN(num) || num < 0 || num > 255) return false;
    if (String(num) !== octet) return false; // no leading zeros
  }

  return true;
}

// ── Types ───────────────────────────────────────────────────────────────────

interface IPWhitelistProps {
  databaseId: string;
}

// ── Add Entry Modal ─────────────────────────────────────────────────────────

interface AddEntryModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (cidr: string, description: string) => Promise<void>;
  isAdding: boolean;
}

function AddEntryModal({
  open,
  onClose,
  onAdd,
  isAdding,
}: AddEntryModalProps) {
  const [cidr, setCidr] = useState("");
  const [description, setDescription] = useState("");
  const [cidrError, setCidrError] = useState<string | null>(null);

  const validateAndSetCidr = useCallback((value: string) => {
    setCidr(value);
    if (value && !isValidCIDR(value)) {
      setCidrError("Invalid CIDR format (e.g., 192.168.1.0/24)");
    } else {
      setCidrError(null);
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
    onClose();
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div className="relative w-full max-w-md animate-slide-up">
        <div className="rounded-xl border border-border-subtle bg-surface-1 p-5 shadow-2xl">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-subtle">
                <Shield size={16} className="text-accent-text" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  Add IP to Whitelist
                </h3>
                <p className="text-xs text-text-muted">
                  Allow connections from a specific IP or range
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="cidr-input"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-text-muted"
              >
                CIDR Range
              </label>
              <input
                id="cidr-input"
                type="text"
                value={cidr}
                onChange={(e) => validateAndSetCidr(e.target.value)}
                placeholder="e.g. 192.168.1.0/24, 10.0.0.1/32"
                className={cn(
                  "w-full rounded-lg border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none transition-colors",
                  cidrError
                    ? "border-error-subtle focus:border-error focus:ring-1 focus:ring-error"
                    : "border-border-subtle focus:border-accent focus:ring-1 focus:ring-accent",
                )}
                autoFocus
                disabled={isAdding}
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
              <input
                id="desc-input"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Office VPN, Production server"
                className="w-full rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
                disabled={isAdding}
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleClose}
                disabled={isAdding}
                className="rounded-lg border border-border-subtle px-3.5 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-border-default hover:text-text-primary disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!cidr.trim() || !!cidrError || isAdding}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors",
                  cidr.trim() && !cidrError && !isAdding
                    ? "bg-accent text-white hover:bg-accent-hover"
                    : "bg-surface-3 text-text-disabled cursor-not-allowed",
                )}
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
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
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

function RemoveConfirm({
  open,
  cidr,
  onConfirm,
  onCancel,
  isRemoving,
}: RemoveConfirmProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-sm animate-slide-up">
        <div className="rounded-xl border border-error-subtle bg-surface-1 p-5 shadow-2xl">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-error-subtle">
              <Trash2 size={16} className="text-error-text" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Remove Whitelist Entry
              </h3>
              <p className="mt-1 text-xs text-text-muted">
                Connections from{" "}
                <code className="font-mono text-text-secondary bg-surface-2 px-1 py-0.5 rounded text-[11px]">
                  {cidr}
                </code>{" "}
                will be blocked. This action can be undone by re-adding the
                entry.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2.5">
            <button
              onClick={onCancel}
              disabled={isRemoving}
              className="rounded-lg border border-border-subtle px-3.5 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-border-default hover:text-text-primary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isRemoving}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium text-white transition-colors",
                isRemoving
                  ? "bg-surface-3 text-text-disabled cursor-not-allowed"
                  : "bg-error hover:bg-error/90",
              )}
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
            </button>
          </div>
        </div>
      </div>
    </div>
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
        <button
          onClick={handleCopy}
          className="rounded p-1.5 text-text-muted transition-colors hover:text-accent-text hover:bg-surface-3"
          title="Copy CIDR"
        >
          {copied ? (
            <Check size={13} className="text-success" />
          ) : (
            <Copy size={13} />
          )}
        </button>
        <button
          onClick={onRemove}
          className="rounded p-1.5 text-text-muted transition-colors hover:text-error-text hover:bg-error-subtle"
          title="Remove entry"
        >
          <Trash2 size={13} />
        </button>
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
      <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-text-disabled" />
            <div className="skeleton h-4 w-24 rounded" />
          </div>
        </div>
        <div className="p-5 space-y-1.5">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-10 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-3.5">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-warning-text" />
            <h2 className="text-sm font-semibold text-text-primary">
              IP Whitelist
            </h2>
          </div>
        </div>
        <div className="p-5 text-center">
          <p className="text-xs text-text-muted">
            Could not load IP whitelist.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 overflow-hidden">
      {/* Section header */}
      <div className="border-b border-border-subtle px-5 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-accent-text" />
            <h2 className="text-sm font-semibold text-text-primary">
              IP Whitelist
            </h2>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover"
          >
            <Plus size={14} />
            Add IP
          </button>
        </div>
        <p className="mt-1 text-xs text-text-muted">
          Only IPs listed here can connect to this database.{" "}
          {entries.length > 0
            ? `${entries.length} entr${entries.length !== 1 ? "ies" : "y"} configured`
            : "No entries — all IPs are blocked."}
        </p>
      </div>

      {/* Warning when no entries */}
      {entries.length === 0 && (
        <div className="p-5">
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
        </div>
      )}

      {/* Entry list */}
      {entries.length > 0 && (
        <div className="p-5 space-y-1.5">
          {entries.map((entry) => (
            <WhitelistEntryRow
              key={entry.cidr}
              cidr={entry.cidr}
              description={entry.description}
              createdAt={entry.createdAt}
              onRemove={() => setRemovingCidr(entry.cidr)}
            />
          ))}
        </div>
      )}

      {/* Footer hint */}
      <div className="px-5 pb-4">
        <p className="text-xs text-text-muted">
          Use CIDR notation: <code className="text-text-secondary bg-surface-2 px-1 py-0.5 rounded text-[11px]">/32</code> for a single IP,{" "}
          <code className="text-text-secondary bg-surface-2 px-1 py-0.5 rounded text-[11px]">/24</code> for a subnet. Changes take effect immediately.
        </p>
      </div>

      {/* Modals */}
      <AddEntryModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={handleAdd}
        isAdding={isAdding}
      />
      <RemoveConfirm
        open={removingCidr !== null}
        cidr={removingCidr ?? ""}
        onConfirm={handleRemove}
        onCancel={() => setRemovingCidr(null)}
        isRemoving={isRemoving}
      />
    </div>
  );
}
