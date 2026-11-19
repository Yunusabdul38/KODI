import "server-only";
import { createHash } from "node:crypto";
import { now, today } from "./clock";
import {
  addAudit,
  closeVault,
  createVault,
  declineOtherVaultRequests,
  decideVault,
  createVaultPayment,
  getLandlord,
  getUnit,
  getVault,
  listDueVaults,
  listVaultPayments,
  listVaultsForUnits,
  settleVaultPayment as saveSettlement,
  vaultSavedNgn,
  vaultSavedSats,
} from "./data";
import { KodiError } from "./errors";
import { formatDay, formatNaira, formatSats } from "./format";
import { lightning } from "./lightning";
import { appUrl, sendEmail } from "./notify";
import { recordPayout, sendPayout } from "./payouts";
import { ngnPricing } from "./rates";
import { hashSecret, landlordViewToken, newCode, newToken, tokenHash } from "./secrets";
import type { Deposit, PayoutMethod, Unit, Vault, VaultPayment } from "./types";

/**
 * Rent Vault: a sitting tenant saves toward next year's rent in small
 * Lightning payments. The landlord watches progress on a read-only link, and
 * on the due date Kodi pays the landlord what was saved. The tenant can't
 * spend it on anything else, which gives the landlord the security of a lump
 * sum without the tenant needing one.
 */

const INVOICE_MINUTES = 15;

/**
 * Opens a vault. From the tenant's own paid-out Kodi deposit it opens at once;
 * otherwise it waits for the landlord to confirm the tenant lives there. A home
 * has at most one open vault (the vaults_one_active_per_unit index).
 */
export async function startVault(input: {
  unit: Unit;
  tenantName: string;
  tenantEmail: string;
  targetNgn: number;
  dueDate: string;
  schedule: "weekly" | "monthly";
  pin: string;
  deposit?: Deposit | null;
}): Promise<{ vault: Vault; token: string; landlordToken: string }> {
  const fromDeposit = Boolean(input.deposit);
  if (input.deposit && (input.deposit.unitId !== input.unit.id || input.deposit.status !== "released")) {
    throw new KodiError("A Rent Vault can be opened from a deposit only once the landlord has been paid.");
  }
  if (!/^\d{6}$/.test(input.pin)) throw new KodiError("Choose a 6-digit PIN.");
  const open = (await listVaultsForUnits([input.unit.id])).filter((v) => v.status === "active" || v.status === "pending");
  if (open.some((v) => v.status === "active")) throw new KodiError(VAULT_TAKEN);
  const email = input.tenantEmail.toLowerCase();
  if (!fromDeposit && open.some((v) => v.tenantEmail === email)) {
    throw new KodiError("You've already asked to open a Rent Vault for this home. Your landlord will confirm it.");
  }
  const t = await today();
  if (input.dueDate <= t) throw new KodiError("The due date must be in the future.");
  if (Date.parse(input.dueDate) - Date.parse(t) > 548 * 86_400_000) throw new KodiError("Choose a due date within 18 months.");
  if (input.targetNgn < 10_000) throw new KodiError("Set a target of at least ₦10,000.");
  if (input.targetNgn > input.unit.annualRentNgn * 2) throw new KodiError("The target can't be more than two years' rent for this unit.");
  const token = newToken();
  const landlordToken = landlordViewToken(token);
  let vault: Vault;
  try {
    vault = await createVault({
      code: newCode("RV", 6),
      unitId: input.unit.id,
      tenantName: input.tenantName,
      tenantEmail: email,
      tokenHash: tokenHash(token),
      landlordTokenHash: tokenHash(landlordToken),
      targetNgn: Math.round(input.targetNgn),
      dueDate: input.dueDate,
      schedule: input.schedule,
      status: fromDeposit ? "active" : "pending",
      depositId: input.deposit?.id ?? null,
      pinHash: hashSecret(input.pin),
      approvedAt: fromDeposit ? new Date().toISOString() : null,
    });
  } catch (e) {
    if (/vaults_one_active_per_unit/.test((e as Error).message)) throw new KodiError(VAULT_TAKEN);
    throw e;
  }
  const details = formatNaira(vault.targetNgn);
  if (fromDeposit) {
    await declineOtherVaultRequests(vault.unitId, vault.id);
    await addAudit({ role: "tenant", actor: email, action: "vault_created", unitId: vault.unitId, vaultId: vault.id, details });
  } else {
    await addAudit({ role: "tenant", actor: email, action: "vault_requested", unitId: vault.unitId, vaultId: vault.id, details });
    const landlord = await getLandlord(input.unit.landlordId);
    if (landlord) {
      await sendEmail(
        [landlord.email],
        `Rent Vault request for ${input.unit.title}, ${input.unit.area}`,
        `${vault.tenantName} wants to save for next year's rent at ${input.unit.code}. Confirm or decline it on your dashboard:\n\n${appUrl()}/landlord`,
      ).catch(() => {});
    }
  }
  return { vault, token, landlordToken };
}

