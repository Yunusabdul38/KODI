"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { ErrorFocus, FormField, invalid, keepValues, MoneyInput } from "@/components/form-controls";
import { ReviewerCard } from "@/components/reviewer-card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PasswordInput } from "@/components/ui/password-input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { AREAS } from "@/lib/areas";
import { PHOTOS, type PhotoKey } from "@/lib/photos";
import { addUnit, handedOver, landlordDispute, register, savePayout, signIn, type FormState } from "./actions";

function Msg({ s }: { s: FormState }) {
  if (!s?.error && !s?.ok) return null;
  return (
    <p role={s.error ? "alert" : "status"} className={`rounded-xl px-3.5 py-2.5 text-[0.92rem] ${s.error ? "bg-clay-soft" : "bg-green-soft"}`}>
      {s.error ?? s.ok}
    </p>
  );
}

const choice =
  "flex cursor-pointer items-start gap-3 rounded-xl border border-line-2 bg-white p-3.5 has-[[data-state=checked]]:border-forest has-[[data-state=checked]]:ring-1 has-[[data-state=checked]]:ring-forest";

export function SignInForm({ demo, reviewer }: { demo: boolean; reviewer?: { email: string; password: string } }) {
  const [s, action, pending] = useActionState(signIn, undefined);
  const [email, setEmail] = useState(demo ? "tolu@adeyemi.test" : "");
  const [password, setPassword] = useState(demo ? "kodi-demo" : "");
  return (
    <form action={action} onSubmit={keepValues(action)} className="space-y-5">
      <FormField label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormField>
      <FormField label="Password" htmlFor="password">
        <PasswordInput id="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </FormField>
      <Msg s={s} />
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      {demo && <p className="text-[0.85rem] text-ink-3">Sample accounts: tolu@adeyemi.test or chinedu@okafor.test (aisha@bellohomes.test is still under review). Password: kodi-demo.</p>}
      {reviewer && (
        <ReviewerCard
          rows={[{ label: "Email", value: reviewer.email }, { label: "Password", value: reviewer.password }]}
          onFill={() => {
            setEmail(reviewer.email);
            setPassword(reviewer.password);
          }}
        >
          <p>Sign in as an existing verified landlord who already has homes listed and a rental paid out.</p>
          <p>
            Or <Link href="/landlord/register" className="font-semibold underline underline-offset-4">register your own landlord account</Link>, then
            verify it yourself on the <Link href="/admin" className="font-semibold underline underline-offset-4">arbiter page</Link>.
          </p>
        </ReviewerCard>
      )}
    </form>
  );
}

function PayoutChoice({ testWallets, error, defaultMethod, defaultAddress, who = "your" }: { testWallets: boolean; error?: string; defaultMethod?: string; defaultAddress?: string | null; who?: string }) {
  const [method, setMethod] = useState(defaultMethod ?? (testWallets ? "test_wallet" : "lightning"));
  return (
    <fieldset>
      <legend className="text-[0.95rem] font-medium">Where should Kodi pay {who} rent?</legend>
      <RadioGroup name="payoutMethod" value={method} onValueChange={setMethod} className="mt-2.5 gap-2">
        <label className={choice}>
          <RadioGroupItem value="lightning" className="mt-0.5" />
          <span className="w-full">
            <span className="block font-medium">Lightning address</span>
            <span className="block text-[0.88rem] text-ink-3">From Blink, Alby, Strike or any Lightning wallet.</span>
            {method === "lightning" && (
              <Input name="lightningAddress" className="mt-2" placeholder="rent@yourwallet.com" defaultValue={defaultAddress ?? ""} autoCapitalize="none" spellCheck={false} aria-label="Lightning address" {...invalid("lightningAddress", error)} />
            )}
          </span>
        </label>
        {testWallets && (
          <label className={choice}>
            <RadioGroupItem value="test_wallet" className="mt-0.5" />
            <span>
              <span className="block font-medium">Landlord test wallet (Mutinynet)</span>
              <span className="block text-[0.88rem] text-ink-3">Test network only: Kodi&apos;s stand-in landlord wallet, so you can watch payouts arrive.</span>
            </span>
          </label>
        )}
      </RadioGroup>
      {error && <p id="lightningAddress-error" className="mt-1.5 text-[0.88rem] text-clay">{error}</p>}
      <p className="mt-2 text-[0.85rem] text-ink-3">Naira bank payouts are coming.</p>
    </fieldset>
  );
}

