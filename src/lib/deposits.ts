import "server-only";
import { createHash } from "node:crypto";
import { lagosDate, now, REFUND_WINDOW_MS, today } from "./clock";
import {
  activeDepositForUnit,
  addAudit,
  createDeposit,
  createDispute,
  decideDispute as saveDecision,
  getLandlord,
  getUnit,
  listAwaitingDeposits,
  listDeposits,
  listPendingVaultPayments,
  moveDeposit,
  openDisputeFor,
} from "./data";
import { lightning } from "./lightning";
import { appUrl, sendEmail } from "./notify";
import { recordPayout, sendPayout } from "./payouts";
import { ngnPricing } from "./rates";
import { newToken, tokenHash } from "./secrets";
import { formatNaira, formatSats } from "./format";
import { KodiError, UnitLockedError } from "./errors";
import type { Deposit, Dispute, Landlord, PayoutMethod, Unit } from "./types";
import { settleVaultPayment } from "./vaults";

export { KodiError };

const INVOICE_MINUTES = 15;
const MAX_MONTHS = 12; // Lagos State Tenancy Law 2011, s.4: at most a year's rent from a new tenant

const preimageMatches = (preimage: string, hash: string) =>
  createHash("sha256").update(Buffer.from(preimage, "hex")).digest("hex") === hash;

// ---------------------------------------------------------------------------
// Quote and pay
// ---------------------------------------------------------------------------

export interface Quote {
  months: number;
  rentNgn: number;
  agentFeeNgn: number;
  totalNgn: number;
  rentSats: number;
  agentSats: number;
  amountSats: number;
  ngnPerBtc: number;
  scale: number;
  live: boolean;
}

export async function quote(unit: Unit, months: number): Promise<Quote> {
  const m = Math.min(MAX_MONTHS, Math.max(1, Math.round(months)));
  const p = await ngnPricing();
  const rentNgn = Math.round((unit.annualRentNgn * m) / 12);
  const agentFeeNgn = unit.agentFeeNgn;
  const toSats = (ngn: number) => (ngn > 0 ? Math.max(1, Math.ceil((ngn / p.ngnPerBtc) * 1e8)) : 0);
  const rentSats = toSats(rentNgn);
  const agentSats = toSats(agentFeeNgn);
  return {
    months: m,
    rentNgn,
    agentFeeNgn,
    totalNgn: rentNgn + agentFeeNgn,
    rentSats,
    agentSats,
    amountSats: rentSats + agentSats,
    ngnPerBtc: p.ngnPerBtc,
    scale: p.scale,
    live: p.live,
  };
}

/** Why a unit can't take a deposit right now, or null. */
export async function cannotTakeDeposit(unit: Unit, landlord: Landlord | null) {
  if (!landlord?.verified) return "This landlord hasn't been verified by Kodi yet.";
  if (!unit.listed) return "This unit isn't listed right now.";
  if (unit.frozen) return "Kodi has paused this listing while a report is checked.";
  if (landlord.payoutMethod === "lightning" && !landlord.lightningAddress) return "The landlord hasn't set where to be paid yet.";
  return null;
}

export async function startDeposit(input: {
  unit: Unit;
  tenantName: string;
  tenantEmail: string;
  tenantPhone: string;
  months: number;
  moveInDate: string;
  refundMethod: PayoutMethod;
  refundAddress: string | null;
}): Promise<{ deposit: Deposit; token: string }> {
  const { unit } = input;
  const landlord = await getLandlord(unit.landlordId);
  const why = await cannotTakeDeposit(unit, landlord);
  if (why) throw new KodiError(why);

  const blocked = async () => {
    await addAudit({ role: "tenant", actor: input.tenantEmail, action: "second_deposit_blocked", unitId: unit.id, details: unit.code });
    return new UnitLockedError();
  };
  if (await activeDepositForUnit(unit.id)) throw await blocked();

  const t = await today();
  const latest = lagosDate(new Date(Date.parse(t) + 120 * 86_400_000));
  if (input.moveInDate < t) throw new KodiError("The move-in date can't be in the past.");
  if (input.moveInDate > latest) throw new KodiError("Choose a move-in date within the next four months.");

  const q = await quote(unit, input.months);
  const inv = await lightning().createInvoice(
    q.amountSats,
    `Kodi Safe Deposit: ${unit.code}, ${q.months} months' rent${q.agentFeeNgn ? " + agent fee" : ""}`,
  );
  const token = newToken();
  try {
    const deposit = await createDeposit({
      unitId: unit.id,
      tenantName: input.tenantName,
      tenantEmail: input.tenantEmail.toLowerCase(),
      tenantPhone: input.tenantPhone,
      tokenHash: tokenHash(token),
      months: q.months,
      rentNgn: q.rentNgn,
      agentFeeNgn: q.agentFeeNgn,
      ngnPerBtc: q.ngnPerBtc,
      amountSats: q.amountSats,
      rentSats: q.rentSats,
      agentSats: q.agentSats,
      moveInDate: input.moveInDate,
      paymentHash: inv.paymentHash,
      paymentRequest: inv.paymentRequest,
      expiresAt: new Date(Math.min(Date.parse(inv.expiresAt), Date.now() + INVOICE_MINUTES * 60_000)).toISOString(),
      refundMethod: input.refundMethod,
      refundAddress: input.refundMethod === "lightning" ? input.refundAddress : null,
    });
    await addAudit({ role: "tenant", actor: deposit.tenantEmail, action: "deposit_started", unitId: unit.id, depositId: deposit.id, details: formatSats(q.amountSats) });
    return { deposit, token };
  } catch (e) {
    // Two tenants pressed Pay at the same moment: the database let only one through.
    if (/deposits_one_active_per_unit/.test((e as Error).message)) throw await blocked();
    throw e;
  }
}

