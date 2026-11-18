"use client"

import * as React from "react"
import { cn } from "cn"

/**
 * Pasted text often carries a space or line break at either end (copied from a
 * terminal, an email, or a page where the text sits after a label). In a
 * one-line field that's never wanted, and in an email or password it breaks
 * sign-in, so it's dropped. Typing a space yourself is unaffected.
 */
function pasteTrimmed(e: React.ClipboardEvent<HTMLInputElement>) {
  const text = e.clipboardData.getData("text/plain")
  const trimmed = text.trim()
  if (trimmed === text) return
  e.preventDefault()
  const input = e.currentTarget
  // insertText keeps undo working and fires the normal input event, so React
  // state and form validation see the change like any other paste.
  if (!document.execCommand?.("insertText", false, trimmed)) {
    input.setRangeText(trimmed, input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length, "end")
    input.dispatchEvent(new Event("input", { bubbles: true }))
  }
}

function Input({ className, type, onPaste, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      onPaste={(e) => {
        onPaste?.(e)
        if (!e.defaultPrevented) pasteTrimmed(e)
      }}
      className={cn(
        "h-[52px] w-full min-w-0 rounded-[12px] border border-line-2 bg-white px-4 py-2 text-[0.98rem] text-ink shadow-[0_1px_2px_rgba(20,33,27,0.05)] transition-[border-color,box-shadow] outline-none placeholder:text-ink-3/70 hover:border-ink-3/50 focus-visible:border-forest focus-visible:ring-4 focus-visible:ring-forest/10 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-paper-2 disabled:opacity-60 aria-invalid:border-clay aria-invalid:bg-clay-soft/30 aria-invalid:ring-4 aria-invalid:ring-clay/10 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium",
        className
      )}
      {...props}
    />
  )
}

export { Input }
