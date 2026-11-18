import "server-only";
import { addSnapshot, ledgerTotalSats } from "./data";
import { processDueRefunds } from "./deposits";
import { lightning } from "./lightning";
import { sendEmail } from "./notify";
import { payDueVaults } from "./vaults";

/** Compares the wallet with the ledger and records it; alerts the admin on a shortfall. */
export async function takeReserveSnapshot() {
  const [wallet, ledger] = await Promise.all([lightning().getBalanceSats(), ledgerTotalSats()]);
  const snap = await addSnapshot({ walletBalanceSats: wallet, ledgerTotalSats: ledger, differenceSats: wallet - ledger });
  if (snap.differenceSats < 0) {
    await sendEmail(
      [process.env.ADMIN_EMAIL],
      "Kodi reserve alert: wallet is below the ledger",
      `Wallet ${wallet} sats, ledger ${ledger} sats, gap ${snap.differenceSats} sats at ${snap.takenAt}.`,
    );
  }
  return snap;
}

/** The daily run: due vaults, refunds past their window, then a reserves snapshot. */
export async function runDailyJobs() {
  const vaultsPaid = await payDueVaults();
  const refunds = await processDueRefunds();
  const snapshot = await takeReserveSnapshot();
  return { vaultsPaid: vaultsPaid.length, refunds: refunds.length, snapshot };
}
