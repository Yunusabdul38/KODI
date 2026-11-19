"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

const LENGTH = 6;

/**
 * Six boxes for a numeric PIN: typing moves to the next box, Backspace goes
 * back, and a pasted PIN fills them all. The form gets one field, `name`.
 * The first box's id is `${id}-0`, for the label.
 */
export function PinInput({ id, name, invalid = false, autoFocus = false, newPin = false }: { id: string; name: string; invalid?: boolean; autoFocus?: boolean; newPin?: boolean }) {
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const [shown, setShown] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) => boxes.current[Math.max(0, Math.min(LENGTH - 1, i))]?.focus();

  const put = (start: number, text: string) => {
    const incoming = text.replace(/\D/g, "").slice(0, LENGTH - start).split("");
    if (!incoming.length) return;
    setDigits((d) => d.map((v, i) => (i >= start && i < start + incoming.length ? incoming[i - start] : v)));
    focus(start + incoming.length);
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i]) {
      e.preventDefault();
      setDigits((d) => d.map((v, j) => (j === i - 1 ? "" : v)));
      focus(i - 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focus(i + 1);
    }
  };

  const onPaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    put(i, e.clipboardData.getData("text"));
  };

  return (
    <div>
      <input type="hidden" name={name} value={digits.join("")} />
      <div role="group" aria-label="6-digit PIN" className="grid max-w-[22rem] grid-cols-6 gap-2 sm:gap-2.5">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              boxes.current[i] = el;
            }}
            id={`${id}-${i}`}
            type={shown ? "text" : "password"}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={i === 0 ? (newPin ? "new-password" : "one-time-code") : "off"}
            autoFocus={autoFocus && i === 0}
            aria-label={`Digit ${i + 1} of ${LENGTH}`}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${id}-0-error` : undefined}
            value={d}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "");
              if (v.length > 1) return put(i, v);
              setDigits((all) => all.map((x, j) => (j === i ? v : x)));
              if (v) focus(i + 1);
            }}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={(e) => onPaste(i, e)}
            onFocus={(e) => e.target.select()}
            className={`h-14 w-full min-w-0 rounded-[12px] border bg-white sm:h-[3.75rem] text-center font-mono text-[1.35rem] font-semibold text-ink caret-forest shadow-[0_1px_0_rgba(20,33,27,0.04)] transition-[border-color,box-shadow] outline-none focus:border-forest focus:ring-4 focus:ring-forest/12 sm:text-[1.5rem] ${invalid ? "border-clay" : d ? "border-forest/50" : "border-line-2"}`}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg py-1 text-[0.85rem] font-medium text-ink-3 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/15"
      >
        {shown ? <EyeOffIcon className="size-4" aria-hidden /> : <EyeIcon className="size-4" aria-hidden />}
        {shown ? "Hide PIN" : "Show PIN"}
      </button>
    </div>
  );
}
