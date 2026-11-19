"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { currentLandlord, signInLandlord, signOutLandlord } from "@/lib/auth";
import { clientIp } from "@/lib/client-ip";
import { AREAS } from "@/lib/areas";
import { addAudit, createLandlord, createUnit, getDeposit, getLandlordByEmail, getUnit, getVault, updateLandlord, updateUnit } from "@/lib/data";
import { KodiError, landlordConfirmHandover, openDispute } from "@/lib/deposits";
import { network } from "@/lib/lightning";
import { appUrl, sendEmail } from "@/lib/notify";
import { PHOTO_KEYS } from "@/lib/photos";
import { rateLimit, recordHit, underLimit } from "@/lib/rate-limit";
import { hashSecret, newCode } from "@/lib/secrets";
import { decideVaultRequest } from "@/lib/vaults";

export type FormState = { error?: string; ok?: string; errors?: Partial<Record<string, string>> } | undefined;

const lnAddress = z.string().trim().toLowerCase().regex(/^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Enter a Lightning address, like rent@wallet.com.");

function fieldErrors(issues: z.core.$ZodIssue[]) {
  const errors: Record<string, string> = {};
  for (const i of issues) errors[String(i.path[0])] ??= i.message;
  return { errors };
}

// ------------------------------------------------------------------ account

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const ip = clientIp(await headers());
  if (!rateLimit(`landlord-login:${ip}`, 10, 15 * 60_000)) return { error: "Too many attempts. Please wait 15 minutes." };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!rateLimit(`landlord-login-account:${email}`, 10, 15 * 60_000)) return { error: "Too many attempts for this account. Please wait 15 minutes." };
  if (!(await signInLandlord(email, String(form.get("password") ?? "")))) return { error: "That email and password don't match a landlord account." };
  redirect("/landlord");
}

export async function signOut() {
  await signOutLandlord();
  redirect("/landlord");
}

const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name or company name.").max(100),
    contactName: z.string().trim().min(2, "Enter the contact person's name.").max(80),
    email: z.string().trim().pipe(z.email("Enter your email address.").max(200)),
    phone: z.string().trim().regex(/^\+?[\d\s()-]{7,20}$/, "Enter a phone number Kodi can call."),
    idType: z.enum(["NIN", "CAC", "Passport", "Driver's licence"], { error: "Choose an ID type." }),
    idNumber: z.string().trim().min(5, "Enter the ID number.").max(40),
    password: z.string().min(10, "Use at least 10 characters.").max(200),
    passwordConfirm: z.string(),
    payoutMethod: z.enum(["lightning", "test_wallet"]),
    lightningAddress: z.string().trim().max(200).optional(),
    owns: z.literal("on", { error: "Please confirm you own or manage these properties." }),
  })
  .refine((d) => d.password === d.passwordConfirm, { path: ["passwordConfirm"], message: "The two passwords don't match." });

export async function register(_: FormState, form: FormData): Promise<FormState> {
  const ip = clientIp(await headers());
  // Only finished sign-ups count, so fixing mistakes in the form never locks anyone out.
  // Shared mobile networks put many people behind one address, hence the room.
  const limitKey = `landlord-register:${ip}`;
  if (!underLimit(limitKey, 10)) return { error: "Too many new accounts from this network in the last hour. Please try again in an hour." };
  const parsed = registerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fieldErrors(parsed.error.issues);
  const d = parsed.data;
  if (d.payoutMethod === "test_wallet" && network() === "mainnet") return { errors: { lightningAddress: "Enter your Lightning address." } };
  let address: string | null = null;
  if (d.payoutMethod === "lightning") {
    const a = lnAddress.safeParse(d.lightningAddress ?? "");
    if (!a.success) return { errors: { lightningAddress: a.error.issues[0].message } };
    address = a.data;
  }
  const email = d.email.toLowerCase();
  if (await getLandlordByEmail(email)) return { errors: { email: "This email already has an account. Sign in instead." } };
  try {
    const l = await createLandlord({
      name: d.name,
      contactName: d.contactName,
      email,
      phone: d.phone,
      accessCodeHash: hashSecret(d.password),
      idType: d.idType,
      idNumber: d.idNumber,
      payoutMethod: d.payoutMethod,
      lightningAddress: address,
    });
    recordHit(limitKey, 60 * 60_000);
    await addAudit({ role: "landlord", actor: email, action: "landlord_registered", details: l.name });
    await sendEmail([process.env.ADMIN_EMAIL], `New landlord to verify: ${l.name}`, `${l.name} (${l.phone}) registered.\n\n${appUrl()}/admin`).catch(() => {});
  } catch (e) {
    if (/landlords_email_key|duplicate/.test((e as Error).message)) return { errors: { email: "This email already has an account. Sign in instead." } };
    throw e;
  }
  // No automatic sign-in: Kodi checks the landlord first.
  redirect("/landlord/register/submitted");
}

