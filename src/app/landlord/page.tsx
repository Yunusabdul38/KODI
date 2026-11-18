import { CheckCircle2Icon, Clock3Icon, LockIcon, PlusIcon, XCircleIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DepositStatusPill, Notice, UnitStatusBadge, VerifiedBadge } from "@/components/status";
import { VaultSummary } from "@/components/vault-summary";
import { currentLandlord } from "@/lib/auth";
import { now } from "@/lib/clock";
import { listDepositsForUnits, listPayoutsForDeposit, listUnitsByLandlord, listVaultsForUnits, unitStatus } from "@/lib/data";
import { refundDueAt } from "@/lib/deposits";
import { formatDateTime, formatDay, formatNaira, formatSats } from "@/lib/format";
import { network, testWalletsAvailable } from "@/lib/lightning";
import { photoFor } from "@/lib/photos";
import type { Deposit, Landlord, Unit } from "@/lib/types";
import { vaultView } from "@/lib/vaults";
import { signOut, toggleListed } from "./actions";
import { HandoverButton, LandlordDisputeForm, PayoutForm, SignInForm } from "./forms";

export const metadata = { title: "For landlords", robots: { index: false } };

export default function LandlordPage({ searchParams }: PageProps<"/landlord">) {
  return (
    <Suspense fallback={<div className="container-page min-h-[80vh]" />}>
      <Route searchParams={searchParams} />
    </Suspense>
  );
}

async function Route({ searchParams }: { searchParams: PageProps<"/landlord">["searchParams"] }) {
  await connection();
  const l = await currentLandlord();
  if (!l) return <SignIn />;
  if (!l.verified) return <UnderReview l={l} />;
  const listed = (await searchParams).listed;
  return <Dashboard l={l} listed={typeof listed === "string" ? listed : null} />;
}

function SignIn() {
  return (
    <div className="container-page grid gap-12 py-12 md:py-16 lg:grid-cols-2">
      <div>
        <p className="eyebrow">For landlords and agents</p>
        <h1 className="mt-3 text-[2.4rem] sm:text-[3rem]">Get paid when the keys change hands.</h1>
        <p className="mt-4 max-w-lg text-[1.05rem] leading-relaxed text-ink-2">
          List your homes with a verified badge. Tenants pay into escrow, the home locks, and your share arrives in
          your Lightning wallet the moment they confirm they&apos;ve moved in.
        </p>
        <Link href="/landlord/register" className="btn btn-primary mt-8">
          <PlusIcon className="size-4" /> Register as a landlord
        </Link>
      </div>
      <div className="rounded-[28px] border border-line bg-card p-6 sm:p-8 lg:max-w-md lg:justify-self-end">
        <h2 className="text-[1.35rem]">Sign in</h2>
        <div className="mt-6"><SignInForm demo={network() === "demo"} /></div>
      </div>
    </div>
  );
}

function UnderReview({ l }: { l: Landlord }) {
  return (
    <div className="container-page max-w-2xl py-14">
      <Header l={l} />
      <div className="mt-8 rounded-[28px] border border-line bg-card p-7">
        {l.declinedReason ? (
          <>
            <p className="flex items-center gap-2 text-[1.2rem] font-bold"><XCircleIcon className="size-5 text-clay" /> Kodi couldn&apos;t verify you yet</p>
            <p className="mt-3 rounded-2xl bg-clay-soft p-4 text-[0.95rem]">{l.declinedReason}</p>
            <p className="mt-4 text-[0.95rem] text-ink-2">Reply to Kodi&apos;s email or call us with the right details, and we&apos;ll check again.</p>
          </>
        ) : (
          <>
            <p className="flex items-center gap-2 text-[1.2rem] font-bold"><Clock3Icon className="size-5 text-amber" /> We&apos;re checking your details</p>
            <ol className="mt-5 space-y-3 text-[0.97rem]">
              <li className="flex gap-3"><CheckCircle2Icon className="size-5 shrink-0 text-green" /> Registration received</li>
              <li className="flex gap-3"><Clock3Icon className="size-5 shrink-0 text-amber" /> Kodi checks your {l.idType} and calls {l.phone}</li>
              <li className="flex gap-3 text-ink-3"><span className="size-5 shrink-0 rounded-full border-2 border-line-2" /> Then you can list homes and take deposits</li>
            </ol>
          </>
        )}
      </div>
    </div>
  );
}

