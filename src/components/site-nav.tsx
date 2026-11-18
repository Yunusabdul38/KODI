"use client";

import { ArrowRightIcon, MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const nav = [
  { href: "/homes", label: "Find a home" },
  { href: "/check", label: "Check a unit" },
  { href: "/vault", label: "Rent Vault" },
  { href: "/ledger", label: "Escrow ledger" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop links, mobile menu and the scrolled shadow for the sticky header. */
export function SiteNav({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The menu belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean) => setOpenOn(v ? pathname : null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div
      className={`border-b transition-[box-shadow,border-color] duration-300 ${
        scrolled || open ? "border-line shadow-[0_10px_30px_-14px_rgba(20,33,27,0.2)]" : "border-transparent"
      }`}
    >
      <div className="container-page flex h-[76px] items-center justify-between gap-6">
        {children}
        <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
          {nav.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`relative py-2 text-[0.95rem] font-medium transition-colors after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:rounded-full after:transition-transform ${
                  active ? "text-ink after:scale-x-100 after:bg-laterite" : "text-ink-2 after:scale-x-0 after:bg-ink hover:text-ink"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/landlord"
            className={`hidden rounded-full px-4 py-2 text-[0.92rem] font-semibold transition-colors sm:inline-flex ${
              isActive(pathname, "/landlord") ? "bg-sand text-ink" : "text-ink hover:bg-sand"
            }`}
          >
            For landlords
          </Link>
          <span className="hidden sm:block">
            <Link href="/homes" className="btn btn-primary !min-h-11 !px-5 !py-2 text-[0.92rem]">
              Rent safely
            </Link>
          </span>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center rounded-full border border-line-2 bg-white lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen(!open)}
          >
            {open ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-menu" aria-label="Main" className="container-page animate-[menu-in_180ms_ease-out] pb-5 lg:hidden">
          <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
            {[...nav, { href: "/landlord", label: "For landlords" }].map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={isActive(pathname, n.href) ? "page" : undefined}
                  className="flex items-center justify-between px-5 py-4 text-[1.02rem] font-medium aria-[current=page]:text-laterite"
                >
                  {n.label}
                  <ArrowRightIcon className="size-4 text-ink-3" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
