import { createRoot } from "react-dom/client";
import PortfolioPage from "../app/portfolio/page";
import { PnlCalendar, PnlPerformance } from "../app/pnl-history-panels";
import { WalletBalancesPanel } from "../app/home-wallet-panel";
import type { PortfolioSnapshot } from "../lib/pnl-history";
import { formatViewThb, formatViewUsd } from "../lib/pnl-view";
import fixture from "./__fixtures__/pnl-browser.json";
import "../node_modules/plottable/plottable.css";
import "../app/globals.css";
import "../app/home.css";

// This entry is built only by the browser harness, outside the Next app/routes.
let scenario = new URLSearchParams(location.search).get("scenario") ?? "recent";
const root = createRoot(document.getElementById("root")!);

async function mount() {
  if (scenario.startsWith("portfolio-")) {
    // Execute the actual page with fixture data boundaries, including livePoint
    // and the server-derived mascot props. No replacement guide UI lives here.
    root.render(await PortfolioPage());
    return;
  }

  const snapshots = (scenario === "empty" ? []
    : scenario === "older" ? fixture.snapshots.slice(0, 1)
      : fixture.snapshots) as PortfolioSnapshot[];
  const filteredEmpty = scenario === "filtered-empty";
  const nativeInputs = filteredEmpty ? fixture.wallet.nativeRows.slice(1, 2) : fixture.wallet.nativeRows;
  const tokenInputs = filteredEmpty ? fixture.wallet.tokenRows.slice(1) : fixture.wallet.tokenRows;
  const rowView = (row: typeof nativeInputs[number]) => ({
    ...row,
    priceUsd: formatViewUsd(row.valueUsd),
    valueUsdText: formatViewUsd(row.valueUsd),
    valueThb: formatViewThb(row.valueThb),
  });
  const nativeRows = nativeInputs.map(rowView);
  const tokenRows = tokenInputs.map((row) => ({ ...rowView(row), name: row.name, priced: row.priced }));
  const totalUsd = [...nativeInputs, ...tokenInputs].reduce((sum, row) => sum + (row.valueUsd ?? 0), 0);
  const totalThb = [...nativeInputs, ...tokenInputs].reduce((sum, row) => sum + (row.valueThb ?? 0), 0);
  const source = { ...fixture.wallet.source, status: "partial" as const };

  root.render(<main className="home-shell page-content home-content">
    <PnlPerformance snapshots={snapshots} asOf={fixture.asOf} />
    <PnlCalendar snapshots={snapshots} asOf={fixture.asOf} />
    <WalletBalancesPanel nativeRows={nativeRows} tokenRows={tokenRows}
      nativeSource={source} tokenSource={source} walletSourcesComplete={false}
      walletSourcesUnavailable={false} totalWalletUsd={formatViewUsd(totalUsd)} totalWalletThb={formatViewThb(totalThb)} />
  </main>);
}

// Fixture-only prop transition: rebuild the same real page without replacing the
// document, so the harness can exercise new server props and retained preferences.
window.addEventListener("ui-fixture:scenario", (event) => {
  const next = (event as CustomEvent<unknown>).detail;
  if (typeof next !== "string" || !fixture.mascotScenarios.some((entry) => entry.scenario === next)) return;
  scenario = next;
  const url = new URL(location.href);
  url.searchParams.set("scenario", scenario);
  history.pushState(null, "", url);
  void mount();
});

void mount();