const VAULT_TAKEN = "This home already has a Rent Vault. If it's yours, open it from your private link.";

/** The landlord confirms the tenant lives in the home (the vault opens) or declines the request. */
export async function decideVaultRequest(vault: Vault, landlordId: string, approve: boolean) {
  const unit = await getUnit(vault.unitId);
  if (!unit || unit.landlordId !== landlordId) throw new KodiError("This request isn't for one of your homes.");
  if (vault.status !== "pending") throw new KodiError("This request was already answered.");
  let decided: Vault | null;
  try {
    decided = await decideVault(vault.id, approve ? "active" : "declined", approve ? new Date().toISOString() : null);
  } catch (e) {
    if (/vaults_one_active_per_unit/.test((e as Error).message)) {
      throw new KodiError("This home already has an open Rent Vault, so this request can only be declined.");
    }
    throw e;
  }
  if (!decided) throw new KodiError("This request was already answered.");
  if (approve) await declineOtherVaultRequests(unit.id, vault.id);
  await addAudit({ role: "landlord", actor: landlordId, action: approve ? "vault_approved" : "vault_declined", unitId: unit.id, vaultId: vault.id });
  await sendEmail(
    [vault.tenantEmail],
    approve ? "Your Rent Vault is open" : "Your Rent Vault request was declined",
    approve
      ? `Your landlord confirmed your Rent Vault for ${unit.title}, ${unit.area}. You can start saving now from your private link.`
      : `Your landlord didn't confirm the Rent Vault for ${unit.title}, ${unit.area}, so it can't take money. Ask them about it.`,
  ).catch(() => {});
  return decided;
}

export interface VaultView {
  vault: Vault;
  unit: Unit;
  savedNgn: number;
  savedSats: number;
  paidOutSats: number;
  progress: number;
  /** Suggested amount per week or month to reach the target on time. */
  perPeriodNgn: number;
  periodsLeft: number;
  onTrack: boolean;
  payments: VaultPayment[];
}

export async function vaultView(vault: Vault): Promise<VaultView> {
  const [unit, savedNgn, sats, payments, t] = await Promise.all([
    getUnit(vault.unitId),
    vaultSavedNgn(vault.id),
    vaultSavedSats(vault.id),
    listVaultPayments(vault.id),
    today(),
  ]);
  const days = Math.max(0, (Date.parse(vault.dueDate) - Date.parse(t)) / 86_400_000);
  const periodsLeft = Math.max(1, Math.ceil(vault.schedule === "weekly" ? days / 7 : days / 30.44));
  const remaining = Math.max(0, vault.targetNgn - savedNgn);
  const perPeriodNgn = Math.ceil(remaining / periodsLeft / 100) * 100;
  const totalDays = Math.max(1, (Date.parse(vault.dueDate) - Date.parse(vault.createdAt.slice(0, 10))) / 86_400_000);
  const elapsed = Math.min(1, Math.max(0, 1 - days / totalDays));
  const progress = Math.min(1, savedNgn / vault.targetNgn);
  return {
    vault,
    unit: unit!,
    savedNgn,
    savedSats: sats.paidIn - sats.paidOut,
    paidOutSats: sats.paidOut,
    progress,
    perPeriodNgn,
    periodsLeft,
    // On track when savings keep pace with the time gone, with a little slack.
    onTrack: progress + 0.05 >= elapsed,
    payments: payments.filter((p) => p.status === "paid"),
  };
}

/** A Lightning invoice to add to a vault. Anyone with the family link can top up. */
export async function topUp(vault: Vault, amountNgn: number, payerName: string | null) {
  if (vault.status === "pending") throw new KodiError("This vault opens once the landlord confirms it.");
  if (vault.status !== "active") throw new KodiError("This vault is closed.");
  if (!Number.isFinite(amountNgn) || amountNgn < 500) throw new KodiError("The smallest top-up is ₦500.");
  if (amountNgn > vault.targetNgn) throw new KodiError("That is more than the whole target.");
  const p = await ngnPricing();
  const amountSats = Math.max(1, Math.ceil((amountNgn / p.ngnPerBtc) * 1e8));
  const inv = await lightning().createInvoice(amountSats, `Kodi Rent Vault ${vault.code}: ${formatNaira(amountNgn)}`);
  return createVaultPayment({
    vaultId: vault.id,
    payerName: payerName?.trim() || null,
    amountSats,
    amountNgn: Math.round(amountNgn),
    ngnPerBtc: p.ngnPerBtc,
    paymentHash: inv.paymentHash,
    paymentRequest: inv.paymentRequest,
    expiresAt: new Date(Math.min(Date.parse(inv.expiresAt), Date.now() + INVOICE_MINUTES * 60_000)).toISOString(),
  });
}

