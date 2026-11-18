import Link from "next/link";
import { Logo } from "./site-header";

const columns = [
  {
    title: "Tenants",
    links: [
      ["/homes", "Find a home"],
      ["/check", "Check a unit code"],
      ["/vault", "Start a Rent Vault"],
      ["/#how-it-works", "How Safe Deposit works"],
    ],
  },
  {
    title: "Landlords",
    links: [
      ["/landlord/register", "List your property"],
      ["/landlord", "Landlord sign-in"],
      ["/#for-landlords", "Why landlords use Kodi"],
    ],
  },
  {
    title: "Company",
    links: [
      ["/ledger", "Escrow ledger"],
      ["/about", "How Kodi protects you"],
      ["/check", "Report a suspicious listing"],
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-28 bg-forest-2 text-forest-ink">
      <div className="container-page grid gap-12 py-16 md:grid-cols-[1.3fr_2fr]">
        <div className="max-w-sm">
          <Logo light />
          <p className="mt-5 text-[0.98rem] leading-relaxed text-forest-muted">
            <span className="font-semibold text-forest-ink">Kodi</span> is Swahili for rent. Pay into escrow, get the keys,
            and only then is the landlord paid. Built for Lagos, where tenants pay a year up front.
          </p>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 px-3.5 py-1.5 text-[0.85rem] text-forest-muted">
            <span className="size-1.5 rounded-full bg-laterite" aria-hidden="true" />
            Lightning · public ledger · one deposit per home
          </p>
        </div>
        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          {columns.map((c) => (
            <div key={c.title}>
              <p className="text-[0.82rem] font-semibold uppercase tracking-[0.08em] text-forest-muted">{c.title}</p>
              <ul className="mt-4 space-y-3">
                {c.links.map(([href, label]) => (
                  <li key={href}>
                    <Link href={href} className="text-[0.95rem] text-forest-ink/85 transition-colors hover:text-white">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-2 py-6 text-[0.85rem] text-forest-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Kodi · Lagos, Nigeria</p>
          <p className="flex gap-5">
            <Link href="/about" className="hover:text-white">Rules</Link>
            <Link href="/ledger" className="hover:text-white">Ledger</Link>
            <Link href="/landlord" className="hover:text-white">Landlord sign-in</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
