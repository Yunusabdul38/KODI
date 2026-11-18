import { connection, NextResponse } from "next/server";
import { changeMarker } from "@/lib/data";
import { settleOpenPayments } from "@/lib/deposits";

/**
 * Polled by every open page (see LiveSync). Returns a marker that changes
 * whenever anything a page shows changes, so pages refresh only when needed.
 * Also settles open invoices, so a payment made from another device shows up.
 */
export async function GET() {
  await connection();
  await settleOpenPayments().catch((e) => console.error("settleOpenPayments", e));
  return NextResponse.json({ marker: await changeMarker() }, { headers: { "Cache-Control": "no-store" } });
}