/** Re-checks a top-up with the wallet: the only path that credits a vault. */
export async function settleVaultPayment(p: VaultPayment): Promise<VaultPayment> {
  if (p.status !== "pending") return p;
  const state = await lightning().lookupInvoice(p.paymentHash);
  if (state.paid) {
    if (state.preimage && createHash("sha256").update(Buffer.from(state.preimage, "hex")).digest("hex") !== p.paymentHash) {
      throw new Error(`Preimage does not match payment hash for ${p.id}`);
    }
    const paid = await saveSettlement(p.id, { status: "paid", paidAt: new Date().toISOString(), preimage: state.preimage });
    if (paid) {
      await addAudit({ role: "system", action: "vault_topped_up", vaultId: p.vaultId, details: `${formatNaira(p.amountNgn)}${p.payerName ? ` from ${p.payerName}` : ""}` });
      const vault = await getVault(p.vaultId);
      if (vault) {
        await sendEmail(
          [vault.tenantEmail],
          `Rent Vault: ${formatNaira(p.amountNgn)} added`,
          `${p.payerName ?? "You"} added ${formatNaira(p.amountNgn)} (${formatSats(p.amountSats)}) to your Rent Vault ${vault.code}.`,
        ).catch(() => {});
      }
      return paid;
    }
  } else if (state.expired || Date.parse(p.expiresAt) < Date.now() - 60_000) {
    return (await saveSettlement(p.id, { status: "expired" })) ?? p;
  }
  return p;
}

/** On the due date the vault pays the landlord everything saved. */
export async function payVault(vault: Vault, by: { role: "system" | "admin" }) {
  if (vault.status !== "active") return null;
  const unit = (await getUnit(vault.unitId))!;
  const landlord = (await getLandlord(unit.landlordId))!;
  const { paidIn, paidOut } = await vaultSavedSats(vault.id);
  const held = paidIn - paidOut;
  const t = await now();
  const closed = await closeVault(vault.id, "paid", t.toISOString());
  if (!closed) return null;
  await addAudit({ role: by.role, action: "vault_due", unitId: unit.id, vaultId: vault.id, details: held ? formatSats(held) : "nothing saved" });
  if (held <= 0) return null;
  const memo = `Kodi Rent Vault ${vault.code}: rent from ${vault.tenantName}`;
  const p = await recordPayout({
    vaultId: vault.id,
    recipient: "landlord",
    method: landlord.payoutMethod,
    address: landlord.lightningAddress,
    amountSats: held,
    ngnPerBtc: (await ngnPricing()).ngnPerBtc,
    idempotencyKey: `${vault.id}:landlord`,
    memo,
  });
  const sent = await sendPayout(p, memo);
  const saved = await vaultSavedNgn(vault.id);
  await sendEmail(
    [landlord.email, vault.tenantEmail],
    `Rent Vault ${vault.code} paid to the landlord`,
    `On ${formatDay(vault.dueDate)} Kodi paid ${formatNaira(saved)} saved by ${vault.tenantName} (${formatSats(held)}) to ${p.destination}.\n\n${appUrl()}`,
  ).catch(() => {});
  return sent;
}

/** Pays every vault whose due date has come. Run daily. */
export async function payDueVaults() {
  const done: string[] = [];
  for (const v of await listDueVaults(await today())) {
    await payVault(v, { role: "system" }).then(() => done.push(v.id), (e) => console.error("vault", v.id, e));
  }
  return done;
}

/** Arbiter only: the tenancy ended early with notice, so the savings go back to the tenant. */
export async function returnVault(vault: Vault, method: PayoutMethod, address: string | null, note: string) {
  if (vault.status !== "active") throw new KodiError("This vault is already closed.");
  const { paidIn, paidOut } = await vaultSavedSats(vault.id);
  const held = paidIn - paidOut;
  const closed = await closeVault(vault.id, "returned", (await now()).toISOString());
  if (!closed) throw new KodiError("This vault is already closed.");
  await addAudit({ role: "admin", actor: "arbiter", action: "vault_returned", vaultId: vault.id, unitId: vault.unitId, details: note || null });
  if (held <= 0) return null;
  const memo = `Kodi Rent Vault ${vault.code}: savings returned`;
  const p = await recordPayout({
    vaultId: vault.id,
    recipient: "tenant",
    method,
    address,
    amountSats: held,
    ngnPerBtc: (await ngnPricing()).ngnPerBtc,
    idempotencyKey: `${vault.id}:return`,
    memo,
  });
  return sendPayout(p, memo);
}
