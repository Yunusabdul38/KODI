"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AREAS, BUDGETS } from "@/lib/areas";

/** The hero's search bar: area, bedrooms and budget, then the listings. */
export function HomeSearch() {
  const router = useRouter();
  const [area, setArea] = useState("");
  const [beds, setBeds] = useState("");
  const [max, setMax] = useState("");
  const select =
    "w-full appearance-none bg-transparent pr-6 text-[0.98rem] font-semibold text-ink outline-none [background:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364716a%22 stroke-width=%222.5%22><path d=%22m6 9 6 6 6-6%22/></svg>')_no-repeat_right_center]";
  return (
    <div>
      <form
        className="grid gap-2 rounded-[26px] border border-line bg-card p-2 shadow-[0_20px_50px_-30px_rgba(20,33,27,0.45)] sm:grid-cols-[1.2fr_1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new URLSearchParams();
          if (area) q.set("area", area);
          if (beds) q.set("beds", beds);
          if (max) q.set("max", max);
          router.push(`/homes${q.size ? `?${q}` : ""}`);
        }}
      >
        <label className="rounded-[20px] px-4 py-2.5 transition-colors focus-within:bg-paper hover:bg-paper">
          <span className="block text-[0.78rem] font-medium text-ink-3">Area</span>
          <select className={select} value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">Anywhere in Lagos</option>
            {AREAS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
        <label className="rounded-[20px] px-4 py-2.5 transition-colors focus-within:bg-paper hover:bg-paper sm:border-l sm:border-line">
          <span className="block text-[0.78rem] font-medium text-ink-3">Bedrooms</span>
          <select className={select} value={beds} onChange={(e) => setBeds(e.target.value)}>
            <option value="">Any</option>
            <option value="1">1+</option>
            <option value="2">2+</option>
            <option value="3">3+</option>
          </select>
        </label>
        <label className="rounded-[20px] px-4 py-2.5 transition-colors focus-within:bg-paper hover:bg-paper sm:border-l sm:border-line">
          <span className="block text-[0.78rem] font-medium text-ink-3">Rent per year</span>
          <select className={select} value={max} onChange={(e) => setMax(e.target.value)}>
            <option value="">Any budget</option>
            {BUDGETS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>
        <button type="submit" className="btn btn-primary !min-h-[58px] !rounded-[20px] !px-6">
          <SearchIcon className="size-5" aria-hidden="true" />
          <span>Search</span>
        </button>
      </form>
      <p className="mt-3 pl-2 text-[0.92rem] text-ink-3">
        Shown a flat by an agent?{" "}
        <Link href="/check" className="font-semibold text-ink underline underline-offset-4">Check its Kodi code</Link> before you pay anyone.
      </p>
    </div>
  );
}
