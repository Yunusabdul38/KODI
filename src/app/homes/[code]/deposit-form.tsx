"use client";

import { LockIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { ErrorFocus, FormField, invalid, keepValues } from "@/components/form-controls";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatInt, formatNaira } from "@/lib/format";
import { payDeposit, type DepositFormState } from "./actions";

export function DepositForm({
  code,
  annualRentNgn,
  agentFeeNgn,
  agentName,
  ngnPerBtc,
  scale,
  minDate,
  maxDate,
  testWallets,
}: {
  code: string;
  annualRentNgn: number;
  agentFeeNgn: number;
  agentName: string | null;
  ngnPerBtc: number;
  scale: number;
  minDate: string;
  maxDate: string;
  testWallets: boolean;
}) {
  const [state, action, pending] = useActionState<DepositFormState, FormData>(payDeposit.bind(null, code), {});
  const e = state.errors ?? {};
  const [months, setMonths] = useState(12);
  const [refund, setRefund] = useState(testWallets ? "test_wallet" : "lightning");
  const rent = Math.round((annualRentNgn * months) / 12);
  const total = rent + agentFeeNgn;
  const toSats = (n: number) => (n > 0 ? Math.max(1, Math.ceil((n / ngnPerBtc) * 1e8)) : 0);
  const sats = toSats(rent) + toSats(agentFeeNgn);

  return (
    <form action={action} onSubmit={keepValues(action)} className="space-y-5" noValidate>
      <ErrorFocus state={state} />

      <FormField label="How many months are you paying for?" htmlFor="months" hint="Lagos law caps rent from a new tenant at one year.">
        <NativeSelect
          id="months"
          name="months"
          value={months}
          onChange={(ev) => setMonths(Number(ev.target.value))}
         
        >
          {[12, 6, 3, 1].map((m) => (
            <option key={m} value={m}>
              {m} {m === 1 ? "month" : "months"}
            </option>
          ))}
        </NativeSelect>
      </FormField>

      <div className="rounded-2xl bg-paper p-4 text-[0.95rem]">
        <div className="flex justify-between py-1">
          <span className="text-ink-2">Rent, {months} {months === 1 ? "month" : "months"}</span>
          <span>{formatNaira(rent)}</span>
        </div>
        {agentFeeNgn > 0 && (
          <div className="flex justify-between py-1">
            <span className="text-ink-2">Agent fee{agentName ? ` (${agentName})` : ""}</span>
            <span>{formatNaira(agentFeeNgn)}</span>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-line-2 pt-3 text-[1.05rem] font-bold">
          <span>Into escrow</span>
          <span>{formatNaira(total)}</span>
        </div>
        <p className="mt-1 text-right text-[0.85rem] text-ink-3">
          ≈ {formatInt(sats)} sats{scale > 1 ? ` (test rate, 1/${formatInt(scale)} of real)` : ""}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Your full name" htmlFor="tenantName" error={e.tenantName}>
          <Input id="tenantName" name="tenantName" autoComplete="name" {...invalid("tenantName", e.tenantName)} />
        </FormField>
        <FormField label="Phone" htmlFor="tenantPhone" error={e.tenantPhone}>
          <Input id="tenantPhone" name="tenantPhone" type="tel" autoComplete="tel" placeholder="+234" {...invalid("tenantPhone", e.tenantPhone)} />
        </FormField>
      </div>
      <FormField label="Email" htmlFor="tenantEmail" error={e.tenantEmail} hint="Your private deposit link is sent here. Never shown publicly.">
        <Input id="tenantEmail" name="tenantEmail" type="email" autoComplete="email" {...invalid("tenantEmail", e.tenantEmail)} />
      </FormField>
      <FormField label="Move-in date" htmlFor="moveInDate" error={e.moveInDate} hint="If you haven't got the keys by then, you can ask for your money back.">
        <Input id="moveInDate" name="moveInDate" type="date" min={minDate} max={maxDate} {...invalid("moveInDate", e.moveInDate)} />
      </FormField>

      <fieldset>
        <legend className="text-[0.95rem] font-medium">If a refund is ever needed, send it to</legend>
        <RadioGroup name="refundMethod" value={refund} onValueChange={setRefund} className="mt-2.5 gap-2">
          {testWallets && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line-2 bg-white p-3.5 has-[[data-state=checked]]:border-forest has-[[data-state=checked]]:ring-1 has-[[data-state=checked]]:ring-forest">
              <RadioGroupItem value="test_wallet" className="mt-0.5" />
              <span>
                <span className="block font-medium">Tenant test wallet</span>
                <span className="block text-[0.88rem] text-ink-3">Test network only: a wallet made by `npm run wallet`.</span>
              </span>
            </label>
          )}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line-2 bg-white p-3.5 has-[[data-state=checked]]:border-forest has-[[data-state=checked]]:ring-1 has-[[data-state=checked]]:ring-forest">
            <RadioGroupItem value="lightning" className="mt-0.5" />
            <span className="w-full">
              <span className="block font-medium">My Lightning address</span>
              {refund === "lightning" && (
                <Input
                  name="refundAddress"
                  className="mt-2"
                  placeholder="you@wallet.com"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-label="Lightning address for refunds"
                  {...invalid("refundAddress", e.refundAddress)}
                />
              )}
            </span>
          </label>
        </RadioGroup>
        {e.refundAddress && <p id="refundAddress-error" className="mt-1.5 text-[0.88rem] text-clay">{e.refundAddress}</p>}
      </fieldset>

      <label className="flex items-start gap-3 text-[0.93rem]">
        <Checkbox name="agree" value="on" className="mt-0.5" {...invalid("agree", e.agree)} />
        <span>
          I understand the money is held by Kodi and paid to the landlord only when I confirm I have the keys, or if
          Kodi&apos;s arbiter decides a dispute.
        </span>
      </label>
      {e.agree && <p id="agree-error" className="-mt-3 text-[0.88rem] text-clay">{e.agree}</p>}

      {state.error && (
        <div role="alert" className={`rounded-2xl px-4 py-3 text-[0.95rem] bg-clay-soft`}>
          {state.locked && <LockIcon className="mr-1.5 inline size-4 text-clay" aria-hidden="true" />}
          {state.error}
        </div>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        <LockIcon className="size-4" aria-hidden="true" />
        {pending ? "Creating payment request…" : `Pay ${formatNaira(total)} into escrow`}
      </button>
      <p className="text-center text-[0.85rem] text-ink-3">The home is reserved for 15 minutes while you pay.</p>
    </form>
  );
}
