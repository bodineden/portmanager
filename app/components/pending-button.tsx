"use client";

import { useFormStatus } from "react-dom";

export function PendingButton({
  children,
  pendingLabel = "Saving...",
  className,
  title,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className: string;
  title?: string;
  "aria-label"?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button aria-label={ariaLabel} title={title} disabled={pending} className={`${className} disabled:cursor-wait disabled:opacity-70`}>
      <span className="inline-flex items-center justify-center gap-2">
        {pending ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
        {pending ? pendingLabel : children}
      </span>
    </button>
  );
}
