import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Progress } from "@/components/status";
import { getVaultByCode } from "@/lib/data";
import { formatDay } from "@/lib/format";
import { network } from "@/lib/lightning";
import { vaultView } from "@/lib/vaults";
import { TopUpForm } from "../../vault-forms";

export const metadata = { title: "Help with rent", robots: { index: false } };

export default function FamilyTopUpPage({ params }: PageProps<"/vault/top-up/[code]">) {
  return (
    <Suspense fallback={<div className="container-page min-h-[70vh]" />}>
      <View params={params} />
    </Suspense>
  );
}

/** A link a tenant shares with family: shows only their first name, the area and the progress. */
async function View({ params }: { params: PageProps<"/vault/top-up/[code]">["params"] }) {
  await connection();
  const vault = await getVaultByCode(decodeURIComponent((await params).code));
  if (!vault) notFound();
  const v = await vaultView(vault);
  const first = vault.tenantName.split(" ")[0];
  return (
    <div className="container-page max-w-2xl py-10 md:py-14">
      <p className="eyebrow">Rent Vault <span className="code-chip normal-case">{vault.code}</span></p>
      <h1 className="mt-3 text-[2.2rem] sm:text-[2.7rem]">Help {first} with rent</h1>
      <p className="mt-3 text-[1.02rem] text-ink-2">
        {first} is saving for a home in {v.unit.area}, Lagos. What you add is locked and paid straight to the landlord on{" "}
        {formatDay(vault.dueDate)}. It can&apos;t be spent on anything else.
      </p>
      <div className="mt-6 rounded-2xl bg-card p-5 ring-1 ring-line">
        <p className="text-[0.95rem] font-semibold">{Math.round(v.progress * 100)}% saved</p>
        <Progress value={v.progress} className="mt-3" />
      </div>
      {vault.status === "active" ? (
        <section className="mt-8 rounded-[28px] border border-line bg-card p-6 sm:p-7">
          <TopUpForm code={vault.code} presets={[10_000, 25_000, 50_000, 100_000]} network={network()} askName />
        </section>
      ) : (
        <p className="mt-8 rounded-2xl bg-green-soft p-5">This vault has been paid to the landlord. Thank you for helping.</p>
      )}
    </div>
  );
}
