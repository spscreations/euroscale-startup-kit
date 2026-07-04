"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, Plus, Trash2, Shield, AlertTriangle, Loader2, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/constants";
import { useAuth } from "@/lib/auth";
import toast from "react-hot-toast";

// ── Validation ─────────────────────────────────────────────────────────────

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;

function isValidIP(ip: string): boolean {
  if (!IP_REGEX.test(ip)) return false;

  // Validate each octet is 0-255.
  const parts = (ip.split("/")[0] ?? "").split(".");
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (n < 0 || n > 255) return false;
  }

  // If CIDR, validate prefix length.
  if (ip.includes("/")) {
    const prefix = parseInt(ip.split("/")[1] ?? "", 10);
    if (prefix < 0 || prefix > 32) return false;
  }

  return true;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function AllowedIPs() {
  const { session } = useAuth();
  const [ips, setIps] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newIP, setNewIP] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [clientIP, setClientIP] = useState<string | null>(null);
  const [fetchingIP, setFetchingIP] = useState(true);

  const userId = session?.id;

  // Fetch current IPs.
  const fetchIPs = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/ip-whitelist`, {
        headers: {
          "X-User-ID": userId,
          Authorization: `Bearer ${session?.token ?? ""}`,
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Failed to fetch allowed IPs");
      }
      const data = await res.json();
      setIps(data.ips ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load IP whitelist");
    } finally {
      setLoading(false);
    }
  }, [userId, session?.token]);

  // Fetch client's public IP.
  const fetchClientIP = useCallback(async () => {
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      if (res.ok) {
        const data = await res.json();
        setClientIP(data.ip);
      }
    } catch {
      // Silently fail — the client IP badge is informational only.
    } finally {
      setFetchingIP(false);
    }
  }, []);

  useEffect(() => {
    fetchIPs();
    fetchClientIP();
  }, [fetchIPs, fetchClientIP]);

  // Add IP.
  const handleAdd = useCallback(async () => {
    const ip = newIP.trim();
    if (!ip) return;
    if (!isValidIP(ip)) {
      toast.error("Please enter a valid IP address (e.g. 192.168.1.1 or 10.0.0.0/24)");
      return;
    }

    setAdding(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/ip-whitelist`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": userId ?? "",
          Authorization: `Bearer ${session?.token ?? ""}`,
        },
        body: JSON.stringify({ ip }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Failed to add IP");
      }
      const data = await res.json();
      setIps(data.ips ?? []);
      setNewIP("");
      toast.success(`Added ${ip} to allowed IPs`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add IP");
    } finally {
      setAdding(false);
    }
  }, [newIP, userId, session?.token]);

  // Remove IP.
  const handleRemove = useCallback(
    async (ip: string) => {
      setRemoving(ip);
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/ip-whitelist`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "X-User-ID": userId ?? "",
            Authorization: `Bearer ${session?.token ?? ""}`,
          },
          body: JSON.stringify({ ip }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? "Failed to remove IP");
        }
        const data = await res.json();
        setIps(data.ips ?? []);
        toast.success(`Removed ${ip} from allowed IPs`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to remove IP");
      } finally {
        setRemoving(null);
      }
    },
    [userId, session?.token],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Current IP badge */}
      <div className="mb-3 flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
        <Wifi size={14} className="text-text-muted shrink-0" />
        <span className="text-xs text-text-muted">Your current IP:</span>
        {fetchingIP ? (
          <Loader2 size={12} className="animate-spin text-text-disabled" />
        ) : clientIP ? (
          <span className="text-xs font-mono font-medium text-accent-text">
            {clientIP}
          </span>
        ) : (
          <span className="text-xs text-text-disabled">Unknown</span>
        )}
      </div>

      {/* Description */}
      <p className="mb-4 text-xs text-text-muted">
        When one or more IPs are added, only connections from the listed IPs
        are allowed to access the EuroScale API. Leave empty to allow all IPs
        (default).
      </p>

      {/* Add IP form */}
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Globe
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={newIP}
            onChange={(e) => setNewIP(e.target.value)}
            placeholder="e.g. 192.168.1.100 or 10.0.0.0/24"
            className="w-full rounded-lg border border-border-subtle bg-surface-2 pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-disabled outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            disabled={adding}
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!newIP.trim() || adding}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors shrink-0 min-h-[44px]",
            newIP.trim() && !adding
              ? "bg-accent text-white hover:bg-accent-hover"
              : "bg-surface-3 text-text-disabled cursor-not-allowed",
          )}
        >
          {adding ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Plus size={14} />
          )}
          Add IP
        </button>
      </div>

      {/* Validation hint */}
      {newIP.trim() && !isValidIP(newIP.trim()) && (
        <p className="mb-2 flex items-center gap-1 text-xs text-warning-text">
          <AlertTriangle size={12} />
          Enter a valid IPv4 address (e.g. 192.168.1.1) or CIDR range (e.g.
          10.0.0.0/24)
        </p>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={18} className="animate-spin text-text-muted" />
          <span className="ml-2 text-xs text-text-muted">Loading...</span>
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-lg border border-error-subtle bg-error-subtle/10 p-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-error-text shrink-0" />
            <p className="text-xs text-error-text">{error}</p>
          </div>
          <button
            onClick={fetchIPs}
            className="mt-2 text-xs font-medium text-accent-text hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && ips.length === 0 && (
        <div className="rounded-lg border border-dashed border-border-subtle py-6 text-center">
          <Shield size={28} className="mx-auto mb-2 text-text-disabled" />
          <p className="text-xs text-text-muted">No allowed IPs configured</p>
          <p className="mt-1 text-[11px] text-text-disabled">
            All IPs can currently access your databases. Add IPs above to
            restrict access.
          </p>
        </div>
      )}

      {/* IP list */}
      {!loading && !error && ips.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-2">
            Allowed IPs ({ips.length})
          </p>
          {ips.map((ip) => (
            <div
              key={ip}
              className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 transition-colors hover:bg-surface-2/80"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-subtle">
                  <Globe size={14} className="text-accent-text" />
                </div>
                <span className="font-mono text-xs text-text-primary truncate">
                  {ip}
                </span>
                {clientIP === ip && (
                  <span className="shrink-0 rounded-full bg-success-subtle px-1.5 py-0.5 text-[10px] font-medium text-success-text">
                    You
                  </span>
                )}
              </div>
              <button
                onClick={() => handleRemove(ip)}
                disabled={removing === ip}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-error-subtle hover:text-error-text min-w-[44px] min-h-[44px] flex items-center justify-center disabled:opacity-50"
                title={`Remove ${ip}`}
              >
                {removing === ip ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
