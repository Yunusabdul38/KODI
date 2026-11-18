import { ArrowRightIcon, Clock3Icon, LockIcon, MapPinIcon, ReceiptIcon, ScaleIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CopyLink } from "@/components/copy-link";
import { InvoicePanel } from "@/components/invoice-panel";
import { DepositStatusPill, Notice } from "@/components/status";
import { Timeline } from "@/components/timeline";
import { now } from "@/lib/clock";
import { auditForDeposit, getDepositByToken, getLandlord, getUnit, listDisputesFor, listPayoutsForDeposit } from "@/lib/data";
import { maybeRefundNow, moveInDatePassed, refundDueAt, settleDeposit } from "@/lib/deposits";
import { formatDateTime, formatDay, formatNaira, formatSats, shortHash } from "@/lib/format";
import { network } from "@/lib/lightning";
import { appUrl, emailEnabled } from "@/lib/notify";
import { photoFor } from "@/lib/photos";
import { tokenHash } from "@/lib/secrets";
import type { Deposit, Payout } from "@/lib/types";
import { DisputeForm, MoveInForm, RefundButton } from "./tenant-actions";

export const metadata = { title: "Your Safe Deposit", robots: { index: false } };

export default function DepositPage({ params }: PageProps<"/d/[token]">) {
  return (
    <Suspense fallback={<div className="container-page min-h-[80vh] py-10" />}>
      <DepositView params={params} />
    </Suspense>
  );
}

