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
const scenario = new URLSearchParams(location.search).get("scenario") ?? "recent";
const root = createRoot(document.getElementById("root")!);

async function mount() {
  if (scenario.startsWith("portfolio-")) {
    // Execute the actual page with fixture data boundaries, including its livePoint props.
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

void mount();