function Header({ l, children }: { l: Landlord; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">Landlord dashboard</p>
        <h1 className="mt-2 text-[2.1rem] sm:text-[2.5rem]">{l.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-3 text-[0.95rem] text-ink-3">
          {l.email} <VerifiedBadge verified={l.verified} />
        </p>
      </div>
      <div className="flex items-center gap-2">
        {children}
        <form action={signOut}><button className="btn btn-ghost">Sign out</button></form>
      </div>
    </div>
  );
}

async function Dashboard({ l, listed }: { l: Landlord; listed: string | null }) {
  const units = await listUnitsByLandlord(l.id);
  const ids = units.map((u) => u.id);
  const [deposits, vaults, t] = await Promise.all([listDepositsForUnits(ids), listVaultsForUnits(ids), now()]);
  const statuses = await Promise.all(units.map((u) => unitStatus(u, t.toISOString())));
  const byId = new Map(units.map((u) => [u.id, u]));
  const active = deposits.filter((d) => ["held", "refund_requested", "disputed"].includes(d.status));
  const past = deposits.filter((d) => ["released", "refunded"].includes(d.status));
  const views = await Promise.all(vaults.filter((v) => v.status === "active").map(vaultView));
  const paidOut = (await Promise.all(past.filter((d) => d.status === "released").map((d) => listPayoutsForDeposit(d.id))))
    .flat()
    .filter((p) => p.recipient === "landlord" && p.status === "sent")
    .reduce((s, p) => s + p.amountSats, 0);

  return (
    <div className="container-page py-10 md:py-14">
      <Header l={l}>
        <Link href="/landlord/units/new" className="btn btn-primary"><PlusIcon className="size-4" /> List a home</Link>
      </Header>
      {listed && <Notice tone="ok" className="mt-6">Listed as <strong className="code-chip">{listed}</strong>. Share that code with tenants: they can check it on Kodi before paying.</Notice>}

      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          [units.length, "homes"],
          [active.length, "deposits in escrow"],
          [views.length, "Rent Vaults saving"],
          [formatSats(paidOut), "paid to you"],
        ].map(([n, label]) => (
          <div key={String(label)} className="rounded-[22px] border border-line bg-card p-5">
            <p className="text-[1.8rem] font-extrabold tracking-[-0.04em]">{n}</p>
            <p className="text-[0.9rem] text-ink-3">{label}</p>
          </div>
        ))}
      </div>

      {active.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[1.5rem]">Deposits in escrow</h2>
          <div className="mt-5 space-y-4">
            {active.map((d) => <DepositRow key={d.id} d={d} unit={byId.get(d.unitId)!} tNow={t} />)}
          </div>
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-[1.5rem]">Your homes</h2>
        {units.length === 0 ? (
          <div className="mt-5 rounded-[24px] border border-dashed border-line-2 bg-card p-8 text-center">
            <p className="font-semibold">No homes yet.</p>
            <Link href="/landlord/units/new" className="btn btn-primary mt-4">List your first home</Link>
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-line overflow-hidden rounded-[24px] border border-line bg-card">
            {units.map((u, i) => (
              <li key={u.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-sand">
                  <Image src={photoFor(u.photo).src} alt="" fill sizes="64px" className="object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/homes/${u.code}`} className="font-semibold hover:underline">{u.title}, {u.area}</Link>
                  <p className="text-[0.9rem] text-ink-3"><span className="code-chip">{u.code}</span> · {formatNaira(u.annualRentNgn)}/yr{u.agentFeeNgn ? ` · agent ${u.agentName}` : ""}</p>
                </div>
                <UnitStatusBadge status={statuses[i]} />
                <form action={toggleListed.bind(null, u.id)}>
                  <button className="text-[0.88rem] font-semibold text-ink-3 underline-offset-4 hover:text-ink hover:underline" disabled={statuses[i] === "deposit_held" || statuses[i] === "reserved"}>
                    {u.listed ? "Unlist" : "List again"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {views.length > 0 && (
        <section className="mt-12">
          <h2 className="text-[1.5rem]">Tenants saving with Rent Vault</h2>
          <p className="mt-1 text-ink-2">Paid to you on each due date. Tenants can&apos;t withdraw it.</p>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {views.map((v) => (
              <div key={v.vault.id}>
                <p className="mb-2 text-[0.95rem] font-semibold">{v.vault.tenantName} · {v.unit.code}</p>
                <VaultSummary v={v} showPayers={false} />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-12 grid gap-8 lg:grid-cols-2">
        <div className="rounded-[24px] border border-line bg-card p-6">
          <h2 className="text-[1.25rem]">Payout details</h2>
          <p className="mt-1 text-[0.93rem] text-ink-2">
            Now: {l.payoutMethod === "lightning" ? l.lightningAddress : "Landlord test wallet (Mutinynet)"}
          </p>
          <div className="mt-5"><PayoutForm testWallets={testWalletsAvailable()} method={l.payoutMethod} address={l.lightningAddress} /></div>
        </div>
        {past.length > 0 && (
          <div className="rounded-[24px] border border-line bg-card p-6">
            <h2 className="text-[1.25rem]">Past deposits</h2>
            <ul className="mt-4 divide-y divide-line text-[0.93rem]">
              {past.slice(0, 10).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                  <span>{d.tenantName} · <span className="code-chip">{byId.get(d.unitId)?.code}</span></span>
                  <DepositStatusPill status={d.status} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function DepositRow({ d, unit, tNow }: { d: Deposit; unit: Unit; tNow: Date }) {
  const moveInPassed = tNow.toISOString().slice(0, 10) > d.moveInDate;
  const due = refundDueAt(d);
  return (
    <div className="rounded-[24px] border border-line bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold"><LockIcon className="size-4 text-blue" /> {unit.title}, {unit.area} <span className="code-chip text-[0.85rem] text-ink-3">{unit.code}</span></p>
          <p className="mt-1 text-[0.93rem] text-ink-2">
            {d.tenantName} · {d.tenantPhone} · {formatNaira(d.rentNgn + d.agentFeeNgn)} for {d.months} months · move-in {formatDay(d.moveInDate)}
          </p>
        </div>
        <DepositStatusPill status={d.status} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {d.status === "held" && !d.landlordConfirmedAt && <HandoverButton depositId={d.id} />}
        {d.status === "held" && d.landlordConfirmedAt && (
          <p className="text-[0.9rem] text-ink-3">You marked the keys handed over {formatDateTime(d.landlordConfirmedAt)}. Waiting for the tenant to confirm.</p>
        )}
        {d.status === "held" && moveInPassed && <LandlordDisputeForm depositId={d.id} label="Tenant has the keys but won't confirm" />}
        {d.status === "refund_requested" && due && (
          <>
            <p className="w-full text-[0.93rem]">
              The tenant says they didn&apos;t get the keys. The refund is paid at {formatDateTime(due.toISOString())} unless you object.
            </p>
            <LandlordDisputeForm depositId={d.id} label="Object: I handed over the keys" />
          </>
        )}
        {d.status === "disputed" && <p className="text-[0.93rem] text-ink-2">With Kodi&apos;s arbiter. The money stays in escrow until they decide.</p>}
      </div>
    </div>
  );
}
