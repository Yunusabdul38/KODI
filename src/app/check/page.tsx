import { AlertTriangleIcon, ArrowRightIcon, SearchIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { UnitStatusBadge, VerifiedBadge } from "@/components/status";
import { now } from "@/lib/clock";
import { getLandlord, getUnitByCode, unitStatus } from "@/lib/data";
import { formatNaira } from "@/lib/format";
import { photoFor } from "@/lib/photos";

export const metadata = { title: "Check a unit" };

export default function CheckPage({ searchParams }: PageProps<"/check">) {
  return (
    <div className="container-page max-w-3xl py-12 md:py-16">
      <p className="eyebrow">Before you pay anyone</p>
      <h1 className="mt-3 text-[2.4rem] sm:text-[3rem]">Check a unit code</h1>
      <p className="mt-4 text-[1.05rem] leading-relaxed text-ink-2">
        Every home on Kodi has a code like <span className="code-chip rounded bg-paper-2 px-1.5">KD-YABA2</span>. Type the
        code you were given to see whether the home is real, whether its landlord is verified, and whether someone has
        already paid a deposit on it.
      </p>
      <form action="/check" className="mt-8 flex gap-2 rounded-[22px] border border-line bg-card p-2">
        <label htmlFor="code" className="sr-only">Unit code</label>
        <input
          id="code"
          name="code"
          placeholder="KD-XXXXX"
          autoCapitalize="characters"
          spellCheck={false}
          className="code-chip h-14 min-w-0 flex-1 rounded-[16px] bg-transparent px-4 text-[1.2rem] uppercase outline-none placeholder:text-ink-3/60 focus:bg-paper"
        />
        <button type="submit" className="btn btn-primary !min-h-14 !rounded-[16px]">
          <SearchIcon className="size-5" aria-hidden="true" /> Check
        </button>
      </form>
      <Suspense fallback={<div className="mt-8 min-h-48" />}>
        <Result searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Result({ searchParams }: { searchParams: PageProps<"/check">["searchParams"] }) {
  await connection();
  const raw = (await searchParams).code;
  const code = (Array.isArray(raw) ? raw[0] : raw ?? "").trim().toUpperCase();
  if (!code) return null;
  if (/^RV-/.test(code)) redirect(`/vault/top-up/${encodeURIComponent(code)}`);

  const unit = /^KD-[A-Z0-9]{5}$/.test(code) ? await getUnitByCode(code) : null;
  const landlord = unit ? await getLandlord(unit.landlordId) : null;
  if (!unit || !landlord?.verified) {
    return (
      <div className="mt-8 rounded-[24px] border border-clay/30 bg-clay-soft p-6" role="alert">
        <p className="flex items-center gap-2 text-[1.15rem] font-bold text-clay">
          <AlertTriangleIcon className="size-5" aria-hidden="true" /> {code} isn&apos;t a home on Kodi
        </p>
        <p className="mt-2 text-[0.98rem] text-ink-2">
          Check the code with whoever gave it to you. If someone says a home is on Kodi but the code doesn&apos;t work,
          don&apos;t send them money.
        </p>
      </div>
    );
  }
  const status = await unitStatus(unit, (await now()).toISOString());
  const photo = photoFor(unit.photo);
  const verdict = {
    available: ["Real, verified, and free to rent.", "Pay only through Kodi: the landlord is paid when you get the keys."],
    reserved: ["Someone is paying a deposit right now.", "If they don't finish in 15 minutes, it frees up."],
    deposit_held: ["Already taken: a deposit is held.", "Don't pay anyone for this home. Kodi won't accept a second deposit."],
    let: ["Already let to a tenant.", "Don't pay anyone for this home."],
    unlisted: ["Not taking deposits right now.", "The landlord or Kodi has paused this listing."],
  }[status];

  return (
    <div className="mt-8 overflow-hidden rounded-[26px] border border-line bg-card">
      <div className="grid sm:grid-cols-[220px_1fr]">
        <div className="relative aspect-[4/3] bg-sand sm:aspect-auto">
          <Image src={photo.src} alt={photo.alt} fill sizes="220px" className="object-cover" />
        </div>
        <div className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="code-chip text-[0.95rem]">{unit.code}</span>
            <UnitStatusBadge status={status} />
          </div>
          <p className="mt-3 text-[1.3rem] font-bold tracking-[-0.02em]">{verdict[0]}</p>
          <p className="mt-1 text-[0.98rem] text-ink-2">{verdict[1]}</p>
          <p className="mt-4 text-[0.95rem] text-ink-2">
            {unit.title} in {unit.area} · {formatNaira(unit.annualRentNgn)} a year · {landlord.name}
          </p>
          <VerifiedBadge verified className="mt-2" />
          {status === "available" && (
            <Link href={`/homes/${unit.code}`} className="btn btn-primary mt-5">
              View and pay safely <ArrowRightIcon className="size-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
