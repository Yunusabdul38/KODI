import "server-only";
import { createHash } from "node:crypto";
import { LightningAddress } from "@getalby/lightning-tools/lnurl";
import { addAudit, createPayout, getPayoutByKey, markPayout } from "./data";
import { invoiceMatchesNetwork, lightning, network, testWalletUrl, type TestWallet } from "./lightning";
import { testWalletInvoice } from "./lightning/nwc";
import { assertPublicHttps, assertPublicLightningAddress } from "./public-host";
import type { Payout, PayoutMethod } from "./types";

/**
 * Money out. Every payout is written to the ledger (status pending) before
 * anything is paid; the database refuses a payout larger than what is still
 * held for that deposit or vault. Then:
 *   1. ask the destination for an invoice for exactly that amount;
 *   2. pay it, and record the payment proof.
 * A payout whose result is unclear stays pending, its amount reserved, and
 * shows on the admin page: freeing it wrongly could pay someone twice.
 */

const TEST_WALLET_LABEL: Record<TestWallet, string> = {
  landlord: "Landlord test wallet (Mutinynet)",
  agent: "Agent test wallet (Mutinynet)",
  tenant: "Tenant test wallet (Mutinynet)",
};

const sha256Hex = (hex: string) => createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");

/** A Lightning address issues the invoice (LNURL-pay); only public https hosts are contacted. */
async function addressInvoice(address: string, satoshi: number, comment: string) {
  await assertPublicLightningAddress(address);
  const ln = new LightningAddress(address, { proxy: false });
  await ln.fetch();
  await assertPublicHttps(ln.lnurlpData?.callback ?? "");
  const inv = await ln.requestInvoice({ satoshi, comment });
  return { paymentRequest: inv.paymentRequest, paymentHash: inv.paymentHash, satoshi: inv.satoshi };
}

export interface PayoutRequest {
  depositId?: string;
  vaultId?: string;
  recipient: Payout["recipient"];
  method: PayoutMethod;
  /** Lightning address, or which test wallet. */
  address: string | null;
  amountSats: number;
  ngnPerBtc: number;
  idempotencyKey: string;
  memo: string;
}

const testWalletFor = (recipient: Payout["recipient"]): TestWallet => recipient;

/** Writes the payout to the ledger (or returns the one already written for this key). */
export async function recordPayout(r: PayoutRequest): Promise<Payout> {
  const existing = await getPayoutByKey(r.idempotencyKey);
  if (existing) return existing;
  if (r.method === "test_wallet" && network() === "mainnet") throw new Error("Test wallets exist only on the test network.");
  if (r.method === "lightning" && !r.address) throw new Error("No Lightning address to pay.");
  return createPayout({
    depositId: r.depositId ?? null,
    vaultId: r.vaultId ?? null,
    recipient: r.recipient,
    method: r.method,
    destination: r.method === "test_wallet" ? TEST_WALLET_LABEL[testWalletFor(r.recipient)] : r.address!,
    amountSats: r.amountSats,
    ngnPerBtc: r.ngnPerBtc,
    idempotencyKey: r.idempotencyKey,
  });
}

/** Pays a pending payout. Returns it with its final (or still pending) status. */
export async function sendPayout(p: Payout, memo: string): Promise<Payout> {
  if (p.status !== "pending") return p;
  const audit = (action: string, details?: string) =>
    addAudit({
      role: "system",
      action,
      depositId: p.depositId,
      vaultId: p.vaultId,
      details: details ?? `${p.recipient}: ${p.amountSats} sats to ${p.destination}`,
    });

  // Step 1: an invoice for exactly this amount. Nothing is paid yet, so a
  // failure here is safe to mark failed (the amount is free again).
  let invoice = "demo";
  let invoiceHash: string | null = null;
  try {
    if (network() !== "demo") {
      const inv =
        p.method === "test_wallet"
          ? await testWalletInvoice(mustTestWallet(p.recipient), p.amountSats, memo)
          : await addressInvoice(p.destination, p.amountSats, memo);
      if (inv.satoshi !== p.amountSats) throw new Error("The destination returned a different amount");
      if (!invoiceMatchesNetwork(inv.paymentRequest)) throw new Error("The destination is on a different network");
      invoice = inv.paymentRequest;
      invoiceHash = inv.paymentHash;
    }
  } catch (err) {
    console.error("payout invoice failed", p.id, err);
    const failed = await markPayout(p.id, { status: "failed", error: (err as Error).message.slice(0, 200) });
    await audit("payout_failed", `${p.recipient}: couldn't get an invoice from ${p.destination}`);
    return failed ?? p;
  }

  // Step 2: pay. An error can mean "failed" or "paid but the reply was
  // lost", so ask the wallet before deciding.
  let proof: { preimage: string; paymentHash: string | null } | null = null;
  try {
    proof = await lightning().payInvoice(invoice);
  } catch (err) {
    console.error("payout unconfirmed", p.id, err);
    if (invoiceHash) {
      const state = await lightning().lookupInvoice(invoiceHash).catch(() => null);
      if (state?.paid && state.preimage) proof = { preimage: state.preimage, paymentHash: invoiceHash };
    }
  }
  if (!proof) {
    await audit("payout_unconfirmed");
    return p;
  }
  const sent = await markPayout(p.id, {
    status: "sent",
    sentAt: new Date().toISOString(),
    preimage: proof.preimage,
    paymentHash: proof.paymentHash ?? invoiceHash ?? sha256Hex(proof.preimage),
  });
  await audit("payout_sent");
  return sent ?? p;
}

function mustTestWallet(recipient: Payout["recipient"]) {
  const url = testWalletUrl(testWalletFor(recipient));
  if (!url) throw new Error(`The ${recipient} test wallet isn't set up. Run \`npm run wallet\`.`);
  return url;
}

/** Admin: a pending payout the wallet now confirms was paid, or that clearly never left. */
export async function resolvePendingPayout(p: Payout, outcome: "sent" | "failed") {
  if (p.status !== "pending") return p;
  const r = await markPayout(p.id, outcome === "sent" ? { status: "sent", sentAt: new Date().toISOString() } : { status: "failed", error: "Marked failed by the arbiter after checking the wallet" });
  await addAudit({ role: "admin", action: `payout_marked_${outcome}`, depositId: p.depositId, vaultId: p.vaultId, details: `${p.recipient}: ${p.amountSats} sats` });
  return r ?? p;
}
