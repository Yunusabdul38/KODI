import { formatDateTime } from "@/lib/format";
import type { AuditEntry } from "@/lib/types";

const TEXT: Record<string, string> = {
  deposit_started: "Payment request created",
  deposit_held: "Deposit paid into escrow. Home locked.",
  deposit_expired: "Payment request expired unpaid",
  landlord_handed_over: "Landlord says the keys were handed over",
  tenant_moved_in: "Tenant confirmed they have the keys",
  refund_requested: "Tenant asked for a refund: keys not received",
  landlord_objected: "Landlord objected to the refund",
  dispute_opened: "Dispute opened",
  arbiter_released: "Arbiter decided: pay the landlord",
  arbiter_refunded: "Arbiter decided: refund the tenant",
  refund_window_passed: "48 hours passed without an objection: refund paid",
  payout_sent: "Payout sent",
  payout_failed: "Payout couldn't be sent; the amount stays reserved",
  payout_unconfirmed: "Payout being checked",
  payout_marked_sent: "Arbiter confirmed the payout was sent",
  payout_marked_failed: "Arbiter marked the payout failed",
  vault_created: "Rent Vault opened",
  vault_requested: "Asked the landlord to confirm the Rent Vault",
  vault_approved: "Landlord confirmed the tenant lives here: vault open",
  vault_declined: "Landlord declined the Rent Vault",
  vault_closed_duplicate: "Closed: the home already had a Rent Vault",
  vault_topped_up: "Money added",
  vault_due: "Due date reached",
  vault_returned: "Savings returned to the tenant",
};

/** The public record of what happened, in order, with who did it. */
export function Timeline({ entries }: { entries: AuditEntry[] }) {
  const shown = entries.filter((e) => TEXT[e.action] && e.action !== "second_deposit_blocked");
  if (!shown.length) return null;
  return (
    <ol className="relative space-y-5 border-l-2 border-line pl-6">
      {shown.map((e) => (
        <li key={e.id} className="relative">
          <span
            className={`absolute -left-[31px] top-1 size-3.5 rounded-full border-2 border-paper ${
              /failed|objected|dispute/.test(e.action) ? "bg-laterite" : /sent|moved_in|held|released/.test(e.action) ? "bg-green" : "bg-ink-3"
            }`}
            aria-hidden="true"
          />
          <p className="text-[0.95rem] font-medium">{TEXT[e.action]}</p>
          <p className="text-[0.85rem] text-ink-3">
            {formatDateTime(e.createdAt)} · {e.role === "system" ? "Kodi" : e.role}
            {e.details && !/sats to/.test(e.details) ? ` · ${e.details}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
