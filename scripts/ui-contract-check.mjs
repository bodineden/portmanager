import { existsSync } from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.UI_BASE_URL ?? "http://127.0.0.1:8125";
const configuredBrowser = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browserCandidates = [
  configuredBrowser,
  chromium.executablePath(),
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/snap/bin/chromium",
].filter(Boolean);
const executablePath = browserCandidates.find((candidate) => existsSync(candidate));
const results = [];

const routes = [
  { name: "home", path: "/", finalPaths: ["/"] },
  { name: "asset-list", path: "/asset-list", finalPaths: ["/asset-list"] },
  { name: "portfolio", path: "/portfolio", finalPaths: ["/portfolio"] },
  { name: "exchange-rate", path: "/exchange-rate", finalPaths: ["/exchange-rate"] },
  // This compatibility route intentionally redirects to the live registry.
  { name: "asset-master", path: "/asset-master", finalPaths: ["/asset-master", "/asset-list"] },
];

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

const retiredInvestorNames = ["Alice Johnson", "Bob Smith", "Carol Williams", "David Brown"];
const removedOwnerNames = [
  ["Bo", "din"].join(""),
  ["P", "P"].join(""),
  ["Son", "ya"].join(""),
];
const removedOwnershipLabel = ["BENE", "FICIAL OWNER", "SHIP"].join("");

function record(label, passed, detail = "") {
  results.push({ label, passed, detail });
  const suffix = detail ? ` — ${detail}` : "";
  process.stdout.write(`${passed ? "PASS" : "FAIL"} | ${label}${suffix}\n`);
}

