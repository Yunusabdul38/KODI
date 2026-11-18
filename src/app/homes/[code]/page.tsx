import { BathIcon, BedDoubleIcon, CalendarCheckIcon, KeyRoundIcon, LockIcon, MapPinIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Notice, UnitStatusBadge, VerifiedBadge } from "@/components/status";
import { lagosDate, now } from "@/lib/clock";
import { getLandlord, getUnitByCode, unitStatus } from "@/lib/data";
import { cannotTakeDeposit } from "@/lib/deposits";
import { formatNaira } from "@/lib/format";
import { testWalletsAvailable } from "@/lib/lightning";
import { photoFor } from "@/lib/photos";
import { ngnPricing } from "@/lib/rates";
import { DepositForm } from "./deposit-form";

export async function generateMetadata({ params }: PageProps<"/homes/[code]">): Promise<Metadata> {
  await connection();
  const unit = await getUnitByCode((await params).code);
  if (!unit) return { title: "Home not found" };
  return { title: `${unit.title}, ${unit.area}`, description: unit.description.slice(0, 160) };
}

export default function UnitPage({ params }: PageProps<"/homes/[code]">) {
  return (
    <Suspense fallback={<div className="container-page min-h-[80vh] py-10" />}>
      <UnitView params={params} />
    </Suspense>
  );
}

