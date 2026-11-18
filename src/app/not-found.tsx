import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page max-w-xl py-24 text-center">
      <p className="code-chip text-[0.95rem] text-ink-3">404</p>
      <h1 className="mt-3 text-[2.4rem]">This page isn&apos;t here.</h1>
      <p className="mt-3 text-ink-2">If someone sent you this link to pay for a home, check the home&apos;s Kodi code first.</p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/check" className="btn btn-primary">Check a unit code</Link>
        <Link href="/" className="btn btn-ghost">Home</Link>
      </div>
    </div>
  );
}
