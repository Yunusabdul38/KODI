"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

/** A private link with a copy button. */
export function CopyLink({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line-2 bg-white p-1.5 pl-3.5">
      <span className="min-w-0 flex-1 truncate font-mono text-[0.85rem] text-ink-2">{url}</span>
      <button
        type="button"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-[0.85rem] font-semibold text-paper"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
        {copied ? "Copied" : label}
      </button>
    </div>
  );
}
