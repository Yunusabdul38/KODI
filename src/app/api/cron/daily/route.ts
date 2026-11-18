import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/secrets";
import { runDailyJobs } from "@/lib/jobs";

/**
 * Daily jobs (Vercel cron, or any scheduler): pay Rent Vaults that are due,
 * pay refunds whose 48-hour objection window has passed, and take a
 * reserve-check snapshot. Requires `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runDailyJobs());
}
