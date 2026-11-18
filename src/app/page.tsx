import {
  ArrowRightIcon,
  BadgeCheckIcon,
  BanIcon,
  CheckIcon,
  KeyRoundIcon,
  LockIcon,
  PiggyBankIcon,
  ScaleIcon,
  ShieldCheckIcon,
  WalletIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Reveal } from "@/components/reveal";
import { UnitCard } from "@/components/unit-card";
import { now } from "@/lib/clock";
import { listLandlords, listPublicUnits, totals, unitStatus } from "@/lib/data";
import { formatInt, formatNaira } from "@/lib/format";
import { SCENES } from "@/lib/photos";
import { HomeSearch } from "./home-search";

export default function Home() {
  return (
    <>
      <Hero />
      <Facts />
      <Suspense fallback={<section className="container-page min-h-[560px] py-24" />}>
        <Featured />
      </Suspense>
      <HowItWorks />
      <FraudBlocked />
      <Vault />
      <ForLandlords />
      <Suspense fallback={null}>
        <Trust />
      </Suspense>
      <Faq />
      <Closing />
    </>
  );
}

function Hero() {
  return (
    <section className="container-page pt-6 md:pt-10">
      <div className="grid items-stretch gap-8 lg:grid-cols-[1.05fr_1fr]">
        <div className="rise flex flex-col justify-center py-6 lg:py-14">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-line-2 bg-white px-3.5 py-1.5 text-[0.85rem] font-medium text-ink-2">
            <ShieldCheckIcon className="size-4 text-green" aria-hidden="true" />
            Safe Deposit for Lagos rentals
          </p>
          <h1 className="display mt-6 text-[2.9rem] sm:text-[4rem] xl:text-[4.6rem]">
            No keys, <span className="mark">no payout.</span>
          </h1>
          <p className="mt-6 max-w-xl text-[1.12rem] leading-relaxed text-ink-2">
            Pay your rent into escrow over Bitcoin Lightning. The flat locks the moment you pay, so nobody else can pay
            for it on Kodi, and the landlord is paid only when you say you have the keys.
          </p>
          <div className="mt-9 lg:hidden">
            <HomeSearch />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[0.92rem] text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <CheckIcon className="size-4 text-green" aria-hidden="true" /> Verified landlords only
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckIcon className="size-4 text-green" aria-hidden="true" /> At most 12 months up front
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckIcon className="size-4 text-green" aria-hidden="true" /> Refund if the keys never come
            </span>
          </div>
        </div>

        <div className="rise relative min-h-[440px] overflow-hidden rounded-[32px] bg-sand [animation-delay:120ms] lg:min-h-[620px]">
          <Image src={SCENES.lekki.src} alt={SCENES.lekki.alt} fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" aria-hidden="true" />
          {/* What a tenant sees after paying: the unit is locked and the money waits for the keys. */}
          <div className="absolute left-5 right-5 top-5 max-w-sm rounded-[22px] bg-white/95 p-5 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.45)] backdrop-blur sm:right-auto">
            <div className="flex items-center justify-between gap-3">
              <span className="code-chip text-[0.85rem] text-ink-3">KD-YABA2 · Yaba</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-soft px-2.5 py-1 text-[0.78rem] font-semibold text-blue">
                <LockIcon className="size-3.5" aria-hidden="true" /> Deposit held
              </span>
            </div>
            <p className="mt-3 text-[1.5rem] font-extrabold tracking-[-0.03em]">₦2,640,000</p>
            <p className="text-[0.9rem] text-ink-3">12 months&apos; rent + agent fee, in escrow</p>
            <ol className="mt-4 space-y-2 text-[0.9rem]">
              <li className="flex items-center gap-2.5">
                <span className="flex size-5 items-center justify-center rounded-full bg-green text-white"><CheckIcon className="size-3" /></span>
                Paid over Lightning
              </li>
              <li className="flex items-center gap-2.5">
                <span className="flex size-5 items-center justify-center rounded-full bg-green text-white"><CheckIcon className="size-3" /></span>
                Unit locked for everyone else
              </li>
              <li className="flex items-center gap-2.5 text-ink-3">
                <span className="flex size-5 items-center justify-center rounded-full border-2 border-line-2" />
                Landlord paid when you get the keys
              </li>
            </ol>
          </div>
        </div>
      </div>
      <div className="relative z-10 mx-auto -mt-16 hidden max-w-5xl px-6 lg:block">
        <HomeSearch />
      </div>
    </section>
  );
}

