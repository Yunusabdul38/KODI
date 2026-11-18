"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { CheckIcon, CopyIcon, TimerIcon, ZapIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatInt } from "@/lib/format";

export type Network = "demo" | "mainnet" | "mutinynet";

function useCountdown(expiresAt: string) {
  const [left, setLeft] = useState(() => Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.round((Date.parse(expiresAt) - Date.now()) / 1000))), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  return left;
}

/**
 * A Lightning payment request with a QR code, a copy button and a countdown.
 * It polls the server, which re-checks with the wallet: only the wallet can
 * mark something paid, never this page.
 */
export function InvoicePanel({
  hash,
  pr,
  expiresAt,
  sats,
  label,
  network,
  onPaid,
}: {
  hash: string;
  pr: string;
  expiresAt: string;
  sats: number;
  /** e.g. "₦2,640,000". */
  label: string;
  network: Network;
  onPaid?: () => void;
}) {
  const router = useRouter();
  const left = useCountdown(expiresAt);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: status } = useQuery({
    queryKey: ["pay", hash],
    queryFn: async () => {
      const r = await fetch(`/api/pay/${hash}`, { cache: "no-store" });
      return ((await r.json()) as { status: string }).status;
    },
    refetchInterval: (q) => (q.state.data === "paid" || q.state.data === "expired" ? false : 2500),
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (status === "paid" || status === "expired") {
      onPaid?.();
      router.refresh();
    }
  }, [status, onPaid, router]);

  if (status === "paid") {
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-green-soft p-4" role="status">
        <span className="flex size-9 items-center justify-center rounded-full bg-green text-white">
          <CheckIcon className="size-5" />
        </span>
        <p className="font-semibold">Payment received.</p>
      </div>
    );
  }

  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, "0");
  const urgent = left < 120;

  return (
    <div>
      <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
        <a
          href={`lightning:${pr}`}
          className="mx-auto block w-fit rounded-[22px] bg-white p-4 ring-1 ring-line"
          aria-label="Open the payment request in your wallet app"
        >
          <QRCodeSVG value={pr.toUpperCase()} size={208} marginSize={0} level="M" />
        </a>
        <div>
          <p className="text-[0.9rem] text-ink-3">Pay with any Lightning wallet</p>
          <p className="mt-1 text-[1.9rem] font-extrabold tracking-[-0.03em]">{label}</p>
          <p className="text-[0.95rem] text-ink-2">
            <ZapIcon className="mr-1 inline size-4 text-laterite" aria-hidden="true" />
            {formatInt(sats)} sats
          </p>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-paper px-3.5 py-2.5 text-[0.88rem]" aria-live="polite">
            <span className="flex items-center gap-2 text-ink-2">
              <span className="inline-block size-2 animate-pulse rounded-full bg-green motion-reduce:animate-none" />
              Waiting for payment…
            </span>
            <span className={cn("flex items-center gap-1.5 font-mono tabular-nums", urgent ? "font-semibold text-clay" : "text-ink-3")}>
              <TimerIcon className="size-3.5" />
              {mm}:{ss}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sand" aria-hidden="true">
            <div
              className={cn("h-full transition-[width] duration-1000 ease-linear", urgent ? "bg-clay" : "bg-forest")}
              style={{ width: `${(left / 900) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {network === "demo" && (
        <p className="mt-5 rounded-xl bg-amber-soft px-3.5 py-2.5 text-[0.9rem]">
          Demo mode: no wallet can pay this code. Use <strong>Simulate payment</strong> below.
        </p>
      )}
      {network === "mutinynet" && (
        <p className="mt-5 rounded-xl bg-amber-soft px-3.5 py-2.5 text-[0.9rem]">
          Test network (Mutinynet): phone wallets can&apos;t pay this. Copy the payment request and pay it from the test
          wallet dashboard (Send) or at{" "}
          <a className="font-semibold underline" href="https://faucet.mutinynet.com/" target="_blank" rel="noopener noreferrer">
            faucet.mutinynet.com
          </a>
          .
        </p>
      )}

      <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => {
            // Bitcoin Connect: one-tap pay from Alby, any NWC wallet or a WebLN extension.
            const { launchPaymentModal } = await import("@getalby/bitcoin-connect-react");
            launchPaymentModal({ invoice: pr });
          }}
        >
          Pay with a connected wallet
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(pr);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          {copied ? "Copied" : "Copy payment request"}
        </button>
        <a href={`lightning:${pr}`} className="btn btn-ghost sm:hidden">
          Open wallet app
        </a>
        {network === "demo" && (
          <button
            type="button"
            className="btn btn-ghost !border-dashed sm:col-span-2"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await fetch(`/api/pay/${hash}/simulate`, { method: "POST" });
              setBusy(false);
            }}
          >
            Simulate payment (demo only)
          </button>
        )}
      </div>
    </div>
  );
}
