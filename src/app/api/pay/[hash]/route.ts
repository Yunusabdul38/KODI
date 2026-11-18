import { NextResponse } from "next/server";
import { getDepositByPaymentHash, getVaultPaymentByHash } from "@/lib/data";
import { settleDeposit } from "@/lib/deposits";
import { settleVaultPayment } from "@/lib/vaults";

/**
 * Polled by the payment panel. Always re-checks with the wallet, so the
 * answer can't be faked by the browser. Says only paid / pending / expired.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/pay/[hash]">) {
  const { hash } = await ctx.params;
  if (!/^[0-9a-f]{64}$/.test(hash)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const d = await getDepositByPaymentHash(hash);
    if (d) {
      const s = await settleDeposit(d);
      const status = s.status === "awaiting_payment" ? "pending" : s.status === "expired" ? "expired" : "paid";
      return NextResponse.json({ status }, { headers: { "Cache-Control": "no-store" } });
    }
    const p = await getVaultPaymentByHash(hash);
    if (p) {
      const s = await settleVaultPayment(p);
      return NextResponse.json({ status: s.status }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (e) {
    console.error("pay status", e);
    return NextResponse.json({ status: "pending" }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