async function requireLandlord(verified = true) {
  const l = await currentLandlord();
  if (!l) throw new KodiError("Please sign in again.");
  if (verified && !l.verified) throw new KodiError("Kodi is still checking your account.");
  return l;
}

const wrap = async (fn: () => Promise<string>): Promise<FormState> => {
  try {
    const ok = await fn();
    revalidatePath("/landlord");
    return { ok };
  } catch (e) {
    if (e instanceof KodiError) return { error: e.message };
    console.error(e);
    return { error: "Something went wrong. Nothing was changed." };
  }
};

export async function savePayout(_: FormState, form: FormData): Promise<FormState> {
  const method = form.get("payoutMethod") === "test_wallet" ? "test_wallet" : "lightning";
  if (method === "test_wallet" && network() === "mainnet") return { error: "Test wallets exist only on the test network." };
  let address: string | null = null;
  if (method === "lightning") {
    const a = lnAddress.safeParse(form.get("lightningAddress") ?? "");
    if (!a.success) return { errors: { lightningAddress: a.error.issues[0].message } };
    address = a.data;
  }
  return wrap(async () => {
    const l = await requireLandlord(false);
    await updateLandlord(l.id, { payoutMethod: method, lightningAddress: address });
    await addAudit({ role: "landlord", actor: l.email, action: "payout_changed", details: method === "lightning" ? address : "test wallet" });
    return "Saved. Future payouts go there.";
  });
}

// -------------------------------------------------------------------- units

const unitSchema = z.object({
  title: z.string().trim().min(3, "Describe the home, e.g. 2-bedroom flat.").max(60),
  area: z.enum(AREAS, { error: "Choose the area." }),
  address: z.string().trim().min(5, "Enter the address (shown only to the tenant who pays).").max(160),
  bedrooms: z.coerce.number().int().min(0).max(10),
  bathrooms: z.coerce.number().int().min(1).max(10),
  annualRentNgn: z.coerce.number({ error: "Enter the yearly rent." }).int().min(50_000, "Enter the yearly rent in naira.").max(500_000_000),
  description: z.string().trim().min(30, "Tell tenants a little about it (at least a sentence or two).").max(800),
  photo: z.enum(PHOTO_KEYS as [string, ...string[]]),
  agentName: z.string().trim().max(60).optional(),
  agentFeeNgn: z.coerce.number().int().min(0).max(100_000_000).optional(),
  agentPayoutMethod: z.enum(["lightning", "test_wallet"]).optional(),
  agentLightningAddress: z.string().trim().max(200).optional(),
});

