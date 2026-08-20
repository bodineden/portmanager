import { AppSidebar } from "./components/app-sidebar";
import { WorkspaceLink } from "./components/workspace-link";

export default function Home() {
  return (
    <main className="workspace-shell">
      <AppSidebar active="home" />
      <section className="workspace-main">
        <header className="page-header">
          <div className="page-title-group">
            <p className="eyebrow">PORTFOLIO OPERATIONS / HOME</p>
            <h1 className="page-title">Command Center</h1>
            <p className="page-subtitle">Personal portfolio intelligence in Thai baht</p>
          </div>
          <div className="header-status"><span className="status-light" /> SYSTEM READY</div>
        </header>

        <div className="page-content home-content">
          <section className="home-hero">
            <div>
              <p className="eyebrow">PORTMANAGER / PRIVATE INSTANCE</p>
              <h2>One operating picture for your portfolio.</h2>
              <p>Move from market prices to holder-level exposure and total THB performance without leaving the workspace.</p>
            </div>
            <div className="hero-readout" aria-label="Workspace coverage">
              <span><small>BASE</small><strong>THB</strong></span>
              <span><small>DATA</small><strong>NEON</strong></span>
              <span><small>MODE</small><strong>LIVE</strong></span>
            </div>
          </section>

          <section className="workspace-directory panel">
            <div className="panel-header">
              <div><p className="eyebrow">WORKSPACE DIRECTORY</p><h2 className="panel-title">Available Areas</h2></div>
              <span className="panel-count">04 MODULES</span>
            </div>
            <div className="workspace-grid">
              <WorkspaceLink href="/portfolio" icon="timeline-line-chart" meta="ANALYTICS / 01" title="Portfolio Value" description="Daily portfolio value, range analysis, and monthly THB trend." />
              <WorkspaceLink href="/asset-list" icon="database" meta="MARKET DATA / 02" title="Asset List" description="Update prices, inspect movers, and operate the asset registry." />
              <WorkspaceLink href="/holder-list" icon="people" meta="OWNERSHIP / 03" title="Holder List" description="Manage investors, holdings, costs, values, and CSV exports." />
              <WorkspaceLink href="/exchange-rate" icon="exchange" meta="CURRENCY / 04" title="Exchange Rate" description="Maintain the FX pairs used for THB conversion." />
            </div>
          </section>

          <section className="home-footnote">
            <span>PRICE + FX INPUTS</span>
            <p>Server-action controls remain the authoritative write path for the daily market-data workflow.</p>
          </section>
        </div>
      </section>
    </main>
  );
}
