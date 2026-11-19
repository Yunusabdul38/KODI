"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { NumericFormat } from "react-number-format";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";

/**
 * Submit handler that keeps what was typed when the server sends the form back.
 *
 * React clears a form's fields once its action finishes, even when the server
 * returned an error, so people had to type everything again (and the receipt
 * form lost its file while still showing the file name). Running the same
 * action from onSubmit skips that reset; pending states work as before.
 * Use with `action` still set on the form, so it also works before JavaScript
 * loads: <form action={action} onSubmit={keepValues(action)}>.
 */
export const keepValues = (action: (data: FormData) => void) => (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
  startTransition(() => action(data));
};

/**
 * After a failed submit, brings the problem into view: the first field marked
 * invalid (focused, so people can fix it straight away), or else the form's
 * error message. Without it, an error at the far end of a long form goes unseen.
 * Place anywhere inside the form; pass the action state.
 */
export function ErrorFocus({ state }: { state: { error?: string; errors?: Record<string, string | undefined> } | undefined | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!state || (!state.error && !Object.values(state.errors ?? {}).some(Boolean))) return;
    const form = ref.current?.closest("form");
    const target = form?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form?.querySelector<HTMLElement>('[role="alert"]');
    if (!target) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    if (target.matches("input, select, textarea, button")) target.focus({ preventScroll: true });
  }, [state]);
  return <span ref={ref} hidden />;
}

/** Label, hint, control and error in one consistent block. */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: React.ReactNode;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Field data-invalid={Boolean(error) || undefined} className={className}>
      <FieldLabel htmlFor={htmlFor} className="text-[0.92rem] font-semibold text-ink">{label}</FieldLabel>
      {children}
      {hint && !error && <FieldDescription className="text-[0.85rem] text-ink-3">{hint}</FieldDescription>}
      {error && <FieldError id={`${htmlFor}-error`} className="text-[0.85rem] font-medium text-clay">{error}</FieldError>}
    </Field>
  );
}

/** aria-invalid and aria-describedby for a control whose field has an error. */
export const invalid = (name: string, error?: string) =>
  error ? { "aria-invalid": true as const, "aria-describedby": `${name}-error` } : {};

/**
 * Amount in a currency: symbol prefix, thousands separators as you type, and
 * a plain number submitted under `name`.
 */
export function MoneyInput({
  id,
  name,
  symbol,
  currency,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  error,
  disabled,
}: {
  id: string;
  name: string;
  symbol: string;
  currency?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (raw: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}) {
  const [own, setOwn] = useState(defaultValue ?? "");
  const raw = value ?? own;
  return (
    <InputGroup data-disabled={disabled || undefined}>
      <InputGroupAddon className="font-medium text-ink-2">{symbol}</InputGroupAddon>
      <NumericFormat
        id={id}
        data-slot="input-group-control"
        inputMode="numeric"
        thousandSeparator=","
        decimalScale={0}
        allowNegative={false}
        value={raw}
        onValueChange={(v) => {
          setOwn(v.value);
          onValueChange?.(v.value);
        }}
        placeholder={placeholder}
        disabled={disabled}
        {...invalid(name, error)}
        className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 text-[0.98rem] text-ink outline-none placeholder:text-ink-3/70"
      />
      {currency && symbol !== currency && <InputGroupAddon align="inline-end" className="label-mono text-ink-3">{currency}</InputGroupAddon>}
      <input type="hidden" name={name} value={raw} />
    </InputGroup>
  );
}
