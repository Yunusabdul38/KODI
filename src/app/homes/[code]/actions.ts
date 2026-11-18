"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { clientIp } from "@/lib/client-ip";
import { getUnitByCode } from "@/lib/data";
import { KodiError, startDeposit } from "@/lib/deposits";
import { network } from "@/lib/lightning";
import { rateLimit } from "@/lib/rate-limit";

export type DepositFormState = {
  error?: string;
  locked?: boolean;
  errors?: Partial<Record<string, string>>;
};

const schema = z.object({
  tenantName: z.string().trim().min(2, "Enter your full name.").max(80),
  tenantEmail: z.string().trim().pipe(z.email("Enter your email address.").max(200)),
  tenantPhone: z.string().trim().regex(/^\+?[\d\s()-]{7,20}$/, "Enter a phone number."),
  months: z.coerce.number().int().min(1).max(12, "At most 12 months: the Lagos Tenancy Law cap."),
  moveInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the move-in date."),
  refundMethod: z.enum(["test_wallet", "lightning"]),
  refundAddress: z.string().trim().max(200).optional(),
  agree: z.literal("on", { error: "Please confirm you understand when the money moves." }),
});

export async function payDeposit(code: string, _: DepositFormState, form: FormData): Promise<DepositFormState> {
  const ip = clientIp(await headers());
  if (!rateLimit(`deposit:${ip}`, 12, 15 * 60_000)) return { error: "Too many attempts. Please wait 15 minutes." };

  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return { errors };
  }
  const d = parsed.data;
  if (d.refundMethod === "test_wallet" && network() === "mainnet") {
    return { errors: { refundAddress: "Enter the Lightning address a refund should go to." } };
  }
  if (d.refundMethod === "lightning" && !/^[a-z0-9._+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(d.refundAddress ?? "")) {
    return { errors: { refundAddress: "Enter a Lightning address, like name@wallet.com." } };
  }
  const unit = await getUnitByCode(code);
  if (!unit) return { error: "This home no longer exists." };

  let token: string;
  try {
    const r = await startDeposit({
      unit,
      tenantName: d.tenantName,
      tenantEmail: d.tenantEmail,
      tenantPhone: d.tenantPhone,
      months: d.months,
      moveInDate: d.moveInDate,
      refundMethod: d.refundMethod,
      refundAddress: d.refundMethod === "lightning" ? d.refundAddress!.toLowerCase() : null,
    });
    token = r.token;
  } catch (e) {
    if (e instanceof KodiError) return { error: e.message, locked: /already has a deposit/.test(e.message) };
    console.error("startDeposit", e);
    return { error: "We couldn't create the payment request. Nothing was charged; please try again." };
  }
  redirect(`/d/${token}`);
}