/**
 * Re-checks a deposit's invoice with the wallet. This is the only path that
 * marks a deposit paid, so nothing a browser sends can fake a payment.
 */
export async function settleDeposit(d: Deposit): Promise<Deposit> {
  if (d.status !== "awaiting_payment") return d;
  const state = await lightning().lookupInvoice(d.paymentHash);
  if (state.paid) {
    if (state.preimage && !preimageMatches(state.preimage, d.paymentHash)) {
      throw new Error(`Preimage does not match payment hash for ${d.id}`);
    }
    const held = await moveDeposit(d.id, ["awaiting_payment"], {
      status: "held",
      paidAt: new Date().toISOString(),
      preimage: state.preimage,
    });
    if (held) {
      await addAudit({ role: "system", action: "deposit_held", unitId: d.unitId, depositId: d.id, details: formatSats(d.amountSats) });
      await afterHeld(held).catch((e) => console.error("afterHeld", e));
      return held;
    }
  } else if (state.expired || Date.parse(d.expiresAt) < Date.now() - 60_000) {
    const expired = await moveDeposit(d.id, ["awaiting_payment"], { status: "expired", closedAt: new Date().toISOString() });
    if (expired) await addAudit({ role: "system", action: "deposit_expired", unitId: d.unitId, depositId: d.id });
    return expired ?? d;
  }
  return d;
}

async function afterHeld(d: Deposit) {
  const unit = await getUnit(d.unitId);
  const landlord = unit && (await getLandlord(unit.landlordId));
  if (!unit || !landlord) return;
  const total = formatNaira(d.rentNgn + d.agentFeeNgn);
  await sendEmail(
    [landlord.email],
    `Safe Deposit held for ${unit.title}, ${unit.area} (${unit.code})`,
    `${d.tenantName} paid ${total} into Kodi escrow for ${unit.code}. The unit is now locked: nobody else can pay for it on Kodi.\n` +
      `Hand over the keys on or after ${d.moveInDate}. When ${d.tenantName.split(" ")[0]} confirms they've moved in, you are paid automatically.\n\n` +
      `${appUrl()}/landlord`,
  );
}

const sweep = globalThis as unknown as { __kodiSweep?: { at: number; running?: Promise<void> } };

/**
 * Settles every open invoice (deposits and vault top-ups) with the wallet,
 * at most every few seconds, so a payment made from another device shows up
 * for everyone. Runs whenever anyone has Kodi open.
 */
export function settleOpenPayments(minIntervalMs = 4000): Promise<void> {
  const s = (sweep.__kodiSweep ??= { at: 0 });
  if (s.running) return s.running;
  if (Date.now() - s.at < minIntervalMs) return Promise.resolve();
  s.at = Date.now();
  s.running = (async () => {
    for (const d of await listAwaitingDeposits()) await settleDeposit(d).catch((e) => console.error("settle", d.id, e));
    for (const p of await listPendingVaultPayments()) await settleVaultPayment(p).catch((e) => console.error("settle", p.id, e));
  })().finally(() => {
    s.running = undefined;
  });
  return s.running;
}

// ---------------------------------------------------------------------------
// After payment: move in, refund, dispute
// ---------------------------------------------------------------------------

