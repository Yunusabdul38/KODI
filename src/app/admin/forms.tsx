"use client";

import { useActionState, useState, useTransition } from "react";
import { FormField, keepValues } from "@/components/form-controls";
import { ReviewerCard } from "@/components/reviewer-card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Textarea } from "@/components/ui/textarea";
import {
  adminSignIn,
  decideDispute,
  retryPayout,
  returnVaultToTenant,
  runJobsNow,
  skipAhead,
  verifyLandlord,
  type AdminState,
} from "./actions";

function Msg({ s }: { s: AdminState }) {
  if (!s) return null;
  return (
    <p role={s.error ? "alert" : "status"} className={`mt-3 rounded-xl px-3.5 py-2.5 text-[0.92rem] ${s.error ? "bg-clay-soft" : "bg-green-soft"}`}>
      {s.error ?? s.ok}
    </p>
  );
}

export function AdminSignIn({ demo, reviewerPassword }: { demo: boolean; reviewerPassword?: string }) {
  const [s, action, pending] = useActionState(adminSignIn, undefined);
  const [value, setValue] = useState("");
  return (
    <form action={action} onSubmit={keepValues(action)} className="space-y-5">
      <FormField label="Arbiter password" htmlFor="password">
        <PasswordInput id="password" name="password" required autoComplete="current-password" value={value} onChange={(e) => setValue(e.target.value)} />
      </FormField>
      <Msg s={s} />
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      {demo && <p className="text-[0.85rem] text-ink-3">Local default password: kodi-admin</p>}
      {reviewerPassword && (
        <ReviewerCard rows={[{ label: "Password", value: reviewerPassword }]} onFill={() => setValue(reviewerPassword)}>
          <p>This site runs on Mutinynet test coins, so the arbiter password is shared for judging.</p>
          <p>Sign in to verify landlords (including one you register yourself), decide disputes and check payouts.</p>
        </ReviewerCard>
      )}
    </form>
  );
}

export function VerifyLandlordForm({ id }: { id: string }) {
  const [s, action, pending] = useActionState(verifyLandlord.bind(null, id), undefined);
  const [declining, setDeclining] = useState(false);
  return (
    <form action={action} onSubmit={keepValues(action)}>
      {declining && (
        <Textarea name="reason" className="mb-3 min-h-20" maxLength={300} placeholder="e.g. The NIN doesn't match the name. Please check and reply to our email." aria-label="Reason for declining" />
      )}
      <div className="flex flex-wrap gap-2">
        {!declining ? (
          <>
            <button name="decision" value="approve" className="btn btn-primary !min-h-10 !py-1.5 text-[0.9rem]" disabled={pending}>Verify</button>
            <button type="button" className="btn btn-ghost !min-h-10 !py-1.5 text-[0.9rem]" onClick={() => setDeclining(true)}>Decline</button>
          </>
        ) : (
          <>
            <button name="decision" value="decline" className="btn btn-ghost !min-h-10 !border-clay !py-1.5 text-[0.9rem] !text-clay" disabled={pending}>Confirm decline</button>
            <button type="button" className="btn btn-ghost !min-h-10 !py-1.5 text-[0.9rem]" onClick={() => setDeclining(false)}>Cancel</button>
          </>
        )}
      </div>
      <Msg s={s} />
    </form>
  );
}

export function DecideForm({ disputeId }: { disputeId: string }) {
  const [s, action, pending] = useActionState(decideDispute, undefined);
  return (
    <form action={action} onSubmit={keepValues(action)} className="space-y-3">
      <input type="hidden" name="disputeId" value={disputeId} />
      <Textarea name="note" className="min-h-20" maxLength={300} placeholder="Why: both sides see this note, e.g. 'Caretaker confirmed handover by phone on 3 Dec.'" aria-label="Decision note" />
      <div className="flex flex-wrap gap-2">
        <button name="decision" value="release" className="btn btn-primary !min-h-10 !py-1.5 text-[0.9rem]" disabled={pending}>Pay the landlord</button>
        <button name="decision" value="refund" className="btn btn-ghost !min-h-10 !py-1.5 text-[0.9rem]" disabled={pending}>Refund the tenant</button>
      </div>
      <Msg s={s} />
    </form>
  );
}

export function RetryButton({ id }: { id: string }) {
  const [s, setS] = useState<AdminState>(undefined);
  const [pending, start] = useTransition();
  return (
    <span>
      <button type="button" className="font-semibold text-forest underline-offset-4 hover:underline" disabled={pending} onClick={() => start(async () => setS(await retryPayout(id)))}>
        {pending ? "Retrying…" : "Retry"}
      </button>
      {s && <Msg s={s} />}
    </span>
  );
}

export function ReturnVaultForm({ vaultId, testNetwork }: { vaultId: string; testNetwork: boolean }) {
  const [open, setOpen] = useState(false);
  const [s, action, pending] = useActionState(returnVaultToTenant, undefined);
  if (!open) return <button type="button" className="text-[0.88rem] font-semibold text-ink-3 underline-offset-4 hover:text-ink hover:underline" onClick={() => setOpen(true)}>Return to tenant…</button>;
  return (
    <form action={action} onSubmit={keepValues(action)} className="mt-3 space-y-2 rounded-xl border border-line-2 p-3">
      <input type="hidden" name="vaultId" value={vaultId} />
      <Input name="address" placeholder={testNetwork ? "Tenant's Lightning address (blank: tenant test wallet)" : "Tenant's Lightning address"} aria-label="Tenant's Lightning address" />
      <Textarea name="note" className="min-h-16" placeholder="Why, e.g. tenancy ended early with notice" aria-label="Reason" />
      <button className="btn btn-ghost !min-h-10 !py-1.5 text-[0.9rem]" disabled={pending}>Return savings</button>
      <Msg s={s} />
    </form>
  );
}

export function ClockControls() {
  const [s, setS] = useState<AdminState>(undefined);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<AdminState>) => start(async () => setS(await fn()));
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {[1, 2, 7, 30].map((d) => (
          <button key={d} type="button" disabled={pending} className="btn btn-ghost !min-h-10 !py-1.5 text-[0.9rem]" onClick={() => run(() => skipAhead(d))}>
            +{d} {d === 1 ? "day" : "days"}
          </button>
        ))}
        <button type="button" disabled={pending} className="btn btn-ghost !min-h-10 !py-1.5 text-[0.9rem]" onClick={() => run(() => skipAhead(0))}>Reset</button>
        <button type="button" disabled={pending} className="btn btn-primary !min-h-10 !py-1.5 text-[0.9rem]" onClick={() => run(runJobsNow)}>Run daily jobs now</button>
      </div>
      <Msg s={s} />
    </div>
  );
}
