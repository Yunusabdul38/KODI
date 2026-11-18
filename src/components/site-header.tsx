import Link from "next/link";
import { Suspense } from "react";
import { network } from "@/lib/lightning";
import { SiteNav } from "./site-nav";

/** Kodi's mark: a house whose door is a keyhole. No keys, no payout. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--forest)" />
      <path d="M8 15.2 16 8.5l8 6.7V24H8z" fill="none" stroke="var(--forest-ink)" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="16" cy="16.6" r="2.2" fill="var(--laterite)" />
      <path d="M16 18v3.4" stroke="var(--laterite)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className={`text-[1.4rem] font-extrabold tracking-[-0.04em] ${light ? "text-forest-ink" : "text-ink"}`}>kodi</span>
    </span>
  );
}

export function SiteHeader() {
  const net = network();
  const notice =
    net === "demo"
      ? ["Demo", "Simulated wallet. No real money moves."]
      : net === "mutinynet"
        ? ["Test network", "Payments use Mutinynet test coins with no value, at 1/1000 of the real rate."]
        : null;
  return (
    <header className="sticky top-0 z-40 bg-paper/90 backdrop-blur-md">
      {notice && (
        <div className="bg-laterite text-[0.8125rem] text-white">
          <p className="container-page py-1.5 text-center">
            <span className="font-bold uppercase tracking-[0.08em]">{notice[0]}</span>
            <span className="mx-2 opacity-60" aria-hidden="true">|</span>
            <span className="opacity-90">{notice[1]}</span>
          </p>
        </div>
      )}
      {/* The nav reads the current path, which is only known at request time. */}
      <Suspense fallback={<StaticBar>{home}</StaticBar>}>
        <SiteNav>{home}</SiteNav>
      </Suspense>
    </header>
  );
}

const home = (
  <Link href="/" aria-label="Kodi home" className="shrink-0">
    <Logo />
  </Link>
);

function StaticBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-transparent">
      <div className="container-page flex h-[76px] items-center justify-between gap-6">{children}</div>
    </div>
  );
}
