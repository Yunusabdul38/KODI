"use client";

import { useState } from "react";

/**
 * Checks a Lightning payment proof entirely in the browser:
 * sha256(preimage) must equal the payment hash. Only the person who paid
 * (or was paid) can know the preimage, so a match proves the payment happened.
 */
export function VerifyProof({ preimage, paymentHash }: { preimage: string; paymentHash: string }) {
  const [state, setState] = useState<"idle" | "ok" | "bad">("idle");

  async function verify() {
    const bytes = new Uint8Array(preimage.match(/../g)!.map((h) => parseInt(h, 16)));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
    setState(hex === paymentHash ? "ok" : "bad");
  }

  return (
    <div>
      <button type="button" onClick={verify} className="btn btn-primary">
        Check this payment
      </button>
      <p aria-live="polite" className="mt-3 text-[0.95rem]">
        {state === "ok" && (
          <span className="font-medium text-green-2">
            Checked on your device: the proof matches the payment hash, so this payment really happened.
          </span>
        )}
        {state === "bad" && (
          <span className="font-medium text-clay">The proof doesn&apos;t match. Please contact Kodi.</span>
        )}
      </p>
    </div>
  );
}
