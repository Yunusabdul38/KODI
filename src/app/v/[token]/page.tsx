import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CopyLink } from "@/components/copy-link";
import { Timeline } from "@/components/timeline";
import { VaultSummary } from "@/components/vault-summary";
import { auditForVault, getLandlord, getVaultByToken, listPayoutsForVault } from "@/lib/data";
import { formatDay, formatSats } from "@/lib/format";
import { network } from "@/lib/lightning";
import { appUrl, emailEnabled } from "@/lib/notify";
import { vaultUnlocked } from "@/lib/auth";
import { landlordViewToken, tokenHash } from "@/lib/secrets";
import { vaultView } from "@/lib/vaults";
import { TopUpForm, VaultPinForm } from "../../vault/vault-forms";

export const metadata = { title: "Your Rent Vault", robots: { index: false } };

export default function TenantVaultPage({ params }: PageProps<"/v/[token]">) {
  return (
    <Suspense fallback={<div className="container-page min-h-[80vh]" />}>
      <TenantVault params={params} />
    </Suspense>
  );
}

async function TenantVault({ params }: { params: PageProps<"/v/[token]">["params"] }) {
  await connection();
  const { token } = await params;
  const vault = await getVaultByToken(tokenHash(token));
  if (!vault) notFound();
  if (!(await vaultUnlocked(vault))) {
    return (
      <div className="container-page max-w-md py-14 md:py-20">
        <p className="eyebrow">Your Rent Vault</p>
        <h1 className="mt-3 text-[2.2rem]">Enter your PIN</h1>
        <p className="mt-3 text-[1rem] text-ink-2">
          This private page is locked with the 6-digit PIN you chose when you opened the vault. Someone with only the link sees nothing.
        </p>
        <div className="mt-8 rounded-[28px] border border-line bg-card p-6 sm:p-7"><VaultPinForm token={token} /></div>
      </div>
    );
  }
  const v = await vaultView(vault);
  const landlord = await getLandlord(v.unit.landlordId);
  const [entries, payouts] = await Promise.all([auditForVault(vault.id), listPayoutsForVault(vault.id)]);
  const presets = [...new Set([v.perPeriodNgn, 25_000, 50_000, 100_000].filter((n) => n >= 500))].slice(0, 4);

  return (
    <div className="container-page py-10 md:py-14">
      <p className="eyebrow">Your Rent Vault</p>
      <h1 className="mt-3 text-[2.2rem] sm:text-[2.7rem]">
        Saving for {v.unit.title.toLowerCase()}, {v.unit.area}
      </h1>
      <p className="mt-2 text-[1rem] text-ink-2">
        Paid to {landlord?.name} on {formatDay(vault.dueDate)}.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-6">
          <VaultSummary v={v} />
          {payouts.map((p) => (
            <p key={p.id} className="rounded-2xl bg-green-soft px-4 py-3 text-[0.95rem]">
              {p.recipient === "landlord" ? "Paid to the landlord" : "Returned to you"}: {formatSats(p.amountSats)} to {p.destination}.
            </p>
          ))}
          <section className="rounded-[26px] border border-line bg-card p-6">
            <h2 className="text-[1.15rem]">History</h2>
            <div className="mt-5"><Timeline entries={entries} /></div>
          </section>
        </div>

        <div className="space-y-6">
          {vault.status === "pending" && (
            <p role="status" className="rounded-[22px] bg-amber-soft p-5 text-[0.97rem]">
              <strong>Waiting for {landlord?.name ?? "your landlord"} to confirm you live here.</strong> You can add money and share
              the family link once they do. They&apos;ve been told about your request.
            </p>
          )}
          {vault.status === "declined" && (
            <p role="status" className="rounded-[22px] bg-clay-soft p-5 text-[0.97rem]">
              <strong>{landlord?.name ?? "The landlord"} didn&apos;t confirm this vault</strong>, so it can&apos;t take money. If you
              live there, talk to them, then ask again from the Rent Vault page.
            </p>
          )}
          {vault.status === "active" && (
            <section className="rounded-[28px] border border-line bg-card p-6 shadow-[0_30px_60px_-45px_rgba(20,33,27,0.5)] sm:p-7">
              <h2 className="text-[1.3rem]">Add money</h2>
              <p className="mt-1.5 text-[0.95rem] text-ink-2">Any amount from ₦500. It&apos;s locked for your rent.</p>
              <div className="mt-6"><TopUpForm token={token} presets={presets} network={network()} /></div>
            </section>
          )}
          <section className="space-y-5 rounded-[26px] bg-paper-2 p-6">
            <div>
              <h2 className="text-[1.05rem]">Show your landlord</h2>
              <p className="mt-1 text-[0.9rem] text-ink-2">A read-only page with your progress. It doesn&apos;t let anyone add or take money.</p>
              <div className="mt-2.5"><CopyLink url={`${appUrl()}/v/landlord/${landlordViewToken(token)}`} /></div>
            </div>
            {vault.status === "active" && (
              <div>
                <h2 className="text-[1.05rem]">Let family help</h2>
                <p className="mt-1 text-[0.9rem] text-ink-2">Anyone with this link can add money from any Lightning wallet, anywhere in the world.</p>
                <div className="mt-2.5"><CopyLink url={`${appUrl()}/vault/top-up/${vault.code}`} /></div>
              </div>
            )}
            <div>
              <h2 className="text-[1.05rem]">Your private link</h2>
              <p className="mt-1 text-[0.9rem] text-ink-2">
                {emailEnabled() ? `Also emailed to ${vault.tenantEmail}.` : "Email isn't set up on this server: keep this link."} It opens only with your PIN.
              </p>
              <div className="mt-2.5"><CopyLink url={`${appUrl()}/v/${token}`} /></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