export function RegisterForm({ testWallets }: { testWallets: boolean }) {
  const [s, action, pending] = useActionState(register, undefined);
  const e = s?.errors ?? {};
  const [idType, setIdType] = useState("NIN");
  return (
    <form action={action} onSubmit={keepValues(action)} className="space-y-10" noValidate>
      <ErrorFocus state={s} />
      <fieldset className="space-y-5">
        <legend className="text-[1.3rem] font-bold tracking-[-0.02em]">You</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Name tenants will see" htmlFor="name" error={e.name} hint="Your name, or your company's.">
            <Input id="name" name="name" autoComplete="organization" {...invalid("name", e.name)} />
          </FormField>
          <FormField label="Contact person" htmlFor="contactName" error={e.contactName}>
            <Input id="contactName" name="contactName" autoComplete="name" {...invalid("contactName", e.contactName)} />
          </FormField>
          <FormField label="Phone" htmlFor="phone" error={e.phone} hint="Kodi calls to confirm before verifying you.">
            <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+234" {...invalid("phone", e.phone)} />
          </FormField>
          <FormField label="Email" htmlFor="email" error={e.email}>
            <Input id="email" name="email" type="email" autoComplete="email" {...invalid("email", e.email)} />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-line pt-8">
        <legend className="text-[1.3rem] font-bold tracking-[-0.02em]">Proof of identity</legend>
        <p className="-mt-2 text-[0.95rem] text-ink-2">Kodi checks this before your homes are listed. Tenants never see it.</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="ID type" htmlFor="idType">
            <NativeSelect id="idType" name="idType" value={idType} onChange={(ev) => setIdType(ev.target.value)}>
              <option value="NIN">National ID (NIN)</option>
              <option value="CAC">Company (CAC number)</option>
              <option value="Passport">International passport</option>
              <option value="Driver's licence">Driver&apos;s licence</option>
            </NativeSelect>
          </FormField>
          <FormField label="ID number" htmlFor="idNumber" error={e.idNumber}>
            <Input id="idNumber" name="idNumber" {...invalid("idNumber", e.idNumber)} />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-line pt-8">
        <legend className="text-[1.3rem] font-bold tracking-[-0.02em]">Sign-in and payouts</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Create a password" htmlFor="password" error={e.password} hint="At least 10 characters.">
            <PasswordInput id="password" name="password" autoComplete="new-password" {...invalid("password", e.password)} />
          </FormField>
          <FormField label="Confirm password" htmlFor="passwordConfirm" error={e.passwordConfirm}>
            <PasswordInput id="passwordConfirm" name="passwordConfirm" autoComplete="new-password" {...invalid("passwordConfirm", e.passwordConfirm)} />
          </FormField>
        </div>
        <PayoutChoice testWallets={testWallets} error={e.lightningAddress} />
      </fieldset>

      <div className="border-t border-line pt-8">
        <label className="flex items-start gap-3 text-[0.95rem]">
          <Checkbox name="owns" value="on" className="mt-0.5" {...invalid("owns", e.owns)} />
          <span>I own these properties or am authorised by the owner to let them.</span>
        </label>
        {e.owns && <p id="owns-error" className="mt-1.5 text-[0.88rem] text-clay">{e.owns}</p>}
      </div>
      <div className="space-y-4">
        <Msg s={s} />
        <button type="submit" disabled={pending} className="btn btn-primary w-full sm:w-auto">{pending ? "Sending…" : "Register for review"}</button>
      </div>
    </form>
  );
}

export function PayoutForm({ testWallets, method, address }: { testWallets: boolean; method: string; address: string | null }) {
  const [s, action, pending] = useActionState(savePayout, undefined);
  return (
    <form action={action} onSubmit={keepValues(action)} className="space-y-4">
      <PayoutChoice testWallets={testWallets} error={s?.errors?.lightningAddress} defaultMethod={method} defaultAddress={address} who="your" />
      <Msg s={s} />
      <button className="btn btn-ghost" disabled={pending}>{pending ? "Saving…" : "Save payout details"}</button>
    </form>
  );
}

