import Link from "next/link";
import { PHOTOS, SCENES } from "@/lib/photos";

export const metadata = { title: "Rules, custody and credits" };

const rules = [
  ["One deposit per home", "While a deposit is waiting for payment (15 minutes), held, waiting on a refund or with the arbiter, the database refuses any other deposit for that home. Every refused attempt is counted on the escrow ledger."],
  ["At most 12 months", "A tenant pays at most a year's rent into escrow, as section 4 of the Lagos State Tenancy Law 2011 allows from a new tenant."],
  ["Only the tenant releases money", "The landlord and agent are paid when the tenant confirms they have the keys, or when the arbiter decides a dispute. A landlord can say the keys were handed over, but that alone moves nothing."],
  ["Refunds after the move-in date", "If the keys haven't come by the agreed date, the tenant can ask for a refund. The landlord has 48 hours to object; without an objection, the refund is paid automatically."],
  ["Disputes go to an arbiter", "Either side can open a dispute. The money stays in escrow until the arbiter decides to pay the landlord or refund the tenant, with a written note both sides see."],
  ["Payouts never exceed what was paid in", "Each payout is written to the ledger before it is paid, and the database refuses one that would take more than is held for that deposit or vault. An unclear payout stays reserved until the arbiter checks it."],
  ["Nothing is rewritten", "Deposits, vault payments, payouts, disputes and the audit log can't be deleted, and their amounts can't change. Statuses only move forward."],
  ["Rent Vault money is for rent", "Savings go to the landlord on the due date. Only the arbiter can return them to the tenant, if the tenancy ends early with notice."],
];

export default function AboutPage() {
  return (
    <div className="container-page max-w-4xl py-10 md:py-14">
      <p className="eyebrow">How Kodi works</p>
      <h1 className="mt-3 text-[2.4rem] sm:text-[3rem]">Rules, custody and credits</h1>

      <section className="mt-10">
        <h2 className="text-[1.6rem]">The rules</h2>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          {rules.map(([t, d]) => (
            <div key={t} className="rounded-[22px] border border-line bg-card p-5">
              <dt className="text-[1.05rem] font-semibold">{t}</dt>
              <dd className="mt-2 text-[0.95rem] leading-relaxed text-ink-2">{d}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-14 rounded-[26px] bg-paper-2 p-7">
        <h2 className="text-[1.6rem]">Who holds the money</h2>
        <p className="mt-3 text-[1rem] leading-relaxed text-ink-2">
          In this version, Kodi does: payments go to Kodi&apos;s Lightning wallet, connected through Nostr Wallet Connect
          with its own isolated balance. That is why every movement is public and the wallet is compared with the ledger
          every day on the <Link href="/ledger" className="font-semibold underline">escrow ledger</Link>. The
          next step is a 2-of-3 multisig escrow (tenant, landlord, arbiter) so no single party can move a deposit.
          Lightning hold invoices can&apos;t do this job: they can stay open for hours or days, while a deposit may wait
          weeks for move-in.
        </p>
        <p className="mt-3 text-[1rem] leading-relaxed text-ink-2">
          Amounts are set in naira and converted at the live rate (yadio.io, with Alby&apos;s rate API as a backup) when
          you pay. On the test network everything is scaled down 1,000 times so real Lagos rents fit in free test coins.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="text-[1.6rem]">What isn&apos;t built yet</h2>
        <ul className="mt-4 list-disc space-y-2 pl-6 text-[1rem] text-ink-2">
          <li>Property title checks: landlords are verified by ID and phone, not land registry records.</li>
          <li>Naira bank payouts (planned through a licensed payout partner such as Bitnob).</li>
          <li>Photo uploads: listings use stock photos for now.</li>
          <li>Evidence uploads in disputes; the arbiter calls both sides.</li>
          <li>A dollar-stable balance for Rent Vaults.</li>
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="text-[1.6rem]">Sources</h2>
        <ul className="mt-4 space-y-2 text-[0.98rem]">
          {[
            ["https://www.nigeriahousingmarket.com/news/lagos-tenants-apartment-rental-fraud", "Nigeria Housing Market: landlord rented the same flats to over 15 people"],
            ["https://www.legit.ng/politics/1740264-lagos-deputy-governor-hamzat-vows-stop-landlords-demanding-2-3-years-rent/", "Legit.ng: Lagos to enforce the one-year rent limit"],
            ["https://www.nigeriahousingmarket.com/news/lagos-government-urges-tenants-to-report-landlords-charging-over-one-years-rent", "Nigeria Housing Market: report landlords charging over a year's rent"],
            ["https://www.kuda.com/blog/debt-free-rent-guide-lagos/", "Kuda: paying rent in Lagos"],
            ["https://thebftonline.com/?p=107533", "B&FT: why landlords prefer rent up front"],
            ["https://docs.bitnob.com/api-reference/payouts/overview", "Bitnob Payouts API (planned naira payouts)"],
          ].map(([href, label]) => (
            <li key={href}><a className="underline underline-offset-2" href={href} target="_blank" rel="noopener noreferrer">{label}</a></li>
          ))}
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="text-[1.6rem]">Photo credits</h2>
        <p className="mt-2 text-ink-2">From Unsplash, free under the Unsplash License. Thank you:</p>
        <ul className="mt-4 grid gap-2 text-[0.95rem] text-ink-2 sm:grid-cols-2">
          {[...Object.values(SCENES), ...Object.values(PHOTOS)].filter((p) => p.credit !== "Unsplash").map((p) => (
            <li key={p.src}>{p.credit} · {p.alt}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
