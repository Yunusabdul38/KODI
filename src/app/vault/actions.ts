"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clientIp } from "@/lib/client-ip";
import { getLandlord, getUnitByCode, getVaultByCode, getVaultByToken } from "@/lib/data";
import { KodiError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { tokenHash } from "@/lib/secrets";
import { startVault, topUp } from "@/lib/vaults";

export type VaultFormState = { error?: string; errors?: Partial<Record<string, string>> };

const schema = z.object({
  unitCode: z.string().trim().toUpperCase().regex(/^KD-[A-Z0-9]{5}$/, "Enter the home's Kodi code, like KD-YABA2."),
  tenantName: z.string().trim().min(2, "Enter your name.").max(80),
  tenantEmail: z.string().trim().pipe(z.email("Enter your email address.").max(200)),
  targetNgn: z.coerce.number({ error: "Enter the target." }).int().min(10_000, "At least ₦10,000."),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose when the rent is due."),
  schedule: z.enum(["weekly", "monthly"]),
});

export async function createVault(_: VaultFormState, form: FormData): Promise<VaultFormState> {
  const ip = clientIp(await headers());
  if (!rateLimit(`vault:${ip}`, 10, 15 * 60_000)) return { error: "Too many attempts. Please wait 15 minutes." };
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors };
  }
  const d = parsed.data;
  const unit = await getUnitByCode(d.unitCode);
  const landlord = unit && (await getLandlord(unit.landlordId));
  if (!unit || !landlord?.verified) return { errors: { unitCode: "That code isn't a home on Kodi. Ask your landlord to list it." } };
  let token: string;
  try {
    token = (await startVault({ unit, tenantName: d.tenantName, tenantEmail: d.tenantEmail, targetNgn: d.targetNgn, dueDate: d.dueDate, schedule: d.schedule })).token;
  } catch (e) {
    if (e instanceof KodiError) return { error: e.message };
    console.error(e);
    return { error: "Something went wrong. Please try again." };
  }
  redirect(`/v/${token}`);
}

export type TopUpState = { error?: string; invoice?: { hash: string; pr: string; expiresAt: string; sats: number; amountNgn: number } };

/** A top-up from the tenant's own page (`token`) or a family link (`code`). */
export async function createTopUp(ref: { token?: string; code?: string }, _: TopUpState, form: FormData): Promise<TopUpState> {
  const ip = clientIp(await headers());
  if (!rateLimit(`topup:${ip}`, 20, 15 * 60_000)) return { error: "Too many attempts. Please wait a few minutes." };
  const vault = ref.token ? await getVaultByToken(tokenHash(ref.token)) : ref.code ? await getVaultByCode(ref.code) : null;
  if (!vault) return { error: "This vault link isn't valid." };
  const amount = Number(String(form.get("amount") ?? "").replace(/[^\d.]/g, ""));
  const payer = ref.code ? String(form.get("payerName") ?? "").trim().slice(0, 60) : null;
  if (ref.code && !payer) return { error: "Add your name so the tenant knows who helped." };
  try {
    const p = await topUp(vault, amount, payer);
    return { invoice: { hash: p.paymentHash, pr: p.paymentRequest, expiresAt: p.expiresAt, sats: p.amountSats, amountNgn: p.amountNgn } };
  } catch (e) {
    if (e instanceof KodiError) return { error: e.message };
    console.error(e);
    return { error: "We couldn't create the payment request. Please try again." };
  }
}
