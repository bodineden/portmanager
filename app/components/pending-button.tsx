"use client";

import { Button } from "@blueprintjs/core";
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

  return <Button type="submit" aria-label={ariaLabel} title={title} disabled={pending} className={className} loading={pending} text={pending ? pendingLabel : children} />;
}
