import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { UnitCard } from "@/components/unit-card";
import { now } from "@/lib/clock";
import { listLandlords, listPublicUnits, unitStatus } from "@/lib/data";
import { formatNairaShort } from "@/lib/format";
import { HomeSearch } from "../home-search";

export const metadata = { title: "Find a home" };

export default function HomesPage({ searchParams }: PageProps<"/homes">) {
  return (
    <div className="container-page py-10 md:py-14">
      <div className="max-w-3xl">
        <p className="eyebrow">Homes on Kodi</p>
        <h1 className="mt-3 text-[2.4rem] sm:text-[3rem]">Verified homes in Lagos</h1>
        <p className="mt-3 text-[1.05rem] text-ink-2">
          Every landlord here was checked by Kodi. Pay a Safe Deposit on a home that shows <strong>Available</strong>; the
          landlord is paid only when you have the keys.
        </p>
      </div>
      <div className="mt-8 max-w-4xl">
        <HomeSearch />
      </div>
      <Suspense fallback={<div className="mt-10 min-h-[60vh]" />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/homes">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const area = one(sp.area);
  const beds = Number(one(sp.beds)) || 0;
  const max = Number(one(sp.max)) || 0;

  const [units, landlords, t] = await Promise.all([listPublicUnits(), listLandlords(), now()]);
  const names = new Map(landlords.map((l) => [l.id, l.name]));
  const shown = units.filter(
    (u) =>
      (!area || u.area.toLowerCase().startsWith(area.toLowerCase())) &&
      u.bedrooms >= beds &&
      (!max || u.annualRentNgn <= max),
  );
  const statuses = await Promise.all(shown.map((u) => unitStatus(u, t.toISOString())));
  const filters = [area && area, beds && `${beds}+ bedrooms`, max && `up to ${formatNairaShort(max)}`].filter(Boolean);

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <p className="text-[0.98rem] text-ink-2">
          <strong className="text-ink">{shown.length}</strong> {shown.length === 1 ? "home" : "homes"}
          {filters.length ? ` · ${filters.join(" · ")}` : ""}
        </p>
        {filters.length > 0 && (
          <Link href="/homes" className="text-[0.92rem] font-semibold text-forest underline-offset-4 hover:underline">
            Clear filters
          </Link>
        )}
      </div>
      {shown.length ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((u, i) => (
            <UnitCard key={u.id} unit={u} status={statuses[i]} landlordName={names.get(u.landlordId) ?? ""} />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-[26px] border border-dashed border-line-2 bg-card p-10 text-center">
          <p className="text-[1.15rem] font-semibold">{units.length ? "No homes match those filters." : "No homes listed yet."}</p>
          <p className="mt-2 text-ink-2">
            {units.length ? "Try another area or a higher budget." : "Landlords register, Kodi checks them, then their homes appear here."}
          </p>
        </div>
      )}
    </section>
  );
}
