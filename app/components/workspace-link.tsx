"use client";

import Link from "next/link";
import { useState } from "react";

export function WorkspaceLink({
  href,
  icon,
  iconClassName,
  title,
  description,
}: {
  href: string;
  icon: string;
  iconClassName: string;
  title: string;
  description: string;
}) {
  const [pending, setPending] = useState(false);

  return (
    <Link
      href={href}
      onClick={() => setPending(true)}
      className="group grid gap-4 rounded-lg border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:bg-blue-50/40 sm:grid-cols-[56px_1fr_auto] sm:items-center"
    >
      <div className={iconClassName}>{icon}</div>
      <div>
        <h3 className="text-xl font-bold text-slate-950">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <span className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white text-lg font-bold text-blue-600 transition group-hover:border-blue-300">
        {pending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /> : ">"}
      </span>
    </Link>
  );
}
