import { BadgeCheckIcon, ReceiptIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { VerifyProof } from "@/components/verify-proof";
import { getDepositByPaymentHash, getPayoutByHash, getUnit, getVault, getVaultPaymentByHash } from "@/lib/data";
import { formatDateTime, formatNaira, formatSats } from "@/lib/format";

export const metadata = { title: "Receipt", robots: { index: false } };

export default function ReceiptPage({ params }: PageProps<"/r/[hash]">) {
  return (
    <Suspense fallback={<div className="container-page min-h-[60vh]" />}>
      <Receipt params={params} />
    </Suspense>
  );
}

interface Slip {
  kind: string;
  title: string;
  rows: [string, string][];
  preimage: string | null;
  back?: [string, string];
}

/** One receipt for any money movement: a deposit, a vault top-up, or a payout. No personal details. */
async function find(hash: string): Promise<Slip | null> {
  const d = await getDepositByPaymentHash(hash);
  if (d && d.paidAt) {
    const unit = await getUnit(d.unitId);
    return {
      kind: "Safe Deposit, paid in",
      title: formatNaira(d.rentNgn + d.agentFeeNgn),
      rows: [
        ["Home", `${unit?.code} · ${unit?.area}`],
        ["Amount", formatSats(d.amountSats)],
        ["Paid", formatDateTime(d.paidAt)],
        ["Held for", `${d.months} months' rent${d.agentFeeNgn ? " + agent fee" : ""}`],
      ],
      preimage: d.preimage,
      back: unit ? [`/homes/${unit.code}`, "See the home"] : undefined,
    };
  }
  const vp = await getVaultPaymentByHash(hash);
  if (vp && vp.status === "paid") {
    const v = await getVault(vp.vaultId);
    return {
      kind: "Rent Vault top-up",
      title: formatNaira(vp.amountNgn),
      rows: [
        ["Vault", v?.code ?? ""],
        ["Amount", formatSats(vp.amountSats)],
        ["Paid", formatDateTime(vp.paidAt!)],
      ],
      preimage: vp.preimage,
    };
  }
  const p = await getPayoutByHash(hash);
  if (p && p.status === "sent") {
    const what = p.recipient === "tenant" ? "Refund to the tenant" : p.recipient === "agent" ? "Agent fee paid out" : "Rent paid to the landlord";
    return {
      kind: p.vaultId ? `Rent Vault payout` : "Safe Deposit payout",
      title: formatSats(p.amountSats),
      rows: [
        ["What", what],
        ["To", p.destination],
        ["Sent", p.sentAt ? formatDateTime(p.sentAt) : ""],
      ],
      preimage: p.preimage,
    };
  }
  return null;
}

async function Receipt({ params }: { params: PageProps<"/r/[hash]">["params"] }) {
  await connection();
  const { hash: raw } = await params;
  const hash = raw.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) notFound();
  const slip = await find(hash);
  if (!slip) notFound();

  return (
    <div className="container-page max-w-2xl py-10 md:py-14">
      <article className="overflow-hidden rounded-[26px] border border-line bg-card shadow-[0_30px_60px_-45px_rgba(20,33,27,0.5)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper-2 px-6 py-4 sm:px-8">
          <p className="flex items-center gap-2 text-[0.95rem] font-semibold">
            <ReceiptIcon className="size-5 text-forest" aria-hidden="true" /> Payment record
          </p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-soft px-3 py-1 text-[0.8rem] font-semibold text-green-2">
            <BadgeCheckIcon className="size-4" aria-hidden="true" /> Settled on Lightning
          </span>
        </header>
        <div className="px-6 py-7 sm:px-8">
          <p className="text-[0.9rem] text-ink-3">{slip.kind}</p>
          <p className="mt-1 text-[2.4rem] font-extrabold tracking-[-0.04em] sm:text-[2.8rem]">{slip.title}</p>
          <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {slip.rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[0.82rem] font-medium uppercase tracking-[0.06em] text-ink-3">{k}</dt>
                <dd className="mt-0.5 break-words text-[1rem] font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-7 space-y-3">
            <div className="rounded-2xl bg-paper p-4">
              <p className="text-[0.82rem] font-medium uppercase tracking-[0.06em] text-ink-3">Payment hash</p>
              <p className="hash mt-1 text-ink">{hash}</p>
            </div>
            {slip.preimage && (
              <div className="rounded-2xl bg-paper p-4">
                <p className="text-[0.82rem] font-medium uppercase tracking-[0.06em] text-ink-3">Proof of payment</p>
                <p className="hash mt-1 text-ink">{slip.preimage}</p>
              </div>
            )}
          </div>
        </div>
        <footer className="border-t border-line px-6 py-6 sm:px-8">
          {slip.preimage ? (
            <VerifyProof preimage={slip.preimage} paymentHash={hash} />
          ) : (
            <p className="text-[0.95rem] text-ink-2">This payment has no proof attached (simulated wallet).</p>
          )}
          <p className="mt-4 text-[0.88rem] text-ink-3">
            A Lightning payment reveals its proof only once it&apos;s paid, and the proof&apos;s SHA-256 is the payment hash.
            The check runs on your device, not on Kodi&apos;s servers.
          </p>
        </footer>
      </article>
      {slip.back && <Link href={slip.back[0]} className="btn btn-ghost mt-6">{slip.back[1]}</Link>}
    </div>
  );
}
