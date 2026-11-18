import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full rounded-[12px] border border-line-2 bg-white px-4 py-3 text-[0.98rem] leading-relaxed text-ink shadow-[0_1px_2px_rgba(20,33,27,0.05)] transition-[border-color,box-shadow] outline-none placeholder:text-ink-3/70 hover:border-ink-3/50 focus-visible:border-forest focus-visible:ring-4 focus-visible:ring-forest/10 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-clay aria-invalid:ring-4 aria-invalid:ring-clay/10",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