/** The tenant has the keys (or the arbiter decided so): pay landlord and agent their shares. */
export async function releaseDeposit(d: Deposit, by: { role: "tenant" | "admin"; actor: string | null; note?: string }) {
  const from = by.role === "tenant" ? ["held", "refund_requested"] : ["held", "refund_requested", "disputed"];
  const t = await now();
  const released = await moveDeposit(d.id, from, { status: "released", movedInAt: t.toISOString(), closedAt: t.toISOString() });
  if (!released) {
    if (d.status === "disputed") throw new KodiError("This deposit is with the arbiter, who will decide.");
    throw new KodiError("This deposit has already been settled.");
  }
  await addAudit({
    role: by.role,
    actor: by.actor,
    action: by.role === "tenant" ? "tenant_moved_in" : "arbiter_released",
    unitId: d.unitId,
    depositId: d.id,
    details: by.note ?? null,
  });
  await payShares(released);
  return released;
}

/** Writes and sends the landlord's and agent's payouts for a released deposit. */
async function payShares(d: Deposit) {
  const unit = (await getUnit(d.unitId))!;
  const landlord = (await getLandlord(unit.landlordId))!;
  const memo = `Kodi: ${unit.code} rent from ${d.tenantName}`;
  const landlordPayout = await recordPayout({
    depositId: d.id,
    recipient: "landlord",
    method: landlord.payoutMethod,
    address: landlord.lightningAddress,
    amountSats: d.rentSats,
    ngnPerBtc: d.ngnPerBtc,
    idempotencyKey: `${d.id}:landlord`,
    memo,
  });
  const agentPayout =
    d.agentSats > 0
      ? await recordPayout({
          depositId: d.id,
          recipient: "agent",
          method: unit.agentPayoutMethod ?? "lightning",
          address: unit.agentLightningAddress,
          amountSats: d.agentSats,
          ngnPerBtc: d.ngnPerBtc,
          idempotencyKey: `${d.id}:agent`,
          memo: `Kodi: ${unit.code} agent fee`,
        })
      : null;
  const results = [await sendPayout(landlordPayout, memo)];
  if (agentPayout) results.push(await sendPayout(agentPayout, `Kodi: ${unit.code} agent fee`));
  await sendEmail(
    [landlord.email],
    `You've been paid for ${unit.code}`,
    `${d.tenantName} confirmed they've moved in to ${unit.title}, ${unit.area}. Kodi paid ${formatSats(d.rentSats)} ` +
      `(${formatNaira(d.rentNgn)}) to ${landlordPayout.destination}.\n\n${appUrl()}/landlord`,
  ).catch(() => {});
  return results;
}

export async function landlordConfirmHandover(d: Deposit, landlord: Landlord) {
  if (d.status !== "held") throw new KodiError("This deposit isn't waiting for a handover.");
  const updated = await moveDeposit(d.id, ["held"], { landlordConfirmedAt: (await now()).toISOString() });
  if (!updated) throw new KodiError("This deposit has changed. Refresh the page.");
  await addAudit({ role: "landlord", actor: landlord.email, action: "landlord_handed_over", unitId: d.unitId, depositId: d.id });
  await sendEmail(
    [d.tenantEmail],
    "Your landlord says the keys are handed over",
    `If you have the keys, confirm on your Kodi deposit page so the landlord is paid. If you don't, don't confirm: request a refund after your move-in date instead.`,
  ).catch(() => {});
  return updated;
}

/** True once the agreed move-in date has passed (Lagos time). */
export async function moveInDatePassed(d: Deposit) {
  return (await today()) > d.moveInDate;
}

export async function requestRefund(d: Deposit) {
  if (d.status !== "held") throw new KodiError("A refund can only be requested while the deposit is held.");
  if (!(await moveInDatePassed(d))) {
    throw new KodiError(`You can ask for a refund once the move-in date (${d.moveInDate}) has passed without the keys.`);
  }
  const updated = await moveDeposit(d.id, ["held"], { status: "refund_requested", refundRequestedAt: (await now()).toISOString() });
  if (!updated) throw new KodiError("This deposit has changed. Refresh the page.");
  await addAudit({ role: "tenant", actor: d.tenantEmail, action: "refund_requested", unitId: d.unitId, depositId: d.id });
  const unit = await getUnit(d.unitId);
  const landlord = unit && (await getLandlord(unit.landlordId));
  await sendEmail(
    [landlord?.email],
    `Refund requested for ${unit?.code}`,
    `${d.tenantName} says they haven't received the keys and asked for their deposit back. ` +
      `If you did hand over the keys, object within 48 hours and Kodi's arbiter will decide. Otherwise the refund is paid automatically.\n\n${appUrl()}/landlord`,
  ).catch(() => {});
  return updated;
}

