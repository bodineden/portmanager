import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const fixturePath = fileURLToPath(new URL("./__fixtures__/pnl-browser.json", import.meta.url));
export const browserFixture = JSON.parse(await readFile(fixturePath, "utf8"));

export async function startUiFixtureServer() {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "portmanager-ui-fixture-"));
  const outputRoot = path.join(temporaryRoot, "dist");
  let server;
  try {
    const template = await readFile(new URL("./__fixtures__/pnl-browser.html", import.meta.url), "utf8");
    await writeFile(path.join(temporaryRoot, "index.html"), template.replace("</body>", '<script type="module" src="/entry.tsx"></script></body>'));
    await writeFile(path.join(temporaryRoot, "entry.tsx"), `import ${JSON.stringify(path.join(projectRoot, "scripts/ui-fixture-entry.tsx"))};`);

    // Mock only the server data boundaries and Next navigation. The actual page,
    // chart, history, calendar, wallet, formatters and styles are built unchanged.
    const virtualData = "\0ui-fixture-live-data";
    const virtualArchive = "\0ui-fixture-archive";
    const virtualHistory = "\0ui-fixture-history";
    const virtualLink = "\0ui-fixture-link";
    await build({
      root: temporaryRoot,
      configFile: false,
      publicDir: false,
      logLevel: "error",
      cacheDir: path.join(temporaryRoot, "cache"),
      resolve: { alias: {
        "@": projectRoot,
        "react": path.join(projectRoot, "node_modules/react"),
        "react-dom": path.join(projectRoot, "node_modules/react-dom"),
      } },
      plugins: [{
        name: "ui-contract-fixture-data",
        enforce: "pre",
        resolveId(source, importer) {
          if (path.isAbsolute(source)) source = path.normalize(source);
          if (source === "next/link") return virtualLink;
          if (source === path.join(projectRoot, "lib/live-data") || source === "@/lib/live-data") return virtualData;
          if (source === path.join(projectRoot, "lib/assets-db") || source === "@/lib/assets-db"
            || (source === "./assets-db" && importer === path.join(projectRoot, "lib/live-data.ts"))) return virtualArchive;
          if (source === "@/lib/pnl-history" || source === path.join(projectRoot, "lib/pnl-history")
            || (source === "./pnl-history" && importer === path.join(projectRoot, "lib/live-data.ts"))) return virtualHistory;
        },
        load(id) {
          if (id === virtualData) return `
            import fixture from ${JSON.stringify(fixturePath)};
            export { formatCurrency, formatEth, formatThb, formatUsd } from ${JSON.stringify(path.join(projectRoot, "lib/live-data.ts"))};
            export async function getJoinedPortfolio() {
              const portfolio = structuredClone(fixture.portfolio);
              const scenario = new URLSearchParams(location.search).get("scenario");
              const mascot = fixture.mascotScenarios.find((entry) => entry.scenario === scenario);
              if (mascot?.totals) {
                Object.assign(portfolio.totals, mascot.totals);
                const { costBasisUsd, costBasisThb, pnlUsd, pnlThb, pnlPct, pnlCoverage } = portfolio.totals;
                portfolio.totals.pnlByClass.t212 = { costBasisUsd, costBasisThb, pnlUsd, pnlThb, pnlPct, pnlCoverage: structuredClone(pnlCoverage) };
              }
              for (const [key, status] of Object.entries(mascot?.sourceStatuses ?? {})) portfolio.sources[key].status = status;
              if (scenario === "portfolio-unavailable") {
                portfolio.totals.grandTotalUsd = null;
                portfolio.totals.grandTotalThb = null;
                portfolio.totals.costBasisUsd = null;
                portfolio.totals.costBasisThb = null;
                portfolio.totals.pnlUsd = null;
                portfolio.totals.pnlThb = null;
                portfolio.totals.pnlCoverage.status = "partial";
                portfolio.totals.pnlCoverage.sourcesComplete = false;
                for (const source of Object.values(portfolio.sources)) source.status = "unavailable";
              }
              return portfolio;
            }
          `;
          if (id === virtualArchive) return `
            import fixture from ${JSON.stringify(fixturePath)};
            export function isNeonConfigured() { return true; }
            export async function listPortfolioValueSeries() { return structuredClone(fixture.legacyPoints); }
          `;
          if (id === virtualHistory) return `
            import fixture from ${JSON.stringify(fixturePath)};
            export async function recordPortfolioSnapshot() { throw new Error("Fixture must never record snapshots"); }
            export async function readPortfolioSnapshotHistory() {
              const scenario = new URLSearchParams(location.search).get("scenario");
              const mascot = fixture.mascotScenarios.find((entry) => entry.scenario === scenario);
              const available = mascot?.snapshotHistoryAvailable !== false;
              return { snapshots: available ? structuredClone(fixture.snapshots) : [], available };
            }
            export async function listPortfolioSnapshots() { return (await readPortfolioSnapshotHistory()).snapshots; }
          `;
          if (id === virtualLink) return 'import { createElement } from "react"; export default function Link(props) { return createElement("a", props); }';
        },
      }],
      css: { postcss: { plugins: [] } },
      build: { outDir: outputRoot, emptyOutDir: true },
      oxc: { jsx: { runtime: "automatic" } },
    });

    server = createServer(async (request, response) => {
      try {
        const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
        if (pathname === "/favicon.ico") { response.writeHead(204).end(); return; }
        if (/^\/mascot\/mascot-(?:calm|happy|excited|thinking|worried|sad|sleepy|proud|alert)\.webp$/.test(pathname)) {
          const contents = await readFile(path.join(projectRoot, "public", pathname.slice(1)));
          response.setHeader("Content-Type", "image/webp");
          response.end(contents);
          return;
        }
        const relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).slice(1);
        const requestedFile = path.resolve(outputRoot, relativePath);
        if (!requestedFile.startsWith(`${outputRoot}${path.sep}`)) { response.writeHead(404).end(); return; }
        const contents = await readFile(requestedFile);
        const extension = path.extname(requestedFile);
        response.setHeader("Content-Type", extension === ".js" ? "text/javascript" : extension === ".css" ? "text/css" : "text/html");
        response.end(contents);
      } catch {
        response.writeHead(404).end("Fixture asset not found");
      }
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Fixture server has no localhost port");
    return {
      url: `http://127.0.0.1:${address.port}`,
      async close() {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        await rm(temporaryRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}