async function DepositView({ params }: { params: PageProps<"/d/[token]">["params"] }) {
  await connection();
  const { token } = await params;
  let d = await getDepositByToken(tokenHash(token));
  if (!d) notFound();
  d = await settleDeposit(d).catch(() => d!);
  d = await maybeRefundNow(d).catch(() => d!);
  const unit = (await getUnit(d.unitId))!;
  const landlord = (await getLandlord(unit.landlordId))!;
  const [payouts, entries, disputes, t] = await Promise.all([listPayoutsForDeposit(d.id), auditForDeposit(d.id), listDisputesFor(d.id), now()]);
  const photo = photoFor(unit.photo);
  const total = d.rentNgn + d.agentFeeNgn;
  const paid = d.paidAt !== null;
  const link = `${appUrl()}/d/${token}`;

  return (
    <div className="container-page py-8 md:py-12">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <p className="eyebrow">Your Safe Deposit</p>
          <div className="mt-4 flex items-start gap-4">
            <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-sand">
              <Image src={photo.src} alt="" fill sizes="80px" className="object-cover" />
            </div>
            <div>
              <h1 className="text-[1.7rem] sm:text-[2rem]">{unit.title}, {unit.area}</h1>
              <p className="mt-1 text-[0.95rem] text-ink-3">
                <span className="code-chip">{unit.code}</span> · {landlord.name}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <DepositStatusPill status={d.status} className="!px-3 !py-1.5 !text-[0.9rem]" />
            <span className="text-[0.95rem] text-ink-2">Move-in date: <strong>{formatDay(d.moveInDate)}</strong></span>
          </div>

          <dl className="mt-6 divide-y divide-line rounded-[22px] border border-line bg-card px-5 text-[0.95rem]">
            <Row label={`Rent, ${d.months} ${d.months === 1 ? "month" : "months"}`} value={formatNaira(d.rentNgn)} />
            {d.agentFeeNgn > 0 && <Row label={`Agent fee${unit.agentName ? ` (${unit.agentName})` : ""}`} value={formatNaira(d.agentFeeNgn)} />}
            <Row label="Total" value={<strong>{formatNaira(total)}</strong>} />
            <Row label="In sats" value={`${formatSats(d.amountSats)} (rent ${formatSats(d.rentSats)}${d.agentSats ? `, agent ${formatSats(d.agentSats)}` : ""})`} />
            {paid && <Row label="Paid" value={formatDateTime(d.paidAt!)} />}
            {paid && (
              <Row
                label="Payment proof"
                value={<Link href={`/r/${d.paymentHash}`} className="inline-flex items-center gap-1 font-semibold text-forest underline-offset-2 hover:underline"><ReceiptIcon className="size-4" />Receipt {shortHash(d.paymentHash)}</Link>}
              />
            )}
          </dl>

          {paid && (
            <div className="mt-6 rounded-[22px] bg-paper-2 p-5">
              <p className="flex items-center gap-2 text-[0.85rem] font-semibold text-ink-3"><MapPinIcon className="size-4" />Address</p>
              <p className="mt-1 text-[1.05rem] font-semibold">{unit.address}, {unit.area}, {unit.city}</p>
              <p className="mt-1 text-[0.9rem] text-ink-2">Landlord: {landlord.contactName} · {landlord.phone}</p>
            </div>
          )}

          <div className="mt-6">
            <p className="text-[0.92rem] font-semibold">Keep this private link</p>
            <p className="mt-1 text-[0.88rem] text-ink-3">
              It&apos;s the only way to confirm the keys or ask for a refund.{" "}
              {emailEnabled() ? `We also emailed it to ${d.tenantEmail}.` : "Email isn't set up on this server, so copy it now."}
            </p>
            <div className="mt-2.5"><CopyLink url={link} /></div>
          </div>
        </div>

        <div className="space-y-6">
          <Panel d={d} token={token} landlordName={landlord.name} payouts={payouts} openDispute={disputes.find((x) => !x.decision)?.reason ?? null} tNow={t} />
          <section className="rounded-[26px] border border-line bg-card p-6">
            <h2 className="text-[1.15rem]">What happened, step by step</h2>
            <div className="mt-5"><Timeline entries={entries} /></div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-3 py-3">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

async function Panel({ d, token, landlordName, payouts, openDispute, tNow }: { d: Deposit; token: string; landlordName: string; payouts: Payout[]; openDispute: string | null; tNow: Date }) {
  const card = "rounded-[26px] border border-line bg-card p-6 shadow-[0_30px_60px_-45px_rgba(20,33,27,0.5)] sm:p-7";
  if (d.status === "awaiting_payment") {
    return (
      <section className={card}>
        <h2 className="text-[1.3rem]">Pay to hold this home</h2>
        <p className="mt-1.5 text-[0.95rem] text-ink-2">The home is reserved for you while this payment request is open.</p>
        <div className="mt-6">
          <InvoicePanel hash={d.paymentHash} pr={d.paymentRequest} expiresAt={d.expiresAt} sats={d.amountSats} label={formatNaira(d.rentNgn + d.agentFeeNgn)} network={network()} />
        </div>
      </section>
    );
  }
  if (d.status === "expired") {
    return (
      <section className={card}>
        <h2 className="text-[1.3rem]">This payment request expired</h2>
        <p className="mt-2 text-ink-2">Nothing was paid, and the home was released. You can start again if it&apos;s still available.</p>
        <Link href="/homes" className="btn btn-primary mt-6">Back to homes</Link>
      </section>
    );
  }
  if (d.status === "held") {
    const canRefund = await moveInDatePassed(d);
    return (
      <section className={card}>
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-blue-soft text-blue"><LockIcon className="size-5" /></span>
          <div>
            <h2 className="text-[1.3rem]">Your money is held. The home is locked.</h2>
            <p className="text-[0.92rem] text-ink-3">Nobody else can pay for this home on Kodi.</p>
          </div>
        </div>
        {d.landlordConfirmedAt && (
          <Notice tone="info" className="mt-5 text-[0.93rem]">
            {landlordName} says the keys were handed over on {formatDateTime(d.landlordConfirmedAt)}. If that&apos;s true, confirm below.
          </Notice>
        )}
        <div className="mt-6 rounded-2xl bg-paper p-5">
          <h3 className="text-[1.05rem]">Got the keys?</h3>
          <p className="mt-1 text-[0.93rem] text-ink-2">Only do this once you can get into the home. It pays the landlord and can&apos;t be undone.</p>
          <div className="mt-4"><MoveInForm token={token} landlordName={landlordName} /></div>
        </div>
        <div className="mt-5 space-y-3">
          <RefundButton token={token} allowed={canRefund} moveInLabel={formatDay(d.moveInDate)} />
          <DisputeForm token={token} />
        </div>
      </section>
    );
  }
  if (d.status === "refund_requested") {
    const due = refundDueAt(d)!;
    const hours = Math.max(0, Math.ceil((due.getTime() - tNow.getTime()) / 3_600_000));
    return (
      <section className={card}>
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-amber-soft text-amber"><Clock3Icon className="size-5" /></span>
          <div>
            <h2 className="text-[1.3rem]">Refund requested</h2>
            <p className="text-[0.92rem] text-ink-3">{hours > 0 ? `Paid back in about ${hours} hours unless the landlord objects.` : "Being paid back now."}</p>
          </div>
        </div>
        <p className="mt-5 text-[0.95rem] text-ink-2">
          The landlord has until {formatDateTime(due.toISOString())} to object. If they do, Kodi&apos;s arbiter decides.
        </p>
        <div className="mt-6 rounded-2xl bg-paper p-5">
          <h3 className="text-[1.05rem]">Got the keys after all?</h3>
          <div className="mt-3"><MoveInForm token={token} landlordName={landlordName} /></div>
        </div>
      </section>
    );
  }
  if (d.status === "disputed") {
    return (
      <section className={card}>
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-laterite-soft text-laterite-2"><ScaleIcon className="size-5" /></span>
          <h2 className="text-[1.3rem]">With Kodi&apos;s arbiter</h2>
        </div>
        {openDispute && <p className="mt-4 rounded-2xl bg-paper p-4 text-[0.95rem] italic text-ink-2">&ldquo;{openDispute}&rdquo;</p>}
        <p className="mt-4 text-[0.95rem] text-ink-2">
          The money stays in escrow until the arbiter decides to pay the landlord or refund you. The decision is logged
          below. The arbiter may call both of you.
        </p>
      </section>
    );
  }
  // released or refunded
  return (
    <section className={card}>
      <h2 className="text-[1.3rem]">{d.status === "released" ? "Paid to the landlord. Welcome home." : "Refunded to you"}</h2>
      <ul className="mt-5 divide-y divide-line">
        {payouts.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[0.95rem]">
            <span>
              <span className="font-semibold capitalize">{p.recipient}</span>
              <span className="text-ink-3"> · {p.destination}</span>
            </span>
            <span className="flex items-center gap-3">
              {formatSats(p.amountSats)}
              {p.status === "sent" && p.paymentHash ? (
                <Link href={`/r/${p.paymentHash}`} className="font-semibold text-forest underline-offset-2 hover:underline">Proof</Link>
              ) : (
                <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[0.8rem] font-semibold text-amber">{p.status === "failed" ? "Retrying" : "Checking"}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {d.status === "released" && (
        <div className="mt-6 rounded-2xl bg-paper-2 p-5">
          <h3 className="text-[1.05rem]">Next year&apos;s rent, a little at a time</h3>
          <p className="mt-1 text-[0.93rem] text-ink-2">Open a Rent Vault for this home and save weekly or monthly. Your landlord can watch it grow.</p>
          <Link href={`/vault?unit=${encodeURIComponent((await getUnit(d.unitId))!.code)}`} className="btn btn-primary mt-4">
            Start a Rent Vault <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      )}
    </section>
  );
}
