import { Clock3Icon, ScaleIcon } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DepositStatusPill, UnitStatusBadge } from "@/components/status";
import { isAdmin } from "@/lib/auth";
import { clockAhead, now } from "@/lib/clock";
import { getDeposit, getUnit, listAllUnits, listLandlords, listOpenDisputes, listPayouts, listVaults, unitStatus } from "@/lib/data";
import { formatDateTime, formatDay, formatNaira, formatSats } from "@/lib/format";
import { network } from "@/lib/lightning";
import { reviewerLogins } from "@/lib/reviewer";
import { adminSignOut, resolvePayout, setFrozen } from "./actions";
import { AdminSignIn, ClockControls, DecideForm, RetryButton, ReturnVaultForm, VerifyLandlordForm } from "./forms";

export const metadata = { title: "Arbiter", robots: { index: false } };

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="container-page min-h-[80vh]" />}>
      <Route />
    </Suspense>
  );
}

async function Route() {
  await connection();
  if (!(await isAdmin())) {
    const reviewer = reviewerLogins()?.arbiterPassword ?? undefined;
    return (
      <div className="container-page grid gap-10 py-12 md:py-16 lg:grid-cols-2">
        <div>
          <p className="eyebrow">Kodi arbiter</p>
          <h1 className="mt-3 text-[2.4rem] sm:text-[3rem]">Verify landlords. Decide disputes.</h1>
          <p className="mt-4 max-w-lg text-[1.05rem] text-ink-2">
            The arbiter checks landlords before they list, decides disputes between tenants and landlords, and
            resolves payouts that need a second look. Every action is logged.
          </p>
        </div>
        <div className="rounded-[28px] border border-line bg-card p-6 sm:p-8 lg:max-w-md lg:justify-self-end">
          <AdminSignIn demo={network() === "demo"} reviewerPassword={reviewer} />
        </div>
      </div>
    );
  }
  return <Dashboard />;
}