function Facts() {
  const facts = [
    ["1–2 years", "of rent many Lagos landlords ask for up front, plus agent and legal fees."],
    ["15+ people", "paid for the same flats in one 2025 case. Nobody could check the flat was already taken."],
    ["12 months", "the most a landlord may take from a new tenant under Lagos Tenancy Law 2011, s.4."],
  ];
  return (
    <section className="container-page mt-16">
      <div className="grid gap-px overflow-hidden rounded-[26px] border border-line bg-line md:grid-cols-3">
        {facts.map(([big, text], i) => (
          <Reveal key={big} delay={i * 80} className="bg-card p-7">
            <p className="text-[2.2rem] font-extrabold tracking-[-0.04em] text-forest">{big}</p>
            <p className="mt-2 text-[0.98rem] leading-relaxed text-ink-2">{text}</p>
          </Reveal>
        ))}
      </div>
      <p className="mt-3 text-[0.82rem] text-ink-3">
        Sources: Nigeria Housing Market (2025 fraud case, upfront rent), Legit.ng (Lagos rent cap). Links on the{" "}
        <Link href="/about" className="underline underline-offset-2">rules page</Link>.
      </p>
    </section>
  );
}

async function Featured() {
  await connection();
  const [units, landlords, t] = await Promise.all([listPublicUnits(), listLandlords(), now()]);
  const names = new Map(landlords.map((l) => [l.id, l.name]));
  const shown = units.slice(0, 3);
  const statuses = await Promise.all(shown.map((u) => unitStatus(u, t.toISOString())));
  return (
    <section className="container-page mt-28">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Homes on Kodi</p>
          <h2 className="mt-3 text-[2.2rem] sm:text-[2.8rem]">Every listing shows if it&apos;s free.</h2>
          <p className="mt-3 max-w-xl text-[1.02rem] text-ink-2">
            A badge on each home says whether a deposit is already held on it. If it is, nobody can pay for it here.
          </p>
        </div>
        <Link href="/homes" className="btn btn-ghost">
          See all homes <ArrowRightIcon className="size-4" />
        </Link>
      </div>
      {shown.length ? (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((u, i) => (
            <Reveal key={u.id} delay={i * 90}>
              <UnitCard unit={u} status={statuses[i]} landlordName={names.get(u.landlordId) ?? ""} />
            </Reveal>
          ))}
        </div>
      ) : (
        <div className="mt-10 rounded-[26px] border border-dashed border-line-2 bg-card p-10 text-center">
          <p className="text-[1.15rem] font-semibold">No homes listed yet.</p>
          <p className="mt-2 text-ink-2">Landlords register, Kodi checks them, then their homes appear here.</p>
          <Link href="/landlord/register" className="btn btn-primary mt-6">List a property</Link>
        </div>
      )}
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { icon: BadgeCheckIcon, title: "Pick a verified home", text: "Every landlord is checked by Kodi before listing. Each home has a code, like KD-YABA2, that anyone can look up." },
    { icon: WalletIcon, title: "Pay into escrow", text: "Pay up to 12 months' rent plus the agent fee over Lightning. Kodi holds it; nobody can spend it yet." },
    { icon: LockIcon, title: "The home locks", text: "From that moment no one else can pay a deposit for it on Kodi. The listing shows “Deposit held” to everyone." },
    { icon: KeyRoundIcon, title: "Keys, then payout", text: "When you have the keys, tap “I've moved in”. The landlord and agent are paid their shares in seconds." },
  ];
  return (
    <section id="how-it-works" className="container-page mt-28 scroll-mt-28">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <Reveal className="relative aspect-[4/5] overflow-hidden rounded-[32px] bg-sand">
          <Image src={SCENES.keys.src} alt={SCENES.keys.alt} fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
          <div className="absolute bottom-5 left-5 right-5 rounded-[20px] bg-forest-2/90 p-5 text-forest-ink backdrop-blur">
            <p className="text-[0.85rem] text-forest-muted">If the keys never come</p>
            <p className="mt-1 text-[1.05rem] font-semibold leading-snug">
              Ask for a refund after the move-in date. Unless the landlord objects within 48 hours, it&apos;s paid back to you.
              An objection goes to Kodi&apos;s arbiter.
            </p>
          </div>
        </Reveal>
        <div>
          <p className="eyebrow">Safe Deposit</p>
          <h2 className="mt-3 text-[2.2rem] sm:text-[2.8rem]">Money moves only when the keys do.</h2>
          <ol className="mt-10 space-y-3">
            {steps.map((s, i) => (
              <Reveal as="li" key={s.title} delay={i * 70} className="flex gap-5 rounded-[22px] border border-line bg-card p-5">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-paper-2 text-forest">
                  <s.icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[0.82rem] font-semibold text-laterite">Step {i + 1}</p>
                  <h3 className="mt-0.5 text-[1.15rem] tracking-[-0.02em]">{s.title}</h3>
                  <p className="mt-1.5 text-[0.98rem] leading-relaxed text-ink-2">{s.text}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function FraudBlocked() {
  return (
    <section className="mt-28 bg-forest-2 py-24 text-forest-ink">
      <div className="container-page grid gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-[0.82rem] font-semibold uppercase tracking-[0.08em] text-forest-muted">The anti-fraud rule</p>
          <h2 className="mt-3 text-[2.2rem] sm:text-[2.8rem]">One home, one deposit. Enforced by the database.</h2>
          <p className="mt-5 max-w-lg text-[1.05rem] leading-relaxed text-forest-muted">
            The same flat can&apos;t be let to two people on Kodi. While a deposit is being paid, held, waiting on a refund
            or with the arbiter, the database refuses any other deposit for that home. It isn&apos;t only a check in the
            app that a bug could skip.
          </p>
          <Link href="/check" className="btn mt-8 bg-white text-ink hover:bg-paper">
            Check a unit code <ArrowRightIcon className="size-4" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Reveal className="rounded-[24px] bg-white p-6 text-ink">
            <p className="text-[0.85rem] font-semibold text-ink-3">Tenant A · 10:02</p>
            <p className="mt-3 text-[1.2rem] font-bold tracking-[-0.02em]">Deposit paid</p>
            <p className="mt-1 text-[0.95rem] text-ink-2">₦2,640,000 into escrow for KD-YABA2.</p>
            <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-blue-soft px-3 py-1.5 text-[0.85rem] font-semibold text-blue">
              <LockIcon className="size-4" aria-hidden="true" /> Home locked
            </span>
          </Reveal>
          <Reveal delay={120} className="rounded-[24px] bg-white p-6 text-ink sm:mt-14">
            <p className="text-[0.85rem] font-semibold text-ink-3">Tenant B · 10:09</p>
            <p className="mt-3 text-[1.2rem] font-bold tracking-[-0.02em]">Payment refused</p>
            <p className="mt-1 text-[0.95rem] text-ink-2">“This unit already has a deposit held on Kodi, so nobody else can pay for it.”</p>
            <span className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-clay-soft px-3 py-1.5 text-[0.85rem] font-semibold text-clay">
              <BanIcon className="size-4" aria-hidden="true" /> No money taken
            </span>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Vault() {
  return (
    <section className="container-page mt-28">
      <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
        <div>
          <p className="eyebrow">Rent Vault</p>
          <h2 className="mt-3 text-[2.2rem] sm:text-[2.8rem]">Save monthly. Prove it to your landlord.</h2>
          <p className="mt-5 max-w-xl text-[1.05rem] leading-relaxed text-ink-2">
            Salaries are monthly; rent is yearly. Already renting? Save toward next year&apos;s rent in small Lightning
            payments. Your landlord gets a link that shows your progress, and on the due date Kodi pays them what
            you saved. The money can&apos;t be spent on anything else, so your landlord gets the security of a lump sum
            without you needing one.
          </p>
          <ul className="mt-7 space-y-3 text-[1rem]">
            {["Weekly or monthly, from ₦500", "Family abroad can top up from any Lightning wallet", "Shown in naira; paid out on the due date"].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="flex size-6 items-center justify-center rounded-full bg-green-soft text-green-2"><CheckIcon className="size-3.5" /></span>
                {t}
              </li>
            ))}
          </ul>
          <Link href="/vault" className="btn btn-primary mt-9">
            Start a Rent Vault <ArrowRightIcon className="size-4" />
          </Link>
        </div>
        <Reveal className="rounded-[30px] border border-line bg-card p-7 shadow-[0_30px_60px_-35px_rgba(20,33,27,0.4)]">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-[0.92rem] font-semibold">
              <PiggyBankIcon className="size-5 text-forest" aria-hidden="true" /> Rent Vault · RV-8KD3QM
            </span>
            <span className="rounded-full bg-green-soft px-2.5 py-1 text-[0.78rem] font-semibold text-green-2">On track</span>
          </div>
          <p className="mt-6 text-[0.9rem] text-ink-3">Saved for next year&apos;s rent</p>
          <p className="mt-1 text-[2.3rem] font-extrabold tracking-[-0.04em]">
            ₦1,400,000 <span className="text-[1rem] font-medium tracking-normal text-ink-3">of ₦2,400,000</span>
          </p>
          <div className="progress-track mt-4"><div className="progress-fill" style={{ width: "58%" }} /></div>
          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            {[["₦125k", "per month"], ["8", "months left"], ["14 Mar", "due date"]].map(([a, b]) => (
              <div key={b} className="rounded-2xl bg-paper p-3">
                <p className="text-[1.1rem] font-bold">{a}</p>
                <p className="text-[0.8rem] text-ink-3">{b}</p>
              </div>
            ))}
          </div>
          <ul className="mt-6 divide-y divide-line text-[0.92rem]">
            {[["You", "₦125,000", "2 days ago"], ["Auntie Bisi (London)", "₦200,000", "last week"], ["You", "₦125,000", "1 month ago"]].map(([who, amt, when], i) => (
              <li key={i} className="flex items-center justify-between py-2.5">
                <span>{who}</span>
                <span className="text-ink-3">{when}</span>
                <span className="font-semibold">{amt}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

function ForLandlords() {
  const points = [
    { icon: BadgeCheckIcon, title: "A verified badge", text: "Tenants can see you were checked. Honest landlords stand out from fake listings." },
    { icon: WalletIcon, title: "Paid in seconds", text: "When the tenant confirms the keys, your share goes straight to your Lightning wallet. Agents get theirs automatically." },
    { icon: PiggyBankIcon, title: "Proof of next year's rent", text: "Sitting tenants can save in a Rent Vault you can watch, and it pays you on the due date." },
    { icon: ScaleIcon, title: "A fair arbiter", text: "If a tenant won't confirm after handover, open a dispute. An arbiter decides, and every step is logged." },
  ];
  return (
    <section id="for-landlords" className="container-page mt-28 scroll-mt-28">
      <div className="rounded-[34px] bg-paper-2 p-8 sm:p-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="eyebrow">For landlords and agents</p>
            <h2 className="mt-3 text-[2.2rem] sm:text-[2.8rem]">Get paid faster, by tenants who trust you.</h2>
          </div>
          <Link href="/landlord/register" className="btn btn-primary">
            List your property <ArrowRightIcon className="size-4" />
          </Link>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {points.map((p, i) => (
            <Reveal key={p.title} delay={i * 70} className="rounded-[22px] bg-card p-6">
              <p.icon className="size-6 text-laterite" aria-hidden="true" />
              <h3 className="mt-4 text-[1.1rem] tracking-[-0.02em]">{p.title}</h3>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-2">{p.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

async function Trust() {
  await connection();
  const t = await totals();
  const fresh = !t.heldCount && !t.releasedCount && !t.vaultCount && !t.blockedCount;
  const items = fresh
    ? [
        ["1", "deposit per home, enforced by the database"],
        ["48 h", "for a landlord to object before a refund is paid"],
        ["0", "payouts larger than what was paid in: the database refuses them"],
        ["Daily", "check that the wallet covers everything Kodi owes"],
      ]
    : [
    [formatInt(t.heldCount), "deposits held in escrow now"],
    [formatInt(t.releasedCount), "homes handed over and paid"],
    [formatInt(t.vaultCount), "Rent Vaults saving"],
    [formatInt(t.blockedCount), "second payments for a taken home refused"],
  ];
  return (
    <section className="container-page mt-28">
      <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:items-center">
        <div>
          <p className="eyebrow">Escrow ledger</p>
          <h2 className="mt-3 text-[2.2rem] sm:text-[2.6rem]">Don&apos;t trust us. Check.</h2>
          <p className="mt-4 text-[1.02rem] leading-relaxed text-ink-2">
            Every deposit, payout and refund has a receipt with its Lightning payment proof. Each day Kodi compares its
            wallet with what it owes and publishes the result.
          </p>
          <Link href="/ledger" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-forest underline-offset-4 hover:underline">
            Open the escrow ledger <ArrowRightIcon className="size-4" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {items.map(([n, label]) => (
            <div key={label} className="rounded-[22px] border border-line bg-card p-6">
              <p className="text-[2.4rem] font-extrabold tracking-[-0.04em]">{n}</p>
              <p className="mt-1 text-[0.92rem] text-ink-2">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const qs = [
    ["Bitcoin moves in price, and rent is in naira. Isn't that risky?", "Amounts are set in naira. A Safe Deposit is held only for days, until move-in, and the exchange rate is fixed when you pay. Rent Vault savings are shown in naira; a dollar-stable option is planned."],
    ["What if the landlord says they handed over the keys but didn't?", "Only your confirmation releases the money. A landlord can't release it. If you never got the keys, ask for a refund after the move-in date."],
    ["What if the tenant has the keys but never confirms?", "After the move-in date the landlord can open a dispute. Kodi's arbiter looks at the evidence and decides, and the decision is logged."],
    ["Who holds the money?", "In this version, Kodi does, in its own Lightning wallet, with a public escrow ledger and a daily check that the wallet covers every naira held. The next step is a 2-of-3 multisig (tenant, landlord, arbiter) so no one party can move it alone."],
    ["Can someone still fake a listing?", "Landlords are checked by Kodi (ID and phone) before their homes appear. Property title checks come later. A listing can be frozen at once if someone reports it."],
  ];
  return (
    <section className="container-page mt-28">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <p className="eyebrow">Questions</p>
          <h2 className="mt-3 text-[2.2rem] sm:text-[2.6rem]">What people ask first.</h2>
        </div>
        <div className="divide-y divide-line border-y border-line">
          {qs.map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[1.08rem] font-semibold">
                {q}
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line-2 text-ink-2 transition-transform group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="mt-3 max-w-2xl text-[1rem] leading-relaxed text-ink-2">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="container-page mt-28">
      <div className="relative overflow-hidden rounded-[34px] bg-forest text-forest-ink">
        <Image src={SCENES.skyline.src} alt="" fill sizes="100vw" className="object-cover opacity-25" />
        <div className="relative px-8 py-16 sm:px-14 sm:py-20">
          <h2 className="max-w-2xl text-[2.3rem] sm:text-[3.2rem]">Rent your next home without fear.</h2>
          <p className="mt-4 max-w-xl text-[1.05rem] text-forest-muted">
            Find a verified home, or check the code of one you&apos;ve been shown before you pay anyone.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/homes" className="btn btn-accent">Find a home <ArrowRightIcon className="size-4" /></Link>
            <Link href="/check" className="btn !border-white/40 text-forest-ink hover:bg-white/10">Check a unit code</Link>
          </div>
          <p className="mt-10 text-[0.85rem] text-forest-muted">Example amounts on this page are illustrative. {formatNaira(2_400_000)} is a typical Yaba 2-bedroom rent.</p>
        </div>
      </div>
    </section>
  );
}