async function UnitView({ params }: { params: PageProps<"/homes/[code]">["params"] }) {
  await connection();
  const unit = await getUnitByCode((await params).code);
  if (!unit) notFound();
  const landlord = await getLandlord(unit.landlordId);
  if (!landlord?.verified && unit.listed) notFound();
  const t = await now();
  const status = await unitStatus(unit, t.toISOString());
  const why = await cannotTakeDeposit(unit, landlord);
  const pricing = await ngnPricing();
  const photo = photoFor(unit.photo);
  const today = lagosDate(t);
  const maxDate = lagosDate(new Date(t.getTime() + 120 * 86_400_000));

  return (
    <div className="container-page py-8 md:py-12">
      <nav aria-label="Breadcrumb" className="text-[0.9rem] text-ink-3">
        <Link href="/homes" className="hover:text-ink">Homes</Link>
        <span className="mx-2">/</span>
        <span className="text-ink-2">{unit.area}</span>
      </nav>

      <div className="mt-5 grid gap-10 lg:grid-cols-[1.35fr_1fr]">
        <div>
          <div className="relative aspect-[16/10] overflow-hidden rounded-[28px] bg-sand">
            <Image src={photo.src} alt={photo.alt} fill priority sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover" />
            <UnitStatusBadge status={status} className="absolute left-4 top-4 !px-3 !py-1.5 !text-[0.88rem] shadow ring-1 ring-black/5" />
          </div>

          <div className="mt-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[2.1rem] sm:text-[2.6rem]">{unit.title}</h1>
              <p className="mt-2 flex items-center gap-1.5 text-[1.02rem] text-ink-2">
                <MapPinIcon className="size-4 text-ink-3" aria-hidden="true" />
                {unit.area}, {unit.city}
              </p>
            </div>
            <p className="sm:text-right">
              <span className="block text-[2rem] font-extrabold leading-tight tracking-[-0.04em]">{formatNaira(unit.annualRentNgn)}</span>
              <span className="text-[0.92rem] text-ink-3">per year</span>
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              [BedDoubleIcon, `${unit.bedrooms} ${unit.bedrooms === 1 ? "bedroom" : "bedrooms"}`],
              [BathIcon, `${unit.bathrooms} ${unit.bathrooms === 1 ? "bathroom" : "bathrooms"}`],
              [KeyRoundIcon, unit.agentFeeNgn ? `Agent fee ${formatNaira(unit.agentFeeNgn)}` : "No agent fee"],
              [ShieldCheckIcon, "Safe Deposit"],
            ].map(([Icon, label], i) => {
              const I = Icon as typeof BedDoubleIcon;
              return (
                <div key={i} className="rounded-2xl border border-line bg-card p-4">
                  <I className="size-5 text-forest" aria-hidden="true" />
                  <p className="mt-2 text-[0.92rem] font-medium">{label as string}</p>
                </div>
              );
            })}
          </div>

          <section className="mt-10">
            <h2 className="text-[1.4rem]">About this home</h2>
            <p className="mt-3 max-w-2xl text-[1.02rem] leading-relaxed text-ink-2">{unit.description}</p>
            <p className="mt-4 text-[0.95rem] text-ink-3">The exact address is shared with you once your deposit is held.</p>
          </section>

          <section className="mt-10 rounded-[24px] border border-line bg-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[0.85rem] text-ink-3">Listed by</p>
                <p className="text-[1.15rem] font-semibold">{landlord!.name}</p>
              </div>
              <VerifiedBadge verified={landlord!.verified} />
            </div>
            <p className="mt-3 text-[0.95rem] text-ink-2">
              Kodi checked this landlord&apos;s ID and phone number before listing. Unit code{" "}
              <span className="code-chip rounded-md bg-paper px-1.5 py-0.5 text-ink">{unit.code}</span>: anyone can{" "}
              <Link href={`/check?code=${unit.code}`} className="font-semibold underline underline-offset-2">look it up</Link>.
            </p>
          </section>
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-[28px] border border-line bg-card p-6 shadow-[0_30px_60px_-40px_rgba(20,33,27,0.45)] sm:p-7">
            {status === "available" && !why ? (
              <>
                <h2 className="text-[1.35rem]">Pay a Safe Deposit</h2>
                <ol className="mt-4 space-y-2.5 text-[0.93rem] text-ink-2">
                  <li className="flex gap-2.5"><LockIcon className="mt-0.5 size-4 shrink-0 text-forest" aria-hidden="true" />The home locks for everyone else the moment you pay.</li>
                  <li className="flex gap-2.5"><KeyRoundIcon className="mt-0.5 size-4 shrink-0 text-forest" aria-hidden="true" />The landlord is paid only when you confirm you have the keys.</li>
                  <li className="flex gap-2.5"><CalendarCheckIcon className="mt-0.5 size-4 shrink-0 text-forest" aria-hidden="true" />No keys by the move-in date? Ask for your money back.</li>
                </ol>
                <div className="mt-6 border-t border-line pt-6">
                  <DepositForm
                    code={unit.code}
                    annualRentNgn={unit.annualRentNgn}
                    agentFeeNgn={unit.agentFeeNgn}
                    agentName={unit.agentName}
                    ngnPerBtc={pricing.ngnPerBtc}
                    scale={pricing.scale}
                    minDate={today}
                    maxDate={maxDate}
                    testWallets={testWalletsAvailable()}
                  />
                </div>
              </>
            ) : (
              <Locked status={status} why={why} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Locked({ status, why }: { status: string; why: string | null }) {
  if (status === "deposit_held" || status === "reserved") {
    return (
      <div>
        <span className="flex size-12 items-center justify-center rounded-2xl bg-blue-soft text-blue">
          <LockIcon className="size-6" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-[1.35rem]">{status === "reserved" ? "Someone is paying for this home" : "A deposit is already held"}</h2>
        <p className="mt-2 text-[0.98rem] leading-relaxed text-ink-2">
          {status === "reserved"
            ? "Another tenant has a payment request open for this home. If they don't pay within 15 minutes, it frees up again."
            : "Another tenant has paid a Safe Deposit for this home, so nobody else can pay for it on Kodi."}
        </p>
        <Notice tone="warn" className="mt-5 text-[0.92rem]">
          If anyone asks you to pay for this home outside Kodi, don&apos;t: it&apos;s already taken.
        </Notice>
        <Link href="/homes" className="btn btn-ghost mt-6 w-full">See other homes</Link>
      </div>
    );
  }
  if (status === "let") {
    return (
      <div>
        <h2 className="text-[1.35rem]">This home is let</h2>
        <p className="mt-2 text-[0.98rem] text-ink-2">A tenant has moved in. Already living here? Save for next year&apos;s rent with a Rent Vault.</p>
        <Link href="/vault" className="btn btn-primary mt-6 w-full">Start a Rent Vault</Link>
      </div>
    );
  }
  return (
    <div>
      <h2 className="text-[1.35rem]">Not taking deposits</h2>
      <p className="mt-2 text-[0.98rem] text-ink-2">{why ?? "This home isn't listed right now."}</p>
      <Link href="/homes" className="btn btn-ghost mt-6 w-full">See other homes</Link>
    </div>
  );
}
