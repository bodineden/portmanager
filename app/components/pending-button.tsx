"use client";

import { Button, Spinner } from "@blueprintjs/core";
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
    <Button
      type="submit"
      aria-label={ariaLabel}
      title={title}
      aria-live="polite"
      disabled={pending}
      className={className}
      icon={pending ? <Spinner size={12} /> : undefined}
      text={pending ? pendingLabel : children}
    />
  );
}
