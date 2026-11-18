"use client";

import { KeyRoundIcon, ScaleIcon, Undo2Icon } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { keepValues } from "@/components/form-controls";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { askRefund, confirmMoveIn, tenantDispute, type ActState } from "./actions";

function Msg({ s }: { s: ActState }) {
  if (!s) return null;
  return (
    <p role={s.error ? "alert" : "status"} className={`mt-3 rounded-xl px-3.5 py-2.5 text-[0.92rem] ${s.error ? "bg-clay-soft" : "bg-green-soft"}`}>
      {s.error ?? s.ok}
    </p>
  );
}

export function MoveInForm({ token, landlordName }: { token: string; landlordName: string }) {
  const [s, action, pending] = useActionState(confirmMoveIn.bind(null, token), undefined);
  return (
    <form action={action} onSubmit={keepValues(action)}>
      <label className="flex items-start gap-3 text-[0.95rem]">
        <Checkbox name="confirm" value="on" className="mt-0.5" />
        <span>I have the keys and can get into the home. Pay {landlordName} and the agent now.</span>
      </label>
      <button type="submit" disabled={pending} className="btn btn-primary mt-4 w-full">
        <KeyRoundIcon className="size-4" aria-hidden="true" />
        {pending ? "Paying the landlord…" : "I've moved in"}
      </button>
      <Msg s={s} />
    </form>
  );
}

export function RefundButton({ token, allowed, moveInLabel }: { token: string; allowed: boolean; moveInLabel: string }) {
  const [s, setS] = useState<ActState>(undefined);
  const [pending, start] = useTransition();
  const [sure, setSure] = useState(false);
  return (
    <div>
      {!sure ? (
        <button type="button" disabled={!allowed} className="btn btn-ghost w-full" onClick={() => setSure(true)}>
          <Undo2Icon className="size-4" aria-hidden="true" />
          The keys never came: refund me
        </button>
      ) : (
        <div className="rounded-2xl border border-line-2 p-4">
          <p className="text-[0.95rem]">
            Ask for your deposit back? The landlord gets 48 hours to object. If they don&apos;t, the refund is paid
            automatically.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={pending} className="btn btn-primary flex-1" onClick={() => start(async () => setS(await askRefund(token)))}>
              {pending ? "Asking…" : "Yes, ask for a refund"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setSure(false)}>Cancel</button>
          </div>
        </div>
      )}
      {!allowed && <p className="mt-2 text-center text-[0.85rem] text-ink-3">Available after the move-in date ({moveInLabel}).</p>}
      <Msg s={s} />
    </div>
  );
}

export function DisputeForm({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [s, action, pending] = useActionState(tenantDispute.bind(null, token), undefined);
  if (!open) {
    return (
      <button type="button" className="mx-auto mt-1 flex items-center gap-1.5 text-[0.9rem] text-ink-3 underline-offset-4 hover:text-ink hover:underline" onClick={() => setOpen(true)}>
        <ScaleIcon className="size-4" aria-hidden="true" /> Something else is wrong? Ask the arbiter
      </button>
    );
  }
  return (
    <form action={action} onSubmit={keepValues(action)} className="rounded-2xl border border-line-2 p-4">
      <label htmlFor="reason" className="text-[0.95rem] font-medium">What happened?</label>
      <Textarea id="reason" name="reason" className="mt-2 min-h-24" maxLength={500} placeholder="e.g. The flat is not the one in the listing: it has one bedroom, not two." />
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-secondary flex-1">{pending ? "Sending…" : "Send to the arbiter"}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <Msg s={s} />
    </form>
  );
}
