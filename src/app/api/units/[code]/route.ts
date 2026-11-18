import { connection, NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { getLandlord, getUnitByCode, unitStatus } from "@/lib/data";

/**
 * Public unit check: is this unit real, is its landlord verified, and is a
 * deposit already held on it? No personal details, no amounts.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/units/[code]">) {
  await connection();
  const { code } = await ctx.params;
  const unit = await getUnitByCode(code);
  if (!unit) return NextResponse.json({ found: false }, { status: 404 });
  const landlord = await getLandlord(unit.landlordId);
  return NextResponse.json({
    found: true,
    code: unit.code,
    title: unit.title,
    area: unit.area,
    city: unit.city,
    status: await unitStatus(unit, (await now()).toISOString()),
    verifiedLandlord: Boolean(landlord?.verified),
  });
}