export async function addUnit(_: FormState, form: FormData): Promise<FormState> {
  const parsed = unitSchema.safeParse(Object.fromEntries([...form.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return fieldErrors(parsed.error.issues);
  const d = parsed.data;
  const fee = d.agentFeeNgn ?? 0;
  let agentAddress: string | null = null;
  if (fee > 0) {
    if (!d.agentName) return { errors: { agentName: "Name the agent who gets the fee." } };
    if (fee > d.annualRentNgn * 0.2) return { errors: { agentFeeNgn: "Agent fees above 20% of a year's rent aren't allowed on Kodi." } };
    if ((d.agentPayoutMethod ?? "lightning") === "lightning") {
      const a = lnAddress.safeParse(d.agentLightningAddress ?? "");
      if (!a.success) return { errors: { agentLightningAddress: a.error.issues[0].message } };
      agentAddress = a.data;
    } else if (network() === "mainnet") return { errors: { agentLightningAddress: "Enter the agent's Lightning address." } };
  }
  let code = "";
  const res = await wrap(async () => {
    const l = await requireLandlord();
    for (let i = 0; i < 5 && !code; i++) {
      const c = newCode("KD", 5);
      const u = await createUnit({
        code: c,
        landlordId: l.id,
        title: d.title,
        bedrooms: d.bedrooms,
        bathrooms: d.bathrooms,
        area: d.area,
        address: d.address,
        description: d.description,
        photo: d.photo,
        annualRentNgn: d.annualRentNgn,
        agentName: fee > 0 ? d.agentName! : null,
        agentFeeNgn: fee,
        agentPayoutMethod: fee > 0 ? d.agentPayoutMethod ?? "lightning" : null,
        agentLightningAddress: agentAddress,
      }).catch((e) => (/units_code_key/.test(String(e)) ? null : Promise.reject(e)));
      if (u) {
        code = u.code;
        await addAudit({ role: "landlord", actor: l.email, action: "unit_listed", unitId: u.id, details: u.code });
      }
    }
    return "Listed.";
  });
  if (res?.error) return res;
  redirect(`/landlord?listed=${code}`);
}

export async function toggleListed(unitId: string) {
  const l = await requireLandlord().catch(() => null);
  const u = l && (await getUnit(unitId));
  if (!l || !u || u.landlordId !== l.id) return;
  await updateUnit(u.id, { listed: !u.listed });
  await addAudit({ role: "landlord", actor: l.email, action: u.listed ? "unit_unlisted" : "unit_relisted", unitId: u.id, details: u.code });
  revalidatePath("/landlord");
}

// ----------------------------------------------------------------- deposits

async function ownDeposit(depositId: string) {
  const l = await requireLandlord();
  const d = await getDeposit(depositId);
  const u = d && (await getUnit(d.unitId));
  if (!d || !u || u.landlordId !== l.id) throw new KodiError("That deposit isn't on one of your homes.");
  return { l, d };
}

export async function handedOver(depositId: string): Promise<FormState> {
  return wrap(async () => {
    const { l, d } = await ownDeposit(depositId);
    await landlordConfirmHandover(d, l);
    return "Noted. The tenant has been asked to confirm.";
  });
}

/** Confirms (the vault opens) or declines a tenant's request to open a Rent Vault for one of your homes. */
export async function answerVaultRequest(vaultId: string, approve: boolean): Promise<FormState> {
  return wrap(async () => {
    const l = await requireLandlord();
    const vault = await getVault(vaultId);
    if (!vault) throw new KodiError("That request isn't on one of your homes.");
    await decideVaultRequest(vault, l.id, approve);
    return approve ? `Confirmed. ${vault.tenantName}'s Rent Vault is open.` : "Declined. The vault can't take money.";
  });
}

export async function landlordDispute(depositId: string, _: FormState, form: FormData): Promise<FormState> {
  const reason = String(form.get("reason") ?? "").trim();
  if (reason.length < 10) return { error: "Tell the arbiter what happened (at least a sentence)." };
  return wrap(async () => {
    const { l, d } = await ownDeposit(depositId);
    await openDispute(d, { role: "landlord", actor: l.email }, reason.slice(0, 500));
    return "Sent to Kodi's arbiter. The money stays in escrow until they decide.";
  });
}