async function check(label, operation) {
  try {
    const detail = await operation();
    record(label, true, typeof detail === "string" ? detail : "");
    return true;
  } catch (error) {
    record(label, false, error instanceof Error ? error.message : String(error));
    return false;
  }
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function compactText(value) {
  return value.replace(/\s+/g, " ").trim();
}

async function renderedText(page) {
  return compactText(await page.locator("body").innerText());
}

async function checkOwnershipLanguage(page, routeName) {
  const text = await renderedText(page);

  await check(`${routeName} renders no investor names`, async () => {
    for (const owner of removedOwnerNames) {
      requireCondition(!new RegExp(`\\b${owner}\\b`).test(text), `${owner} is rendered`);
    }
    for (const retiredName of retiredInvestorNames) {
      requireCondition(!text.includes(retiredName), `retired demo investor ${retiredName} is rendered`);
    }
    requireCondition(!text.toUpperCase().includes(removedOwnershipLabel), `${removedOwnershipLabel} is rendered`);
    requireCondition(!/\b(?:pending\s+migration|migration|demo(?:nstration)?)\b/i.test(text), "migration/demo wording is rendered");
  });
}

async function checkHomeContract(page) {
  await checkOwnershipLanguage(page, "home");
  await check("home renders no allocation language", async () => {
    const text = await renderedText(page);
    const forbiddenCopy = [
      removedOwnershipLabel,
      ["INVEST", "OR"].join(""),
      ["OWNER", "SHIP / EVERYTHING"].join(""),
      removedOwnerNames[2],
    ];
    for (const phrase of forbiddenCopy) {
      requireCondition(!text.toUpperCase().includes(phrase.toUpperCase()), `${phrase} is rendered`);
    }
  });

  await check("home preserves three KPIs and adds the non-NFT wallet KPI", async () => {
    const cards = page.locator('[aria-label="Joined live portfolio summary"] > .kpi-card');
    requireCondition(await cards.count() === 4, `expected 4 KPI cards, found ${await cards.count()}`);
    const walletCardText = compactText((await cards.nth(3).textContent()) ?? "");
    requireCondition(/04\s*\/\s*WALLET\s*\(NON-NFT\)/i.test(walletCardText), "wallet KPI label is missing");
    requireCondition(/USD/i.test(walletCardText), "wallet KPI has no USD secondary value");
  });

  await check("home wallet panel exposes both sources and the wallet table contract", async () => {
    const panel = page.locator(".home-wallet-panel");
    requireCondition(await panel.count() === 1, "wallet panel is missing or duplicated");
    const text = compactText((await panel.textContent()) ?? "");
    requireCondition(/EVM WALLET\s*\/\s*NATIVE \+ TOKENS/i.test(text), "wallet eyebrow is missing");
    requireCondition(/Wallet Balances/i.test(text), "wallet panel title is missing");
    requireCondition(await panel.locator(".live-source-badge").count() === 2, "expected native and token source badges");

    const table = panel.locator(".home-wallet-table");
    if (await table.count() === 0) {
      requireCondition(await panel.locator(".home-empty").count() === 1, "wallet table has no explicit empty/unavailable state");
      return "wallet sources returned no display rows";
    }

    const headings = await table.locator("thead th").allTextContents();
    const expected = ["Asset / Chain", "Type", "Amount", "Price (USD)", "Value (USD)", "Value (THB)"];
    requireCondition(
      headings.map(compactText).join("|") === expected.join("|"),
      `unexpected wallet columns: ${headings.map(compactText).join(" | ")}`,
    );
    requireCondition(
      /Total wallet \(priced\)/i.test(compactText((await table.locator(".table-total-row").textContent()) ?? "")),
      "priced wallet total row is missing",
    );
  });

  await check("home wallet rows keep native/token order and unpriced nulls", async () => {
    const rows = page.locator(".home-wallet-panel tr[data-wallet-kind]");
    const rowContracts = await rows.evaluateAll((elements) => elements.map((element) => ({
      kind: element.getAttribute("data-wallet-kind"),
      priced: element.getAttribute("data-wallet-priced"),
      cells: Array.from(element.querySelectorAll("td"), (cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim()),
    })));

    let tokenSeen = false;
    let unpricedSeen = false;
    for (const row of rowContracts) {
      if (row.kind === "token") tokenSeen = true;
      if (row.kind === "native") requireCondition(!tokenSeen, "native row appears after a token row");
      if (row.kind === "token" && row.priced === "false") {
        unpricedSeen = true;
        requireCondition(/UNPRICED/i.test(row.cells[1] ?? ""), "unpriced token tag is missing");
        for (const index of [3, 4, 5]) {
          requireCondition(row.cells[index] === "—", `unpriced token cell ${index + 1} is not —`);
        }
      }
      if (row.kind === "token" && row.priced === "true") {
        requireCondition(!unpricedSeen, "priced token appears after an unpriced token");
      }
    }
    return `${rowContracts.length} wallet row${rowContracts.length === 1 ? "" : "s"}`;
  });
}

async function checkAssetWalletContract(page) {
  await check("asset-list renders the read-only wallet registry", async () => {
    const panel = page.locator(".asset-wallet-panel");
    requireCondition(await panel.count() === 1, "wallet registry panel is missing or duplicated");
    requireCondition(await panel.locator(".asset-source-badge").count() === 2, "expected native and token source badges");
    const text = compactText((await panel.textContent()) ?? "");
    requireCondition(/Live Wallet Asset Registry/i.test(text), "wallet registry title is missing");

    const table = panel.locator(".asset-wallet-table");
    if (await table.count() === 0) {
      requireCondition(await panel.locator(".asset-empty-state").count() === 1, "wallet registry has no explicit empty/unavailable state");
      return "wallet sources returned no registry rows";
    }

    const headings = await table.locator("thead th").allTextContents();
    const expected = ["Asset", "Chain", "Type", "Amount", "Price (USD)", "Value (USD)", "Value (THB)"];
    requireCondition(
      headings.map(compactText).join("|") === expected.join("|"),
      `unexpected wallet registry columns: ${headings.map(compactText).join(" | ")}`,
    );
    requireCondition(/Total wallet \(priced\)/i.test(compactText((await table.locator("tfoot").textContent()) ?? "")), "wallet registry total is missing");
  });

  await check("asset-list wallet rows keep native/token order and unpriced nulls", async () => {
    const rows = page.locator(".asset-wallet-panel tr[data-wallet-kind]");
    const rowContracts = await rows.evaluateAll((elements) => elements.map((element) => ({
      kind: element.getAttribute("data-wallet-kind"),
      priced: element.getAttribute("data-wallet-priced"),
      cells: Array.from(element.querySelectorAll("td"), (cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim()),
    })));

    let tokenSeen = false;
    let unpricedSeen = false;
    for (const row of rowContracts) {
      if (row.kind === "token") tokenSeen = true;
      if (row.kind === "native") requireCondition(!tokenSeen, "native registry row appears after a token row");
      if (row.kind === "token" && row.priced === "false") {
        unpricedSeen = true;
        requireCondition(/UNPRICED/i.test(row.cells[2] ?? ""), "unpriced registry tag is missing");
        for (const index of [4, 5, 6]) {
          requireCondition(row.cells[index] === "—", `unpriced registry cell ${index + 1} is not —`);
        }
      }
      if (row.kind === "token" && row.priced === "true") {
        requireCondition(!unpricedSeen, "priced registry token appears after an unpriced token");
      }
    }
    return `${rowContracts.length} wallet registry row${rowContracts.length === 1 ? "" : "s"}`;
  });
}

async function checkSidebarLogoutContract(page, routePath, viewportName) {
  await check(`${viewportName} ${routePath} uses a POST-only sidebar logout control`, async () => {
    const form = page.locator('form.sidebar-logout-form[action="/api/auth/logout"]');
    requireCondition(await form.count() === 1, "expected exactly one sidebar logout form");
    const method = await form.getAttribute("method");
    requireCondition(method?.toLowerCase() === "post", `logout form method is ${method ?? "missing"}`);
    requireCondition(await page.locator('a[href="/api/auth/logout"]').count() === 0, "prefetchable logout link is still rendered");
    const button = form.locator('button.sidebar-logout[type="submit"][aria-label="Sign out"]');
    requireCondition(await button.count() === 1, "accessible logout submit button is missing or duplicated");
    requireCondition(await button.getAttribute("title") === "Sign out", "logout tooltip is missing");
    return "POST form · no logout link";
  });
}

async function checkReadonlyLivePage(page, routeName) {
  const text = await renderedText(page);

  await check(`${routeName} is labelled live and read-only`, async () => {
    requireCondition(/\blive\b/i.test(text), "live label is missing");
    requireCondition(/\bread[\s-]*only\b/i.test(text), "read-only label is missing");
  });

  await check(`${routeName} exposes no mutation forms or controls`, async () => {
    const unexpectedForms = await page.locator("form").evaluateAll((forms) => forms
      .map((form) => ({
        action: new URL(form.action).pathname,
        className: form.className,
        method: form.method.toLowerCase(),
      }))
      .filter((form) => !(
        form.action === "/api/auth/logout"
        && form.method === "post"
        && form.className.split(/\s+/).includes("sidebar-logout-form")
      )));
    requireCondition(unexpectedForms.length === 0, `unexpected form contracts: ${JSON.stringify(unexpectedForms)}`);

    const legacyMutationFields = page.locator([
      'button[type="submit"]',
      'input[name="currentPrice"]',
      'input[name="ticker"]',
      'input[name="fullName"]',
      'input[name="sourceLink"]',
      'input[name="rate"]',
      'select[name="currencyCode"]',
      'select[name="fromCurrency"]',
      'select[name="toCurrency"]',
      '[contenteditable="true"]',
    ].join(", "));
    const forbiddenMutationFields = await legacyMutationFields.evaluateAll((elements) => elements.filter((element) => {
      const form = element.closest("form");
      const allowedLogoutButton = element.matches('button.sidebar-logout[type="submit"][aria-label="Sign out"]')
        && form instanceof HTMLFormElement
        && new URL(form.action).pathname === "/api/auth/logout"
        && form.method.toLowerCase() === "post"
        && form.classList.contains("sidebar-logout-form");
      return !allowedLogoutButton;
    }).length);
    requireCondition(forbiddenMutationFields === 0, "a retired mutation field/control is rendered");

    const controlLabels = await page.locator("button, [role='button']").evaluateAll((elements) =>
      elements.map((element) => `${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""}`.trim()),
    );
    const mutationControl = controlLabels.find((label) => /\b(?:add|edit|save|update|delete|remove|recover|override)\b/i.test(label));
    requireCondition(!mutationControl, `manual mutation control rendered: ${JSON.stringify(mutationControl)}`);
  });
}

async function checkPortfolioContract(page) {
  await check("portfolio separates live value from legacy context", async () => {
    const text = await renderedText(page);
    requireCondition(/\blive\b/i.test(text), "live series label is missing");
    requireCondition(/\blegacy\b/i.test(text), "legacy context label is missing");

    const transition = page.locator(".portfolio-transition-note");
    requireCondition(await transition.count() === 1, "valuation transition note is missing or duplicated");
    const transitionText = compactText((await transition.textContent()) ?? "");
    requireCondition(/\blive\b/i.test(transitionText) && /\blegacy\b/i.test(transitionText), "transition note does not name both eras");
    requireCondition(/\b(?:boundary|baseline|unavailable)\b/i.test(transitionText), "transition note does not state the valuation boundary");

    const legendText = compactText((await page.locator(".chart-legend").textContent()) ?? "");
    requireCondition(/legacy/i.test(legendText), "legacy chart legend is missing");
    requireCondition(/live/i.test(legendText), "live chart legend is missing");
    requireCondition(/boundary/i.test(legendText), "valuation-boundary legend is missing");
  });

  await check("portfolio Plottable chart contract", async () => {
    const host = page.locator(".portfolio-chart-host");
    const hostCount = await host.count();
    requireCondition(hostCount <= 1, `expected at most one chart host, found ${hostCount}`);
    if (hostCount === 0) return "no chart host (live sources and Neon history may be unavailable)";

    await host.waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForFunction(
      () => document.querySelector(".portfolio-chart-host")?.getAttribute("data-chart-ready") === "true",
      undefined,
      { timeout: 15_000 },
    );

    const axisCount = await host.locator(".axis").count();
    requireCondition(axisCount >= 2, `expected at least two Plottable axes, found ${axisCount}`);

    const liveMarkerCount = await host.locator(".scatter-plot path").evaluateAll((paths) =>
      paths.filter((path) => {
        const fill = `${path.getAttribute("fill") ?? ""} ${getComputedStyle(path).fill}`;
        return /#38bdf8|rgb\(\s*56\s*,\s*189\s*,\s*248\s*\)/i.test(fill);
      }).length,
    );
    requireCondition(liveMarkerCount > 0, "live joined Plottable marker is missing");
    return `${axisCount} axes · ${liveMarkerCount} live marker${liveMarkerCount === 1 ? "" : "s"}`;
  });
}

async function auditRoute(browser, route, viewport) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  const browserErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));

  try {
    let response;
    const navigated = await check(`${viewport.name} ${route.path} responds successfully`, async () => {
      response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: "networkidle", timeout: 45_000 });
      requireCondition(response?.ok(), `HTTP ${response?.status() ?? "no response"}`);
      const finalPath = new URL(page.url()).pathname;
      requireCondition(route.finalPaths.includes(finalPath), `unexpected final route ${finalPath}`);
      return `HTTP ${response.status()} · ${finalPath}`;
    });
    if (!navigated) return;

    await check(`${viewport.name} ${route.path} uses the dark theme`, async () => {
      const theme = await page.evaluate(() => ({
        htmlDark: document.documentElement.classList.contains("bp6-dark"),
        bodyDark: document.body.classList.contains("bp6-dark"),
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
      }));
      requireCondition(theme.htmlDark && theme.bodyDark, "bp6-dark is missing from html/body");
      requireCondition(theme.colorScheme.includes("dark"), `computed color-scheme is ${theme.colorScheme || "unset"}`);
    });

    await check(`${viewport.name} ${route.path} has no horizontal body overflow`, async () => {
      const overflow = await page.evaluate(() => {
        const root = document.documentElement;
        const body = document.body;
        const availableWidth = root.clientWidth;
        const renderedWidth = Math.max(root.scrollWidth, body.scrollWidth);
        return { availableWidth, renderedWidth, overflowPixels: Math.max(0, renderedWidth - availableWidth) };
      });
      requireCondition(overflow.overflowPixels <= 1, `${overflow.renderedWidth}px content in ${overflow.availableWidth}px viewport`);
      return `${overflow.renderedWidth}px / ${overflow.availableWidth}px`;
    });

    await check(`${viewport.name} ${route.path} renders no undefined/null/NaN`, async () => {
      const text = await renderedText(page);
      const forbidden = text.match(/\b(?:undefined|null|NaN)\b/i)?.[0];
      requireCondition(!forbidden, `rendered ${forbidden}`);
    });

    await checkSidebarLogoutContract(page, route.path, viewport.name);

    if (viewport.name === "desktop") {
      if (route.name === "home") await checkHomeContract(page);
      if (route.name === "asset-list" || route.name === "exchange-rate") {
        await checkReadonlyLivePage(page, route.name);
      }
      if (route.name === "asset-list") {
        await checkOwnershipLanguage(page, "asset-list");
        await checkAssetWalletContract(page);
      }
      if (route.name === "portfolio") await checkPortfolioContract(page);
    }

    await page.waitForTimeout(200);
    await check(`${viewport.name} ${route.path} keeps the browser console clean`, async () => {
      requireCondition(browserErrors.length === 0, browserErrors.join(" | "));
    });
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  for (const viewport of viewports) {
    for (const route of routes) {
      await auditRoute(browser, route, viewport);
    }
  }
} finally {
  await browser.close();
}

const failures = results.filter((result) => !result.passed);
process.stdout.write(`\n${failures.length === 0 ? "PASS" : "FAIL"} | UI contract summary — ${results.length - failures.length}/${results.length} checks passed\n`);
if (failures.length > 0) process.exitCode = 1;
