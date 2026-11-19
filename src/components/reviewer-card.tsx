"use client";

import { FlaskConicalIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Test-network sign-in details for hackathon reviewers, with a button that fills the form. */
export function ReviewerCard({ children, rows, onFill }: { children: ReactNode; rows: { label: string; value: string }[]; onFill: () => void }) {
  return (
    <div className="rounded-[20px] border border-amber/30 bg-amber-soft p-5">
      <p className="flex items-center gap-2 text-[0.82rem] font-semibold uppercase tracking-wide text-amber">
        <FlaskConicalIcon className="size-4" aria-hidden /> For reviewers · test network only
      </p>
      <div className="mt-2 space-y-2 text-[0.95rem] text-ink-2">{children}</div>
      <dl className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <dt className="w-20 text-[0.88rem] text-ink-3">{r.label}</dt>
            <dd><code className="rounded-lg bg-white px-3 py-1.5 font-mono text-[0.9rem]">{r.value}</code></dd>
          </div>
        ))}
      </dl>
      <button type="button" className="btn btn-ghost mt-4 !min-h-10 !py-1.5 text-[0.9rem]" onClick={onFill}>Fill it in</button>
    </div>
  );
}