async function Dashboard() {
  const [landlords, disputes, pending, failed, units, vaults, t, ahead] = await Promise.all([
    listLandlords(),
    listOpenDisputes(),
    listPayouts("pending"),
    listPayouts("failed"),
    listAllUnits(),
    listVaults(),
    now(),
    clockAhead(),
  ]);
  const toReview = landlords.filter((l) => !l.verified && !l.declinedReason);
  const statuses = await Promise.all(units.map((u) => unitStatus(u, t.toISOString())));
  const disputeRows = await Promise.all(
    disputes.map(async (d) => {
      const dep = (await getDeposit(d.depositId))!;
      return { d, dep, unit: (await getUnit(dep.unitId))! };
    }),
  );
  const names = new Map(landlords.map((l) => [l.id, l.name]));
  const testNet = network() !== "mainnet";

  return (
    <div className="container-page py-10 md:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Kodi arbiter</p>
          <h1 className="mt-2 text-[2.2rem] sm:text-[2.6rem]">Today</h1>
        </div>
        <form action={adminSignOut}><button className="btn btn-ghost">Sign out</button></form>
      </div>

      {testNet && (
        <section className="mt-8 rounded-[24px] border border-amber/30 bg-amber-soft p-6">
          <h2 className="flex items-center gap-2 text-[1.2rem]"><Clock3Icon className="size-5 text-amber" /> Demo clock (test network only)</h2>
          <p className="mt-1.5 text-[0.95rem] text-ink-2">
            Kodi&apos;s time: <strong>{formatDateTime(t.toISOString())}</strong>
            {ahead ? ` (${Math.round(ahead / 86_400)} days ahead of real time)` : " (real time)"}. Skip ahead to pass a move-in date, close a
            48-hour refund window, or reach a Rent Vault&apos;s due date, then run the daily jobs.
          </p>
          <div className="mt-4"><ClockControls /></div>
        </section>
      )}

      <Section title="Disputes" count={disputes.length} empty="No open disputes.">
        {disputeRows.map(({ d, dep, unit }) => (
          <div key={d.id} className="rounded-[22px] border border-line bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 font-semibold"><ScaleIcon className="size-4 text-laterite" /> {unit.title}, {unit.area} <span className="code-chip text-[0.85rem] text-ink-3">{unit.code}</span></p>
                <p className="mt-1 text-[0.92rem] text-ink-2">
                  Tenant {dep.tenantName} ({dep.tenantPhone}) · landlord {names.get(unit.landlordId)} · {formatNaira(dep.rentNgn + dep.agentFeeNgn)} · move-in {formatDay(dep.moveInDate)}
                </p>
                {dep.landlordConfirmedAt && <p className="mt-1 text-[0.88rem] text-ink-3">Landlord marked keys handed over {formatDateTime(dep.landlordConfirmedAt)}.</p>}
              </div>
              <DepositStatusPill status={dep.status} />
            </div>
            <p className="mt-4 rounded-2xl bg-paper p-4 text-[0.95rem]">
              <span className="font-semibold capitalize">{d.raisedBy}:</span> &ldquo;{d.reason}&rdquo;
              <span className="block text-[0.85rem] text-ink-3">{formatDateTime(d.createdAt)}</span>
            </p>
            <div className="mt-4"><DecideForm disputeId={d.id} /></div>
          </div>
        ))}
      </Section>

      <Section title="Landlords to verify" count={toReview.length} empty="Nobody waiting.">
        {toReview.map((l) => (
          <div key={l.id} className="rounded-[22px] border border-line bg-card p-5">
            <p className="font-semibold">{l.name}</p>
            <p className="mt-1 text-[0.92rem] text-ink-2">
              {l.contactName} · {l.phone} · {l.email} · {l.idType} {l.idNumber}
            </p>
            <p className="mt-1 text-[0.88rem] text-ink-3">Payouts to {l.payoutMethod === "lightning" ? l.lightningAddress : "landlord test wallet"} · registered {formatDateTime(l.createdAt)}</p>
            <p className="mt-3 text-[0.88rem] text-ink-3">Check the ID against the register and call the number before verifying.</p>
            <div className="mt-3"><VerifyLandlordForm id={l.id} /></div>
          </div>
        ))}
      </Section>

      <Section title="Payouts to check" count={pending.length + failed.length} empty="Every payout went through.">
        <div className="overflow-hidden rounded-[22px] border border-line bg-card">
          <ul className="divide-y divide-line text-[0.93rem]">
            {[...pending, ...failed].map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <span>
                  <span className="font-semibold capitalize">{p.recipient}</span> · {formatSats(p.amountSats)} to {p.destination}
                  <span className="block text-[0.85rem] text-ink-3">{formatDateTime(p.createdAt)}{p.error ? ` · ${p.error}` : ""}</span>
                </span>
                {p.status === "pending" ? (
                  <span className="flex gap-3 text-[0.9rem]">
                    <span className="text-ink-3">Check the wallet, then:</span>
                    <form action={resolvePayout.bind(null, p.id, "sent")}><button className="font-semibold text-forest hover:underline">It was paid</button></form>
                    <form action={resolvePayout.bind(null, p.id, "failed")}><button className="font-semibold text-clay hover:underline">It failed</button></form>
                  </span>
                ) : (
                  <span className="flex items-center gap-3 text-[0.9rem]"><span className="rounded-full bg-clay-soft px-2 py-0.5 text-[0.8rem] font-semibold text-clay">Failed</span><RetryButton id={p.id} /></span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Homes" count={units.length} empty="No homes yet.">
        <div className="overflow-hidden rounded-[22px] border border-line bg-card">
          <ul className="divide-y divide-line text-[0.93rem]">
            {units.map((u, i) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <span>
                  <Link href={`/homes/${u.code}`} className="font-semibold hover:underline">{u.title}, {u.area}</Link>{" "}
                  <span className="code-chip text-ink-3">{u.code}</span>
                  <span className="block text-[0.85rem] text-ink-3">{names.get(u.landlordId)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <UnitStatusBadge status={statuses[i]} />
                  <form action={setFrozen.bind(null, u.id, !u.frozen)}>
                    <button className="text-[0.88rem] font-semibold text-ink-3 hover:text-ink hover:underline">{u.frozen ? "Unfreeze" : "Freeze"}</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section title="Rent Vaults" count={vaults.filter((v) => v.status === "active").length} empty="No vaults yet.">
        <div className="overflow-hidden rounded-[22px] border border-line bg-card">
          <ul className="divide-y divide-line text-[0.93rem]">
            {vaults.map((v) => (
              <li key={v.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span><span className="code-chip">{v.code}</span> · {v.tenantName} · target {formatNaira(v.targetNgn)} · due {formatDay(v.dueDate)}</span>
                  <span className="rounded-full bg-sand px-2.5 py-0.5 text-[0.8rem] font-semibold capitalize">{v.status}</span>
                </div>
                {v.status === "active" && <ReturnVaultForm vaultId={v.id} testNetwork={testNet} />}
              </li>
            ))}
          </ul>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="flex items-center gap-3 text-[1.45rem]">
        {title}
        <span className="rounded-full bg-sand px-2.5 py-0.5 text-[0.85rem] font-semibold tracking-normal">{count}</span>
      </h2>
      <div className="mt-5 space-y-4">{count ? children : <p className="text-ink-3">{empty}</p>}</div>
    </section>
  );
}
