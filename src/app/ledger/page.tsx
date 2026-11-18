import { CheckCircle2Icon, AlertTriangleIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { latestSnapshots, ledgerTotalSats, q, totals } from "@/lib/data";
import { formatDateTime, formatInt, formatNaira, formatSats, shortHash } from "@/lib/format";
import { lightning, network } from "@/lib/lightning";
import { ngnPricing } from "@/lib/rates";

export const metadata = { title: "Escrow ledger" };

export default function LedgerPage() {
  return (
    <div className="container-page py-10 md:py-14">
      <p className="eyebrow">Escrow ledger</p>
      <h1 className="mt-3 max-w-3xl text-[2.4rem] sm:text-[3rem]">Everything Kodi holds, and the proof it&apos;s there.</h1>
      <p className="mt-4 max-w-2xl text-[1.05rem] text-ink-2">
        Kodi&apos;s escrow is custodial in this version, so you shouldn&apos;t have to take our word for it. Every payment
        in and out has a receipt with its Lightning proof, and the wallet is compared with what Kodi owes.
      </p>
      <Suspense fallback={<div className="mt-10 min-h-[60vh]" />}>
        <Body />
      </Suspense>
    </div>
  );
}

interface Movement {
  kind: string;
  amountSats: number;
  hash: string;
  at: string;
  code: string | null;
}

async function Body() {
  await connection();
  const [ledger, t, snaps, pricing] = await Promise.all([ledgerTotalSats(), totals(), latestSnapshots(10), ngnPricing()]);
  const wallet = await lightning().getBalanceSats().then((n) => n, () => null);
  const covered = wallet === null ? null : wallet >= ledger;
  const naira = (sats: number) => formatNaira((sats * pricing.ngnPerBtc) / 1e8);
  const moves = await q<Movement>(
    `(select 'Deposit paid in' as kind, d.amount_sats, d.payment_hash as hash, d.paid_at as at, u.code
        from deposits d join units u on u.id = d.unit_id where d.paid_at is not null)
     union all
     (select 'Vault top-up' as kind, amount_sats, payment_hash, paid_at, null from vault_payments where status = 'paid')
     union all
     (select case recipient when 'tenant' then 'Refund' when 'agent' then 'Paid to agent' else 'Paid to landlord' end,
             amount_sats, payment_hash, sent_at, null from payouts where status = 'sent' and payment_hash is not null)
     order by at desc limit 25`,
  );

  return (
    <>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <Big label="Kodi owes (escrow + vaults)" sats={ledger} naira={naira(ledger)} />
        <Big label="Wallet balance now" sats={wallet} naira={wallet === null ? "" : naira(wallet)} />
        <div className={`rounded-[24px] p-6 ${covered === false ? "bg-clay-soft" : "bg-green-soft"}`}>
          <p className="text-[0.9rem] text-ink-2">Reserve check</p>
          <p className="mt-2 flex items-center gap-2 text-[1.35rem] font-bold">
            {covered === false ? <AlertTriangleIcon className="size-6 text-clay" /> : <CheckCircle2Icon className="size-6 text-green" />}
            {covered === null ? "Wallet unreachable" : covered ? "Fully covered" : "Shortfall"}
          </p>
          <p className="mt-1 text-[0.9rem] text-ink-2">
            {wallet === null ? "Try again in a minute." : `The wallet holds ${wallet >= ledger ? "at least" : "less than"} everything Kodi owes.`}
          </p>
        </div>
      </div>
      {pricing.scale > 1 && (
        <p className="mt-3 text-[0.88rem] text-ink-3">
          Naira values use the test-network rate (1/{formatInt(pricing.scale)} of real). {network() === "mutinynet" ? "The wallet may hold more than Kodi owes: it also holds the tester's own test coins." : ""}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          [formatInt(t.heldCount), "deposits held now", formatSats(t.heldDeposits)],
          [formatInt(t.vaultCount), "Rent Vaults saving", formatSats(t.vaultSavings)],
          [formatInt(t.releasedCount), "homes handed over", `${formatSats(t.paidToLandlords)} paid out`],
          [formatInt(t.blockedCount), "second payments refused", "for homes already taken"],
        ].map(([n, label, sub]) => (
          <div key={label} className="rounded-[22px] border border-line bg-card p-5">
            <p className="text-[2rem] font-extrabold tracking-[-0.04em]">{n}</p>
            <p className="text-[0.93rem] font-medium">{label}</p>
            <p className="text-[0.85rem] text-ink-3">{sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="text-[1.5rem]">Recent money movements</h2>
          <p className="mt-1 text-ink-2">No names, only amounts and proofs. Click one to check its proof in your browser.</p>
          {moves.length ? (
            <ul className="mt-5 divide-y divide-line overflow-hidden rounded-[22px] border border-line bg-card text-[0.93rem]">
              {moves.map((m) => (
                <li key={`${m.kind}${m.hash}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <span>
                    <span className="font-semibold">{m.kind}</span>
                    {m.code && <span className="code-chip ml-2 text-ink-3">{m.code}</span>}
                    <span className="block text-[0.85rem] text-ink-3">{formatDateTime(m.at)}</span>
                  </span>
                  <Link href={`/r/${m.hash}`} className="text-right hover:underline">
                    <span className="block font-semibold">{formatSats(Number(m.amountSats))}</span>
                    <span className="hash text-ink-3">{shortHash(m.hash)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 rounded-[22px] border border-dashed border-line-2 bg-card p-8 text-center text-ink-3">No payments yet.</p>
          )}
        </section>
        <section>
          <h2 className="text-[1.5rem]">Daily reserve checks</h2>
          <p className="mt-1 text-ink-2">Wallet balance against the ledger, recorded each day.</p>
          {snaps.length ? (
            <ul className="mt-5 space-y-2 text-[0.92rem]">
              {snaps.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 ring-1 ring-line">
                  <span className="text-ink-3">{formatDateTime(s.takenAt)}</span>
                  <span className={s.differenceSats >= 0 ? "font-semibold text-green-2" : "font-semibold text-clay"}>
                    {s.differenceSats >= 0 ? "Covered" : `Short ${formatSats(-s.differenceSats)}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-ink-3">The first check runs with the daily jobs.</p>
          )}
          <div className="mt-8 rounded-[22px] bg-paper-2 p-5 text-[0.93rem] text-ink-2">
            <p className="font-semibold text-ink">Rules the database enforces</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>One active deposit per home.</li>
              <li>Payments, payouts and the audit log can&apos;t be edited or deleted.</li>
              <li>No payout can exceed what was paid in for that deposit or vault.</li>
            </ul>
            <Link href="/about" className="mt-3 inline-block font-semibold text-forest underline-offset-4 hover:underline">All rules and custody</Link>
          </div>
        </section>
      </div>
    </>
  );
}

function Big({ label, sats, naira }: { label: string; sats: number | null; naira: string }) {
  return (
    <div className="rounded-[24px] border border-line bg-card p-6">
      <p className="text-[0.9rem] text-ink-2">{label}</p>
      <p className="mt-2 text-[2rem] font-extrabold tracking-[-0.04em]">{sats === null ? "—" : formatSats(sats)}</p>
      <p className="text-[0.9rem] text-ink-3">{naira}</p>
    </div>
  );
}