export function UnitForm({ testWallets }: { testWallets: boolean }) {
  const [s, action, pending] = useActionState(addUnit, undefined);
  const e = s?.errors ?? {};
  const [rent, setRent] = useState("");
  const [fee, setFee] = useState("");
  const [photo, setPhoto] = useState<PhotoKey>("living-room");
  const [agentPay, setAgentPay] = useState(testWallets ? "test_wallet" : "lightning");
  return (
    <form action={action} onSubmit={keepValues(action)} className="space-y-10" noValidate>
      <ErrorFocus state={s} />
      <fieldset className="space-y-5">
        <legend className="text-[1.3rem] font-bold tracking-[-0.02em]">The home</legend>
        <FormField label="What is it?" htmlFor="title" error={e.title}>
          <Input id="title" name="title" placeholder="e.g. 2-bedroom flat" {...invalid("title", e.title)} />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-3">
          <FormField label="Area" htmlFor="area" error={e.area}>
            <NativeSelect id="area" name="area" defaultValue="">
              <option value="" disabled>Choose…</option>
              {AREAS.map((a) => <option key={a}>{a}</option>)}
            </NativeSelect>
          </FormField>
          <FormField label="Bedrooms" htmlFor="bedrooms">
            <NativeSelect id="bedrooms" name="bedrooms" defaultValue="2">
              {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 0 ? "Studio / room" : n}</option>)}
            </NativeSelect>
          </FormField>
          <FormField label="Bathrooms" htmlFor="bathrooms">
            <NativeSelect id="bathrooms" name="bathrooms" defaultValue="1">
              {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
            </NativeSelect>
          </FormField>
        </div>
        <FormField label="Street address" htmlFor="address" error={e.address} hint="Shown only to the tenant whose deposit is held.">
          <Input id="address" name="address" {...invalid("address", e.address)} />
        </FormField>
        <FormField label="Description" htmlFor="description" error={e.description}>
          <Textarea id="description" name="description" className="min-h-28" maxLength={800} placeholder="Power, water, security, what's nearby…" {...invalid("description", e.description)} />
        </FormField>
        <fieldset>
          <legend className="text-[0.95rem] font-medium">Photo</legend>
          <p className="text-[0.85rem] text-ink-3">Pick the closest for now; uploading your own photos is coming.</p>
          <input type="hidden" name="photo" value={photo} />
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {(Object.keys(PHOTOS) as PhotoKey[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setPhoto(k)}
                aria-pressed={photo === k}
                aria-label={PHOTOS[k].alt}
                className={`relative aspect-square overflow-hidden rounded-xl ring-offset-2 ${photo === k ? "ring-2 ring-forest" : "opacity-80 hover:opacity-100"}`}
              >
                <Image src={PHOTOS[k].src} alt="" fill sizes="120px" className="object-cover" />
              </button>
            ))}
          </div>
        </fieldset>
      </fieldset>

      <fieldset className="space-y-5 border-t border-line pt-8">
        <legend className="text-[1.3rem] font-bold tracking-[-0.02em]">Rent and agent</legend>
        <FormField label="Rent per year" htmlFor="annualRentNgn" error={e.annualRentNgn} hint="Tenants can pay up to 12 months of it into escrow.">
          <MoneyInput id="annualRentNgn" name="annualRentNgn" symbol="₦" currency="NGN" value={rent} onValueChange={setRent} placeholder="2,400,000" />
        </FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Agent's name (optional)" htmlFor="agentName" error={e.agentName}>
            <Input id="agentName" name="agentName" {...invalid("agentName", e.agentName)} />
          </FormField>
          <FormField label="Agent fee (optional)" htmlFor="agentFeeNgn" error={e.agentFeeNgn} hint="Paid to the agent from escrow, with the rent.">
            <MoneyInput id="agentFeeNgn" name="agentFeeNgn" symbol="₦" currency="NGN" value={fee} onValueChange={setFee} placeholder="0" />
          </FormField>
        </div>
        {Number(fee) > 0 && (
          <fieldset>
            <legend className="text-[0.95rem] font-medium">Pay the agent to</legend>
            <RadioGroup name="agentPayoutMethod" value={agentPay} onValueChange={setAgentPay} className="mt-2.5 gap-2">
              <label className={choice}>
                <RadioGroupItem value="lightning" className="mt-0.5" />
                <span className="w-full">
                  <span className="block font-medium">Agent&apos;s Lightning address</span>
                  {agentPay === "lightning" && (
                    <Input name="agentLightningAddress" className="mt-2" placeholder="agent@wallet.com" autoCapitalize="none" spellCheck={false} aria-label="Agent's Lightning address" {...invalid("agentLightningAddress", e.agentLightningAddress)} />
                  )}
                </span>
              </label>
              {testWallets && (
                <label className={choice}>
                  <RadioGroupItem value="test_wallet" className="mt-0.5" />
                  <span className="block font-medium">Agent test wallet (Mutinynet)</span>
                </label>
              )}
            </RadioGroup>
            {e.agentLightningAddress && <p id="agentLightningAddress-error" className="mt-1.5 text-[0.88rem] text-clay">{e.agentLightningAddress}</p>}
          </fieldset>
        )}
      </fieldset>
      <div className="space-y-4">
        <Msg s={s} />
        <button type="submit" disabled={pending} className="btn btn-primary w-full sm:w-auto">{pending ? "Listing…" : "List this home"}</button>
      </div>
    </form>
  );
}

export function HandoverButton({ depositId }: { depositId: string }) {
  const [s, setS] = useState<FormState>(undefined);
  const [pending, start] = useTransition();
  return (
    <div>
      <button type="button" className="btn btn-ghost !min-h-10 !py-1.5 text-[0.9rem]" disabled={pending} onClick={() => start(async () => setS(await handedOver(depositId)))}>
        {pending ? "Saving…" : "I've handed over the keys"}
      </button>
      {s && <div className="mt-2"><Msg s={s} /></div>}
    </div>
  );
}

export function LandlordDisputeForm({ depositId, label }: { depositId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [s, action, pending] = useActionState(landlordDispute.bind(null, depositId), undefined);
  if (!open) {
    return <button type="button" className="btn btn-ghost !min-h-10 !py-1.5 text-[0.9rem]" onClick={() => setOpen(true)}>{label}</button>;
  }
  return (
    <form action={action} onSubmit={keepValues(action)} className="w-full space-y-3 rounded-2xl border border-line-2 bg-white p-4">
      <label htmlFor={`reason-${depositId}`} className="text-[0.95rem] font-medium">What happened?</label>
      <Textarea id={`reason-${depositId}`} name="reason" className="min-h-20" maxLength={500} placeholder="e.g. I handed over the keys on 3 Dec; the caretaker was there. The tenant has moved in." />
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-secondary flex-1">{pending ? "Sending…" : "Send to the arbiter"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <Msg s={s} />
    </form>
  );
}
