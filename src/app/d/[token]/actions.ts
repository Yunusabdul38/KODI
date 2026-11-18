"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";
import { getDepositByToken } from "@/lib/data";
import { KodiError, openDispute, releaseDeposit, requestRefund } from "@/lib/deposits";
import { rateLimit } from "@/lib/rate-limit";
import { tokenHash } from "@/lib/secrets";

export type ActState = { error?: string; ok?: string } | undefined;

async function load(token: string) {
  const ip = clientIp(await headers());
  if (!rateLimit(`deposit-act:${ip}`, 30, 15 * 60_000)) throw new KodiError("Too many attempts. Please wait a few minutes.");
  const d = await getDepositByToken(tokenHash(token));
  if (!d) throw new KodiError("This deposit link isn't valid.");
  return d;
}

async function run(token: string, fn: () => Promise<unknown>, ok: string): Promise<ActState> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof KodiError) return { error: e.message };
    console.error(e);
    return { error: "Something went wrong. Nothing was changed; please try again." };
  }
  revalidatePath(`/d/${token}`);
  return { ok };
}

/** The tenant has the keys: release the deposit to landlord and agent. */
export async function confirmMoveIn(token: string, _: ActState, form: FormData): Promise<ActState> {
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm you have the keys." };
  return run(token, async () => {
    const d = await load(token);
    await releaseDeposit(d, { role: "tenant", actor: d.tenantEmail });
  }, "Done. The landlord has been paid. Welcome home.");
}

export async function askRefund(token: string): Promise<ActState> {
  return run(token, async () => requestRefund(await load(token)), "Refund requested. The landlord has 48 hours to object.");
}

export async function tenantDispute(token: string, _: ActState, form: FormData): Promise<ActState> {
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 10) return { error: "Tell the arbiter what happened (at least a sentence)." };
  return run(token, async () => {
    const d = await load(token);
    await openDispute(d, { role: "tenant", actor: d.tenantEmail }, reason.slice(0, 500));
  }, "Dispute opened. Kodi's arbiter will look at it.");
}
