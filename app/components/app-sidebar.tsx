"use client";

import { Icon } from "@blueprintjs/core";
import Link from "next/link";

const navItems = [
  { label: "Home", icon: "home", href: "/" },
  { label: "Portfolio", icon: "timeline-line-chart", href: "/portfolio" },
  { label: "Asset List", icon: "database", href: "/asset-list" },
  { label: "Exchange Rate", icon: "exchange", href: "/exchange-rate" },
] as const;

type ActivePage = "home" | "portfolio" | "asset-list" | "exchange-rate";

export function AppSidebar({ active, email }: { active: ActivePage; email?: string }) {
  const initials = email ? email.slice(0, 2).toUpperCase() : "A";

  return (
    <aside className="app-sidebar">
      <Link href="/" className="brand-block" aria-label="Portfolio Manager home">
        <span className="brand-mark">PM</span>
        <span className="brand-copy">
          <strong>Portfolio Manager</strong>
          <small>PORTFOLIO OVERVIEW</small>
        </span>
      </Link>

      <div className="sidebar-section-label">Navigation</div>
      <nav className="nav-menu" aria-label="Primary navigation">
        {navItems.map((item) => {
          const isActive = item.href.slice(1) === active || (item.href === "/" && active === "home");

          return (
            <Link key={item.label} href={item.href} className={`nav-link${isActive ? " is-active" : ""}`} aria-label={item.label} aria-current={isActive ? "page" : undefined}>
              <Icon icon={item.icon} size={16} />
              <span>{item.label}</span>
              {isActive ? <span className="nav-active-dot" aria-hidden="true" /> : null}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-status">
        <span className="status-orbit" aria-hidden="true"><span /></span>
        <span>
          <strong>PRIVATE WORKSPACE</strong>
          <small>USD PRIMARY · THB SECONDARY</small>
        </span>
      </div>

      <div className="sidebar-operator">
        <span className="operator-avatar">{initials}</span>
        <span>
          <strong>{email ?? "Admin User"}</strong>
          <small>PORTFOLIO OPERATOR</small>
        </span>
        <form action="/api/auth/logout" method="post" className="sidebar-logout-form">
          <button type="submit" className="sidebar-logout" title="Sign out" aria-label="Sign out">
            <Icon icon="log-out" size={14} />
          </button>
        </form>
      </div>
    </aside>
  );
}
