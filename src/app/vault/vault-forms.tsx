"use client";

import { useActionState, useState } from "react";
import { ErrorFocus, FormField, invalid, keepValues, MoneyInput } from "@/components/form-controls";
import { InvoicePanel, type Network } from "@/components/invoice-panel";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatNaira } from "@/lib/format";
import { createTopUp, createVault, enterVaultPin, type PinState, type TopUpState, type VaultFormState } from "./actions";

export interface VaultFromDeposit {
  token: string;
  unitCode: string;
  tenantName: string;
  tenantEmail: string;
}

export function StartVaultForm({ unitCode, minDate, maxDate, fromDeposit }: { unitCode: string; minDate: string; maxDate: string; fromDeposit?: VaultFromDeposit }) {
  const [state, action, pending] = useActionState<VaultFormState, FormData>(createVault, {});
  const e = state.errors ?? {};
  const [target, setTarget] = useState("");
  const [schedule, setSchedule] = useState("monthly");
  return (
    <form action={action} onSubmit={keepValues(action)} className="space-y-5" noValidate>
      <ErrorFocus state={state} />
      {fromDeposit && <input type="hidden" name="deposit" value={fromDeposit.token} />}
      <FormField label="Your home's Kodi code" htmlFor="unitCode" error={e.unitCode} hint={fromDeposit ? "The home you rented through Kodi." : "Your landlord can find it on their Kodi dashboard."}>
        <Input id="unitCode" name="unitCode" defaultValue={fromDeposit?.unitCode ?? unitCode} readOnly={Boolean(fromDeposit)} placeholder="KD-XXXXX" className="code-chip uppercase" autoCapitalize="characters" spellCheck={false} {...invalid("unitCode", e.unitCode)} />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Your name" htmlFor="tenantName" error={e.tenantName}>
          <Input id="tenantName" name="tenantName" autoComplete="name" defaultValue={fromDeposit?.tenantName} readOnly={Boolean(fromDeposit)} {...invalid("tenantName", e.tenantName)} />
        </FormField>
        <FormField label="Email" htmlFor="tenantEmail" error={e.tenantEmail}>
          <Input id="tenantEmail" name="tenantEmail" type="email" autoComplete="email" defaultValue={fromDeposit?.tenantEmail} readOnly={Boolean(fromDeposit)} {...invalid("tenantEmail", e.tenantEmail)} />
        </FormField>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Next year's rent" htmlFor="targetNgn" error={e.targetNgn}>
          <MoneyInput id="targetNgn" name="targetNgn" symbol="₦" currency="NGN" value={target} onValueChange={setTarget} placeholder="2,400,000" />
        </FormField>
        <FormField label="Due date" htmlFor="dueDate" error={e.dueDate} hint="When the landlord expects it.">
          <Input id="dueDate" name="dueDate" type="date" min={minDate} max={maxDate} {...invalid("dueDate", e.dueDate)} />
        </FormField>
      </div>
      <fieldset>
        <legend className="text-[0.95rem] font-medium">I&apos;ll save</legend>
        <RadioGroup name="schedule" value={schedule} onValueChange={setSchedule} className="mt-2.5 grid grid-cols-2 gap-2">
          {["weekly", "monthly"].map((s) => (
            <label key={s} className="flex cursor-pointer items-center gap-3 rounded-xl border border-line-2 bg-white p-3.5 capitalize has-[[data-state=checked]]:border-forest has-[[data-state=checked]]:ring-1 has-[[data-state=checked]]:ring-forest">
              <RadioGroupItem value={s} /> {s}
            </label>
          ))}
        </RadioGroup>
      </fieldset>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Choose a 6-digit PIN" htmlFor="pin" error={e.pin} hint="It opens your private vault page.">
          <PasswordInput id="pin" name="pin" inputMode="numeric" maxLength={6} autoComplete="new-password" {...invalid("pin", e.pin)} />
        </FormField>
        <FormField label="Confirm the PIN" htmlFor="pinConfirm" error={e.pinConfirm}>
          <PasswordInput id="pinConfirm" name="pinConfirm" inputMode="numeric" maxLength={6} autoComplete="new-password" {...invalid("pinConfirm", e.pinConfirm)} />
        </FormField>
      </div>
      <p className="rounded-2xl bg-paper-2 px-4 py-3 text-[0.9rem] text-ink-2">
        {fromDeposit
          ? "You rented this home through Kodi, so your vault opens straight away."
          : "Your landlord confirms you live in this home before the vault can take money. A home can have only one Rent Vault."}
      </p>
      {state.error && <p role="alert" className="rounded-2xl bg-clay-soft px-4 py-3 text-[0.95rem]">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">{pending ? "Opening your vault…" : fromDeposit ? "Open my Rent Vault" : "Ask to open my Rent Vault"}</button>
      <p className="text-center text-[0.85rem] text-ink-3">Free to open. Money you add is paid to your landlord on the due date.</p>
    </form>
  );
}

export function TopUpForm({
  token,
  code,
  presets,
  network,
  askName = false,
}: {
  token?: string;
  code?: string;
  presets: number[];
  network: Network;
  askName?: boolean;
}) {
  const [state, action, pending] = useActionState<TopUpState, FormData>(createTopUp.bind(null, { token, code }), {});
  const [amount, setAmount] = useState(String(presets[0] ?? ""));
  const [reset, setReset] = useState(0);
  if (state.invoice && reset === 0) {
    const inv = state.invoice;
    return (
      <div>
        <InvoicePanel hash={inv.hash} pr={inv.pr} expiresAt={inv.expiresAt} sats={inv.sats} label={formatNaira(inv.amountNgn)} network={network} />
        <button type="button" className="mt-4 w-full text-center text-[0.9rem] text-ink-3 underline-offset-4 hover:underline" onClick={() => setReset(1)}>
          Add a different amount
        </button>
      </div>
    );
  }
  return (
    <form action={(f) => { setReset(0); action(f); }} className="space-y-4">
      <ErrorFocus state={state} />
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setAmount(String(p))}
            className={`rounded-full border px-4 py-2 text-[0.95rem] font-semibold transition-colors ${Number(amount) === p ? "border-forest bg-forest text-forest-ink" : "border-line-2 bg-white hover:border-ink-3"}`}
          >
            {formatNaira(p)}
          </button>
        ))}
      </div>
      <FormField label="Amount" htmlFor="amount">
        <MoneyInput id="amount" name="amount" symbol="₦" currency="NGN" value={amount} onValueChange={setAmount} placeholder="0" />
      </FormField>
      {askName && (
        <FormField label="Your name" htmlFor="payerName" hint="Shown to the tenant, e.g. “Auntie Bisi (London)”.">
          <Input id="payerName" name="payerName" maxLength={60} />
        </FormField>
      )}
      {state.error && <p role="alert" className="rounded-2xl bg-clay-soft px-4 py-3 text-[0.95rem]">{state.error}</p>}
      <button type="submit" disabled={pending || !Number(amount)} className="btn btn-primary w-full">
        {pending ? "Creating payment request…" : `Add ${Number(amount) ? formatNaira(Number(amount)) : "money"}`}
      </button>
    </form>
  );
}

export function VaultPinForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<PinState, FormData>(enterVaultPin.bind(null, token), undefined);
  return (
    <form action={action} className="space-y-4">
      <FormField label="Your 6-digit PIN" htmlFor="pin">
        <PasswordInput id="pin" name="pin" inputMode="numeric" maxLength={6} autoComplete="current-password" required autoFocus />
      </FormField>
      {state?.error && <p role="alert" className="rounded-2xl bg-clay-soft px-4 py-3 text-[0.95rem]">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary w-full">{pending ? "Checking…" : "Open my vault"}</button>
    </form>
  );
}
