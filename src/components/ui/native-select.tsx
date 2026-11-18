import { ChevronDownIcon } from "lucide-react";
import * as React from "react";
import { cn } from "cn";

/** The browser's own select (best on phones), styled to match Kodi's inputs. */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="native-select"
        className={cn(
          "h-[52px] w-full appearance-none rounded-[12px] border border-line-2 bg-white py-2 pl-4 pr-11 text-[0.98rem] text-ink shadow-[0_1px_2px_rgba(20,33,27,0.05)] transition-[border-color,box-shadow] outline-none hover:border-ink-3/50 focus-visible:border-forest focus-visible:ring-4 focus-visible:ring-forest/10 aria-invalid:border-clay aria-invalid:ring-4 aria-invalid:ring-clay/10 disabled:opacity-60",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden="true" />
    </div>
  );
}

export { NativeSelect };
