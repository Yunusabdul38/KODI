import { NextResponse } from "next/server";
import { network } from "@/lib/lightning";
import { markDemoInvoicePaid } from "@/lib/lightning/demo";

/** Demo mode only (the simulated wallet): pretend the invoice was paid. */
export async function POST(_req: Request, ctx: RouteContext<"/api/pay/[hash]/simulate">) {
  if (network() !== "demo") return NextResponse.json({ error: "Not available with a real wallet" }, { status: 404 });
  const { hash } = await ctx.params;
  return markDemoInvoicePaid(hash) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}