/** When the landlord's 48 hours to object run out. */
export const refundDueAt = (d: Deposit) =>
  d.refundRequestedAt ? new Date(Date.parse(d.refundRequestedAt) + REFUND_WINDOW_MS) : null;

export async function openDispute(d: Deposit, by: { role: "tenant" | "landlord"; actor: string }, reason: string) {
  if (by.role === "landlord" && d.status === "held" && !(await moveInDatePassed(d))) {
    throw new KodiError("You can open a dispute once the move-in date has passed.");
  }
  if (by.role === "landlord" && d.status === "refund_requested") {
    const due = refundDueAt(d);
    if (due && (await now()) > due) throw new KodiError("The 48 hours to object have passed.");
  }
  const disputed = await moveDeposit(d.id, ["held", "refund_requested"], { status: "disputed" });
  if (!disputed) throw new KodiError("This deposit can't be disputed now.");
  await createDispute({ depositId: d.id, raisedBy: by.role, reason });
  await addAudit({
    role: by.role,
    actor: by.actor,
    action: by.role === "landlord" && d.status === "refund_requested" ? "landlord_objected" : "dispute_opened",
    unitId: d.unitId,
    depositId: d.id,
    details: reason,
  });
  await sendEmail([process.env.ADMIN_EMAIL], `Kodi dispute: ${d.id}`, `${by.role} opened a dispute: ${reason}\n\n${appUrl()}/admin`).catch(() => {});
  return disputed;
}

async function refundDeposit(d: Deposit, by: { role: "system" | "admin"; actor: string | null; note?: string }) {
  const t = await now();
  const refunded = await moveDeposit(d.id, ["refund_requested", "disputed"], { status: "refunded", closedAt: t.toISOString() });
  if (!refunded) throw new KodiError("This deposit has already been settled.");
  await addAudit({
    role: by.role,
    actor: by.actor,
    action: by.role === "admin" ? "arbiter_refunded" : "refund_window_passed",
    unitId: d.unitId,
    depositId: d.id,
    details: by.note ?? null,
  });
  const memo = `Kodi refund: deposit ${d.id}`;
  const p = await recordPayout({
    depositId: d.id,
    recipient: "tenant",
    method: d.refundMethod ?? "test_wallet",
    address: d.refundAddress,
    amountSats: d.amountSats,
    ngnPerBtc: d.ngnPerBtc,
    idempotencyKey: `${d.id}:refund`,
    memo,
  });
  const sent = await sendPayout(p, memo);
  await sendEmail([d.tenantEmail], "Your Kodi deposit has been refunded", `Kodi sent ${formatSats(d.amountSats)} back to ${p.destination}.`).catch(() => {});
  return { deposit: refunded, payout: sent };
}

/** The arbiter's decision on an open dispute. */
export async function decide(dispute: Dispute, decision: "release" | "refund", note: string) {
  const { getDeposit } = await import("./data");
  const d = await getDeposit(dispute.depositId);
  if (!d) throw new KodiError("Deposit not found.");
  const decided = await saveDecision(dispute.id, { decision, decisionNote: note || null, decidedAt: (await now()).toISOString() });
  if (!decided) throw new KodiError("This dispute was already decided.");
  if (decision === "release") await releaseDeposit(d, { role: "admin", actor: "arbiter", note });
  else await refundDeposit(d, { role: "admin", actor: "arbiter", note });
  return decided;
}

/** Pays refunds whose 48-hour objection window has passed. Run daily, and whenever the deposit is viewed. */
export async function processDueRefunds() {
  const t = await now();
  const done: string[] = [];
  for (const d of await listDeposits(["refund_requested"])) {
    const due = refundDueAt(d);
    if (due && t >= due && !(await openDisputeFor(d.id))) {
      await refundDeposit(d, { role: "system", actor: null }).then(() => done.push(d.id), (e) => console.error("refund", d.id, e));
    }
  }
  return done;
}

export async function maybeRefundNow(d: Deposit) {
  const due = refundDueAt(d);
  if (d.status === "refund_requested" && due && (await now()) >= due) {
    return (await refundDeposit(d, { role: "system", actor: null })).deposit;
  }
  return d;
}

