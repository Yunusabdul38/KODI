import { BathIcon, BedDoubleIcon, MapPinIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { formatNairaShort } from "@/lib/format";
import { photoFor } from "@/lib/photos";
import type { Unit, UnitStatus } from "@/lib/types";
import { UnitStatusBadge } from "./status";

/** A listing in the grid: photo, price per year, rooms, area and live status. */
export function UnitCard({ unit, status, landlordName }: { unit: Unit; status: UnitStatus; landlordName: string }) {
  const photo = photoFor(unit.photo);
  return (
    <Link
      href={`/homes/${unit.code}`}
      className="group photo-zoom block overflow-hidden rounded-[22px] border border-line bg-card transition-shadow hover:shadow-[0_18px_40px_-20px_rgba(20,33,27,0.35)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-sand">
        <Image src={photo.src} alt={photo.alt} fill sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw" className="object-cover" />
        <UnitStatusBadge status={status} className="absolute left-3 top-3 shadow-sm ring-1 ring-black/5" />
        <span className="code-chip absolute bottom-3 right-3 rounded-full bg-white/90 px-2.5 py-1 text-[0.78rem] text-ink backdrop-blur">
          {unit.code}
        </span>
      </div>
      <div className="p-5">
        <p className="text-[1.45rem] font-extrabold tracking-[-0.03em]">
          {formatNairaShort(unit.annualRentNgn)}
          <span className="text-[0.95rem] font-medium tracking-normal text-ink-3"> / year</span>
        </p>
        <h3 className="mt-1 text-[1.05rem] font-semibold tracking-[-0.01em] group-hover:underline group-hover:underline-offset-4">
          {unit.title}
        </h3>
        <p className="mt-1 flex items-center gap-1.5 text-[0.92rem] text-ink-3">
          <MapPinIcon className="size-4 shrink-0" aria-hidden="true" />
          {unit.area}, {unit.city}
        </p>
        <div className="mt-4 flex items-center gap-4 border-t border-line pt-4 text-[0.9rem] text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <BedDoubleIcon className="size-4 text-ink-3" aria-hidden="true" />
            {unit.bedrooms} {unit.bedrooms === 1 ? "bed" : "beds"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BathIcon className="size-4 text-ink-3" aria-hidden="true" />
            {unit.bathrooms} {unit.bathrooms === 1 ? "bath" : "baths"}
          </span>
          <span className="ml-auto truncate text-[0.85rem] text-ink-3">{landlordName}</span>
        </div>
      </div>
    </Link>
  );
}
