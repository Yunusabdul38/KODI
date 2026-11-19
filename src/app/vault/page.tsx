import { CalendarClockIcon, EyeIcon, HandCoinsIcon, LockIcon } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { lagosDate, now } from "@/lib/clock";
import { getDepositByToken, getUnit } from "@/lib/data";
import { tokenHash } from "@/lib/secrets";
import { StartVaultForm, type VaultFromDeposit } from "./vault-forms";

export const metadata = { title: "Rent Vault" };

export default function VaultPage({ searchParams }: PageProps<"/vault">) {
  const points = [
    { icon: HandCoinsIcon, title: "Save in small steps", text: "Add money weekly or monthly from any Lightning wallet, from ₦500. Family abroad can top up too." },
    { icon: EyeIcon, title: "Your landlord can watch", text: "Your landlord confirms you live there, then sees how much is saved and whether you're on track, never your other details." },
    { icon: LockIcon, title: "Locked for rent", text: "Money in the vault can only go to your landlord. That's what makes it as good as a lump sum to them." },
    { icon: CalendarClockIcon, title: "Paid on the due date", text: "On the day, Kodi pays your landlord everything saved, with a receipt for both of you." },
  ];
  return (
    <div className="container-page py-10 md:py-14">
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="eyebrow">Rent Vault</p>
          <h1 className="mt-3 text-[2.4rem] sm:text-[3rem]">Next year&apos;s rent, a little at a time.</h1>
          <p className="mt-4 text-[1.05rem] leading-relaxed text-ink-2">
            Lagos landlords want a year up front because chasing rent monthly is hard. A Rent Vault gives them the same
            security: savings they can see, locked for rent and paid on the due date. You save the way you&apos;re paid.
          </p>
          <ul className="mt-10 space-y-4">
            {points.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-paper-2 text-forest">
                  <p.icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-[1.08rem] tracking-[-0.01em]">{p.title}</h2>
                  <p className="mt-1 text-[0.97rem] text-ink-2">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[28px] border border-line bg-card p-6 shadow-[0_30px_60px_-45px_rgba(20,33,27,0.5)] sm:p-8 lg:self-start">
          <h2 className="text-[1.35rem]">Open a Rent Vault</h2>
          <p className="mt-1.5 text-[0.95rem] text-ink-2">For tenants already living in a home listed on Kodi.</p>
          <div className="mt-6">
            <Suspense fallback={<div className="min-h-96" />}>
              <Form searchParams={searchParams} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Form({ searchParams }: { searchParams: PageProps<"/vault">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const depositToken = first(sp.deposit);
  const deposit = depositToken ? await getDepositByToken(tokenHash(depositToken)) : null;
  const unit = deposit?.status === "released" ? await getUnit(deposit.unitId) : null;
  const fromDeposit: VaultFromDeposit | undefined =
    deposit && unit ? { token: depositToken!, unitCode: unit.code, tenantName: deposit.tenantName, tenantEmail: deposit.tenantEmail } : undefined;
  const t = await now();
  return (
    <StartVaultForm
      unitCode={first(sp.unit) ?? ""}
      fromDeposit={fromDeposit}
      minDate={lagosDate(new Date(t.getTime() + 86_400_000))}
      maxDate={lagosDate(new Date(t.getTime() + 548 * 86_400_000))}
    />
  );
}
