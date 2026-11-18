import "server-only";
import { clockOffsetSeconds } from "./data";
import { network } from "./lightning";

/**
 * Kodi's idea of "now". On mainnet it is the real time. On the test network
 * (and with the simulated wallet) an admin can skip ahead, so a reviewer can
 * see a move-in date pass, a 48-hour refund window close, or a Rent Vault fall
 * due without waiting days. Payment timestamps always stay real.
 */
export async function now(): Promise<Date> {
  if (network() === "mainnet") return new Date();
  return new Date(Date.now() + (await clockOffsetSeconds()) * 1000);
}

/** Today's date in Lagos (WAT, UTC+1), as YYYY-MM-DD. */
export function lagosDate(d: Date) {
  return new Date(d.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function today() {
  return lagosDate(await now());
}

/** Seconds the demo clock is ahead of real time (0 on mainnet). */
export async function clockAhead() {
  return network() === "mainnet" ? 0 : clockOffsetSeconds();
}

/** The refund window: a landlord has this long to object before a refund is paid. */
export const REFUND_WINDOW_MS = 48 * 60 * 60 * 1000;
