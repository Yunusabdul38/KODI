import { cn } from "cn";
import { BadgeCheckIcon } from "lucide-react";
import type { DepositStatus, UnitStatus } from "@/lib/types";

const UNIT: Record<UnitStatus, { label: string; cls: string; dot: string }> = {
  available: { label: "Available", cls: "bg-green-soft text-green-2", dot: "bg-green" },
  reserved: { label: "Deposit being paid", cls: "bg-amber-soft text-amber", dot: "bg-amber" },
  deposit_held: { label: "Deposit held", cls: "bg-blue-soft text-blue", dot: "bg-blue" },
  let: { label: "Let", cls: "bg-sand text-ink-2", dot: "bg-ink-3" },
  unlisted: { label: "Not listed", cls: "bg-sand text-ink-3", dot: "bg-ink-3" },
};

export const unitStatusLabel = (s: UnitStatus) => UNIT[s].label;

export function UnitStatusBadge({ status, className }: { status: UnitStatus; className?: string }) {
  const u = UNIT[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.8rem] font-semibold", u.cls, className)}>
      <span className={cn("size-1.5 rounded-full", u.dot)} aria-hidden="true" />
      {u.label}
    </span>
  );
}

const DEPOSIT: Record<DepositStatus, { label: string; cls: string }> = {
  awaiting_payment: { label: "Waiting for payment", cls: "bg-amber-soft text-amber" },
  held: { label: "Held in escrow", cls: "bg-blue-soft text-blue" },
  refund_requested: { label: "Refund requested", cls: "bg-amber-soft text-amber" },
  disputed: { label: "With the arbiter", cls: "bg-laterite-soft text-laterite-2" },
  released: { label: "Paid to landlord", cls: "bg-green-soft text-green-2" },
  refunded: { label: "Refunded", cls: "bg-sand text-ink-2" },
  expired: { label: "Expired", cls: "bg-sand text-ink-3" },
};

export function DepositStatusPill({ status, className }: { status: DepositStatus; className?: string }) {
  const d = DEPOSIT[status];
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-[0.8rem] font-semibold", d.cls, className)}>{d.label}</span>;
}

export function VerifiedBadge({ verified, className }: { verified: boolean; className?: string }) {
  if (!verified) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[0.85rem] font-semibold text-green-2", className)}>
      <BadgeCheckIcon className="size-4" aria-hidden="true" />
      Verified landlord
    </span>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warn" | "ok" | "error"; children: React.ReactNode; className?: string }) {
  const cls = {
    info: "bg-blue-soft text-ink",
    warn: "bg-amber-soft text-ink",
    ok: "bg-green-soft text-ink",
    error: "bg-clay-soft text-ink",
  }[tone];
  return <div className={cn("rounded-2xl px-4 py-3 text-[0.95rem]", cls, className)}>{children}</div>;
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("progress-track", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="progress-fill" style={{ width: `${Math.max(2, Math.min(100, value * 100))}%` }} />
    </div>
  );
}
