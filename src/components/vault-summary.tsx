import { PiggyBankIcon } from "lucide-react";
import Link from "next/link";
import { formatDay, formatNaira, formatNairaShort, formatWhen, shortHash } from "@/lib/format";
import type { VaultView } from "@/lib/vaults";
import { Progress } from "./status";

/** The vault's progress card: what's saved, the pace needed, and every payment in. */
export function VaultSummary({ v, showPayers = true }: { v: VaultView; showPayers?: boolean }) {
  const { vault } = v;
  const closed = vault.status !== "active";
  const label = { pending: "Waiting for the landlord", declined: "Declined by the landlord", paid: "Paid to landlord", returned: "Returned to tenant", active: "" }[vault.status];
  return (
    <div className="rounded-[28px] border border-line bg-card p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[0.95rem] font-semibold">
          <PiggyBankIcon className="size-5 text-forest" aria-hidden="true" /> Rent Vault · <span className="code-chip">{vault.code}</span>
        </span>
        {closed ? (
          <span className={`rounded-full px-2.5 py-1 text-[0.8rem] font-semibold ${vault.status === "pending" ? "bg-amber-soft text-amber" : vault.status === "declined" ? "bg-clay-soft text-ink" : "bg-green-soft text-green-2"}`}>
            {label}
          </span>
        ) : (
          <span className={`rounded-full px-2.5 py-1 text-[0.8rem] font-semibold ${v.onTrack ? "bg-green-soft text-green-2" : "bg-amber-soft text-amber"}`}>
            {v.onTrack ? "On track" : "Behind"}
          </span>
        )}
      </div>
      <p className="mt-6 text-[0.9rem] text-ink-3">Saved toward {formatDay(vault.dueDate)}</p>
      <p className="mt-1 text-[2.4rem] font-extrabold tracking-[-0.04em]">
        {formatNaira(v.savedNgn)} <span className="text-[1rem] font-medium tracking-normal text-ink-3">of {formatNaira(vault.targetNgn)}</span>
      </p>
      <Progress value={v.progress} className="mt-4" />
      {!closed && (
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          <Stat big={formatNairaShort(v.perPeriodNgn)} small={vault.schedule === "weekly" ? "per week to finish" : "per month to finish"} />
          <Stat big={String(v.periodsLeft)} small={vault.schedule === "weekly" ? "weeks left" : "months left"} />
          <Stat big={`${Math.round(v.progress * 100)}%`} small="of the target" />
        </div>
      )}
      {v.payments.length > 0 && (
        <ul className="mt-6 divide-y divide-line text-[0.93rem]">
          {v.payments.slice(0, 8).map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 truncate">{showPayers ? p.payerName ?? "Tenant" : "Payment"}</span>
              <span className="shrink-0 text-ink-3">{formatWhen(p.paidAt!)}</span>
              <Link href={`/r/${p.paymentHash}`} className="shrink-0 font-semibold hover:underline" title={`Receipt ${shortHash(p.paymentHash)}`}>
                {formatNaira(p.amountNgn)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ big, small }: { big: string; small: string }) {
  return (
    <div className="rounded-2xl bg-paper p-3">
      <p className="text-[1.1rem] font-bold">{big}</p>
      <p className="text-[0.78rem] leading-tight text-ink-3">{small}</p>
    </div>
  );
}
