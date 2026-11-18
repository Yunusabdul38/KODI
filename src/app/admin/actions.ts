"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAdmin, signInAdmin, signOutAdmin } from "@/lib/auth";
import { clientIp } from "@/lib/client-ip";
import {
  addAudit,
  clockOffsetSeconds,
  getLandlord,
  getPayout,
  getUnit,
  getVault,
  listOpenDisputes,
  setClockOffsetSeconds,
  updateLandlord,
  updateUnit,
} from "@/lib/data";
import { decide, KodiError } from "@/lib/deposits";
import { runDailyJobs } from "@/lib/jobs";
import { network } from "@/lib/lightning";
import { appUrl, sendEmail } from "@/lib/notify";
import { recordPayout, resolvePendingPayout, sendPayout } from "@/lib/payouts";
import { rateLimit } from "@/lib/rate-limit";
import { returnVault } from "@/lib/vaults";

export type AdminState = { error?: string; ok?: string } | undefined;

export async function adminSignIn(_: AdminState, form: FormData): Promise<AdminState> {
  const ip = clientIp(await headers());
  if (!rateLimit(`admin-login:${ip}`, 8, 15 * 60_000) || !rateLimit("admin-login:all", 60, 15 * 60_000)) {
    return { error: "Too many attempts. Please wait 15 minutes." };
  }
  if (!(await signInAdmin(String(form.get("password") ?? "")))) return { error: "Wrong password." };
  redirect("/admin");
}

export async function adminSignOut() {
  await signOutAdmin();
  redirect("/admin");
}

async function guard() {
  if (!(await isAdmin())) throw new KodiError("Please sign in again.");
}

const act = async (fn: () => Promise<string | void>): Promise<AdminState> => {
  try {
    await guard();
    const ok = await fn();
    revalidatePath("/admin");
    return { ok: ok || "Done." };
  } catch (e) {
    if (e instanceof KodiError) return { error: e.message };
    console.error(e);
    return { error: (e as Error).message.slice(0, 200) };
  }
};

export async function verifyLandlord(id: string, _: AdminState, form: FormData): Promise<AdminState> {
  const decision = form.get("decision");
  const reason = String(form.get("reason") ?? "").trim();
  return act(async () => {
    const l = await getLandlord(id);
    if (!l) throw new KodiError("Landlord not found.");
    if (decision === "approve") {
      await updateLandlord(id, { verified: true, declinedReason: null, reviewedAt: new Date().toISOString() });
      await addAudit({ role: "admin", actor: "arbiter", action: "landlord_verified", details: l.name });
      await sendEmail([l.email], "You're verified on Kodi", `You can now list homes and take Safe Deposits.\n\n${appUrl()}/landlord`).catch(() => {});
      return `${l.name} is verified.`;
    }
    if (reason.length < 5) throw new KodiError("Give the landlord a reason they can act on.");
    await updateLandlord(id, { verified: false, declinedReason: reason, reviewedAt: new Date().toISOString() });
    await addAudit({ role: "admin", actor: "arbiter", action: "landlord_declined", details: `${l.name}: ${reason}` });
    return `${l.name} was declined.`;
  });
}

export async function decideDispute(_: AdminState, form: FormData): Promise<AdminState> {
  const id = String(form.get("disputeId") ?? "");
  const decision = form.get("decision") === "release" ? "release" : "refund";
  const note = String(form.get("note") ?? "").trim().slice(0, 300);
  return act(async () => {
    if (note.length < 5) throw new KodiError("Write a short note on why: both sides see it.");
    const d = (await listOpenDisputes()).find((x) => x.id === id);
    if (!d) throw new KodiError("This dispute was already decided.");
    await decide(d, decision, note);
    return decision === "release" ? "Released to the landlord." : "Refunded to the tenant.";
  });
}

export async function setFrozen(unitId: string, frozen: boolean) {
  await guard();
  const u = await getUnit(unitId);
  if (!u) return;
  await updateUnit(unitId, { frozen });
  await addAudit({ role: "admin", actor: "arbiter", action: frozen ? "unit_frozen" : "unit_unfrozen", unitId, details: u.code });
  revalidatePath("/admin");
}

export async function resolvePayout(id: string, outcome: "sent" | "failed") {
  await guard();
  const p = await getPayout(id);
  if (p) await resolvePendingPayout(p, outcome);
  revalidatePath("/admin");
}

/** A failed payout freed its amount; pay it again to the same destination. */
export async function retryPayout(id: string): Promise<AdminState> {
  return act(async () => {
    const p = await getPayout(id);
    if (!p || p.status !== "failed") throw new KodiError("Only a failed payout can be retried.");
    const n = Date.now().toString(36);
    const again = await recordPayout({
      depositId: p.depositId ?? undefined,
      vaultId: p.vaultId ?? undefined,
      recipient: p.recipient,
      method: p.method,
      address: p.method === "lightning" ? p.destination : null,
      amountSats: p.amountSats,
      ngnPerBtc: p.ngnPerBtc,
      idempotencyKey: `${p.idempotencyKey}:retry-${n}`,
      memo: "Kodi payout (retry)",
    });
    const sent = await sendPayout(again, "Kodi payout (retry)");
    return sent.status === "sent" ? "Paid." : sent.status === "failed" ? "Failed again; check the destination." : "Sent; being confirmed.";
  });
}

export async function returnVaultToTenant(_: AdminState, form: FormData): Promise<AdminState> {
  const id = String(form.get("vaultId") ?? "");
  const note = String(form.get("note") ?? "").trim();
  const address = String(form.get("address") ?? "").trim().toLowerCase();
  return act(async () => {
    const v = await getVault(id);
    if (!v) throw new KodiError("Vault not found.");
    if (note.length < 5) throw new KodiError("Write why the savings go back.");
    const useTest = network() !== "mainnet" && !address;
    if (!useTest && !/^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(address)) throw new KodiError("Enter the tenant's Lightning address.");
    await returnVault(v, useTest ? "test_wallet" : "lightning", useTest ? null : address, note);
    return "Returned to the tenant.";
  });
}

// ----------------------------------------------------------- test network only

function demoOnly() {
  if (network() === "mainnet") throw new KodiError("The demo clock exists only on the test network.");
}

export async function skipAhead(days: number): Promise<AdminState> {
  return act(async () => {
    demoOnly();
    const next = days === 0 ? 0 : (await clockOffsetSeconds()) + days * 86_400;
    await setClockOffsetSeconds(next);
    await addAudit({ role: "admin", actor: "arbiter", action: "demo_clock", details: days === 0 ? "reset" : `+${days} days` });
    return days === 0 ? "Clock back to real time." : `Skipped ahead ${days} ${days === 1 ? "day" : "days"}.`;
  });
}

export async function runJobsNow(): Promise<AdminState> {
  return act(async () => {
    demoOnly();
    const r = await runDailyJobs();
    return `Daily jobs ran: ${r.vaultsPaid} vault${r.vaultsPaid === 1 ? "" : "s"} paid, ${r.refunds} refund${r.refunds === 1 ? "" : "s"} paid, reserves checked.`;
  });
}
