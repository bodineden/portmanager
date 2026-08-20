"use client";

import { Icon } from "@blueprintjs/core";
import Link from "next/link";

const navItems = [
  { label: "Home", icon: "home", href: "/" },
  { label: "Portfolio", icon: "timeline-line-chart", href: "/portfolio" },
  { label: "Asset List", icon: "database", href: "/asset-list" },
  { label: "Holder List", icon: "people", href: "/holder-list" },
  { label: "Exchange Rate", icon: "exchange", href: "/exchange-rate" },
] as const;

export function AppSidebar({ active }: { active: "home" | "portfolio" | "asset-list" | "holder-list" | "exchange-rate" }) {
  return (
    <aside className="app-sidebar">
      <Link href="/" className="brand-block" aria-label="Portfolio Manager home">
        <span className="brand-mark">PM</span>
        <span className="brand-copy">
          <strong>Portfolio Manager</strong>
          <small>CONTROL WORKSPACE</small>
        </span>
      </Link>

      <div className="sidebar-section-label">Navigation</div>
      <nav className="nav-menu" aria-label="Primary navigation">
        {navItems.map((item) => {
          const isActive = item.href.slice(1) === active || (item.href === "/" && active === "home");

          return (
            <Link key={item.label} href={item.href} className={`nav-link${isActive ? " is-active" : ""}`} aria-current={isActive ? "page" : undefined}>
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
          <small>THB BASE CURRENCY</small>
        </span>
      </div>

      <div className="sidebar-operator">
        <span className="operator-avatar">A</span>
        <span>
          <strong>Admin User</strong>
          <small>PORTFOLIO OPERATOR</small>
        </span>
        <Icon icon="shield" size={14} />
      </div>
    </aside>
  );
}
