"use client";

import { Card, Icon, Spinner } from "@blueprintjs/core";
import type { IconName } from "@blueprintjs/icons";
import Link from "next/link";
import { useState } from "react";

export function WorkspaceLink({
  href,
  icon,
  title,
  description,
  meta,
}: {
  href: string;
  icon: IconName;
  title: string;
  description: string;
  meta: string;
}) {
  const [pending, setPending] = useState(false);

  return (
    <Link
      href={href}
      onClick={() => setPending(true)}
      className="workspace-link"
    >
      <Card className="workspace-card" compact interactive>
        <span className="workspace-icon"><Icon icon={icon} size={22} /></span>
        <span className="workspace-copy">
          <span className="workspace-meta">{meta}</span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <span className="workspace-arrow" aria-hidden="true">
          {pending ? <Spinner size={15} /> : <Icon icon="arrow-right" size={16} />}
        </span>
      </Card>
    </Link>
  );
}
