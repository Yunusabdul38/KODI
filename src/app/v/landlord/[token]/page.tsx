import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Notice } from "@/components/status";
import { VaultSummary } from "@/components/vault-summary";
import { getVaultByLandlordToken } from "@/lib/data";
import { formatDay } from "@/lib/format";
import { tokenHash } from "@/lib/secrets";
import { vaultView } from "@/lib/vaults";

export const metadata = { title: "Rent Vault progress", robots: { index: false } };

export default function LandlordVaultPage({ params }: PageProps<"/v/landlord/[token]">) {
  return (
    <Suspense fallback={<div className="container-page min-h-[70vh]" />}>
      <View params={params} />
    </Suspense>
  );
}

async function View({ params }: { params: PageProps<"/v/landlord/[token]">["params"] }) {
  await connection();
  const vault = await getVaultByLandlordToken(tokenHash((await params).token));
  if (!vault) notFound();
  const v = await vaultView(vault);
  return (
    <div className="container-page max-w-3xl py-10 md:py-14">
      <p className="eyebrow">For the landlord · read only</p>
      <h1 className="mt-3 text-[2.1rem] sm:text-[2.6rem]">
        {vault.tenantName.split(" ")[0]}&apos;s rent for {v.unit.title.toLowerCase()}, {v.unit.area}
      </h1>
      <p className="mt-3 text-[1.02rem] text-ink-2">
        This money is locked for your rent. On {formatDay(vault.dueDate)} Kodi pays you everything saved, to the payout
        account on your Kodi profile. The tenant can&apos;t withdraw it.
      </p>
      <div className="mt-8"><VaultSummary v={v} showPayers={false} /></div>
      <Notice tone="info" className="mt-6 text-[0.93rem]">
        Each amount links to its receipt with the Lightning payment proof, so you can check it was really paid.
      </Notice>
    </div>
  );
}
