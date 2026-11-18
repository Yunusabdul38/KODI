import { connection, NextResponse } from "next/server";
import { latestSnapshots, ledgerTotalSats, totals } from "@/lib/data";

/** Escrow totals and reserve-check snapshots, as JSON. */
export async function GET() {
  await connection();
  const [ledger, t, snaps] = await Promise.all([ledgerTotalSats(), totals(), latestSnapshots(24)]);
  return NextResponse.json({ ledgerTotalSats: ledger, ...t, snapshots: snaps });
}
