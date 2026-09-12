import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { browserFixture, startUiFixtureServer } from "./ui-fixture-server.mjs";
import { auditCapitalFixtures } from "./capital-ui-checks.mjs";

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
const observedMascotSurfaceStates = new Set();
const observedMascotVideoSources = new Set();

const routes = [
  { name: "home", path: "/", finalPaths: ["/"] },
  { name: "asset-list", path: "/asset-list", finalPaths: ["/asset-list"] },
  { name: "portfolio", path: "/portfolio", finalPaths: ["/portfolio"] },
  { name: "exchange-rate", path: "/exchange-rate", finalPaths: ["/exchange-rate"] },
  // This compatibility route intentionally redirects to the live registry.
  { name: "asset-master", path: "/asset-master", finalPaths: ["/asset-master", "/asset-list"] },
  { name: "login", path: "/login", finalPaths: ["/login"] },
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

function captureBrowserConsole(problems, message) {
  const type = message.type();
  const body = message.text();
  if (type === "error" || (["warn", "warning"].includes(type) && /^(?:THREE\.|\[mascot-3d\]|WebGL:|\[\.WebGL-)/i.test(body))) {
    problems.push(`console ${type}: ${body}`);
  }
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

function parseGroupedCount(value, context) {
  const parsed = Number(value.replace(/,/g, ""));
  requireCondition(
    Number.isSafeInteger(parsed) && parsed >= 0,
    `invalid ${context}: ${JSON.stringify(value)}`,
  );
  return parsed;
}

function parseDisplayedUsd(value) {
  const text = compactText(value);
  if (text === "—") return null;

  const numericText = text.replace(/,/g, "").replace(/[^\d.+-]/g, "");
  requireCondition(numericText.length > 0, `USD value is not numeric: ${text}`);
  const parsed = Number(numericText);
  requireCondition(Number.isFinite(parsed), `USD value is not finite: ${text}`);
  return parsed;
}

async function assertNoSuppressionTrace(page) {
  const retired = ".home-wallet-filter, .home-wallet-hidden-count, .home-wallet-filtered-empty, .asset-wallet-filter, .asset-wallet-hidden-count, .asset-wallet-filtered-empty";
  requireCondition(await page.locator(retired).count() === 0, "retired wallet filter/count/threshold-empty element exists");
  const tracePattern = /\b(?:dust|unpriced)\b|hide (?:assets )?under \$1|hidden under \$1|all \d+ wallet assets are hidden/i;
  requireCondition(!tracePattern.test(await renderedText(page)), "rendered page discloses suppressed holdings");
  const hiddenCopy = await page.locator("body").evaluate((body) => {
    const attributes = Array.from(body.querySelectorAll("[aria-label], [title], [aria-description]"), (element) =>
      [element.getAttribute("aria-label"), element.getAttribute("title"), element.getAttribute("aria-description")].join(" "));
    const comments = [];
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_COMMENT);
    while (walker.nextNode()) comments.push(walker.currentNode.textContent ?? "");
    return [...attributes, ...comments].join(" ");
  });
  requireCondition(!tracePattern.test(hiddenCopy), "tooltip, accessible label or DOM comment discloses suppressed holdings");
  requireCondition(await page.locator('[data-pnl-eligibility="dust"], [data-pnl-eligibility="unpriced"]').count() === 0, "suppressed eligibility chip/row is rendered");
}

async function assertMarketRowValues(page) {
  const values = await page.locator('.pnl-asset-table tbody tr:not([data-manual-cash="true"]) [data-pnl-cell="value"], .asset-live-table tbody .asset-usd-value').evaluateAll((cells) =>
    cells.map((cell) => cell.firstChild?.textContent ?? ""));
  for (const text of values) {
    const value = parseDisplayedUsd(text);
    requireCondition(value !== null && value >= 1, `rendered market holding current value is ${text}`);
  }
  for (const [selector, column] of [[".home-wallet-panel", 4], [".asset-wallet-panel", 5]]) {
    if (await page.locator(selector).count()) await assertWalletRows(page.locator(selector), column);
  }
  return `${values.length} market registry/P&L current values checked; manual cash remains exempt`;
}

async function assertWalletRows(panel, usdColumn) {
  const rows = await panel.locator("tr[data-wallet-kind]").evaluateAll((elements) => elements.map((element) => ({
    kind: element.getAttribute("data-wallet-kind"),
    priced: element.getAttribute("data-wallet-priced"),
    cells: Array.from(element.querySelectorAll("td"), (cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim()),
  })));
  let tokenSeen = false;
  for (const row of rows) {
    requireCondition(["native", "token"].includes(row.kind), "wallet row has invalid data-wallet-kind");
    requireCondition(row.priced === "true", "wallet row is not marked priced");
    if (row.kind === "token") tokenSeen = true;
    if (row.kind === "native") requireCondition(!tokenSeen, "native row appears after a token row");
    const usd = parseDisplayedUsd(row.cells[usdColumn]);
    requireCondition(usd !== null && usd >= 1, `wallet current value is ${row.cells[usdColumn]}`);
    requireCondition(parseDisplayedUsd(row.cells[usdColumn - 1]) !== null, "displayed wallet holding has unknown price");
  }
  return `${rows.length} priced wallet rows in native/token order`;
}

async function readWalletInventoryExpectation(page) {
  const snapshot = page.locator('script[type="application/json"][data-wallet-inventory]');
  requireCondition(await snapshot.count() === 1, "same-page wallet inventory snapshot is missing or duplicated");
  const sources = JSON.parse(await snapshot.textContent());
  requireCondition(Array.isArray(sources) && sources.length === 2, "wallet inventory must contain native and token sources");
  for (const source of sources) {
    requireCondition(["live", "partial", "unavailable"].includes(source.status) && Array.isArray(source.rows), "wallet inventory source is malformed");
    for (const row of source.rows) {
      requireCondition(Number.isFinite(row.amount), "wallet inventory amount is not finite");
      for (const key of ["valueUsd", "valueThb"]) requireCondition(row[key] === null || Number.isFinite(row[key]), `wallet inventory ${key} is neither finite nor null`);
    }
  }
  const fullTotal = (key) => {
    const subtotals = sources.map((source) => {
      if (source.status === "unavailable") return null;
      const positive = source.rows.filter((row) => row.amount > 0);
      if (positive.length === 0) return source.status === "live" ? 0 : null;
      const known = positive.map((row) => row[key]).filter((value) => value !== null);
      return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
    });
    if (subtotals.every((value) => value === 0)) return 0;
    const known = subtotals.filter((value) => value !== null);
    return known.some((value) => value > 0) ? known.reduce((sum, value) => sum + value, 0) : null;
  };
  return {
    rows: sources.flatMap((source) => source.rows.map((row) => source.status !== "unavailable" && row.amount > 0
      ? row : { valueUsd: null, valueThb: null })),
    totalUsd: fullTotal("valueUsd"), totalThb: fullTotal("valueThb"),
  };
}

async function assertWalletTotals(panel, usdColumn, thbColumn, expected) {
  requireCondition(expected && Array.isArray(expected.rows), "full joined wallet inventory expectation is required");
  for (const key of ["totalUsd", "totalThb"]) requireCondition(expected[key] === null || Number.isFinite(expected[key]), `full joined wallet ${key} is neither finite nor null`);
  const table = panel.locator("table");
  if (await table.count() === 0) return;
  const rows = await table.locator("tbody tr[data-wallet-kind]").evaluateAll((elements) => elements.map((element) =>
    Array.from(element.querySelectorAll("td"), (cell) => cell.textContent ?? "")));
  const totalCells = await table.locator("tfoot td").allTextContents();
  requireCondition(/Total wallet \(priced\)/i.test(totalCells.join(" ")), "priced wallet total label is missing");
  for (const [column, totalIndex, label] of [[usdColumn, totalCells.length - 2, "USD"], [thbColumn, totalCells.length - 1, "THB"]]) {
    const values = rows.map((cells) => parseDisplayedUsd(cells[column]));
    const total = parseDisplayedUsd(totalCells[totalIndex]);
    const fullTotal = label === "USD" ? expected.totalUsd : expected.totalThb;
    const formatted = label === "USD" ? expectedUsd(fullTotal) : expectedThb(fullTotal);
    requireCondition(compactText(totalCells[totalIndex]) === formatted, `${label} wallet total differs from the full joined inventory`);
    if (values.some((value) => value === null)) {
      requireCondition(total === null, `${label} wallet total invents a value despite unavailable conversion`);
    } else if (total !== null) {
      const sum = values.reduce((result, value) => result + value, 0);
      const key = label === "USD" ? "valueUsd" : "valueThb";
      const suppressed = expected.rows.filter((row) => !Number.isFinite(row.valueUsd) || row.valueUsd < 1);
      const knownSuppressed = suppressed.filter((row) => Number.isFinite(row[key]));
      requireCondition(knownSuppressed.every((row) => row.valueUsd >= 0 && row.valueUsd < 1), "a suppressed known holding is outside the strict sub-$1 boundary");
      const suppressedSum = knownSuppressed.reduce((result, row) => result + row[key], 0);
      requireCondition(Math.abs(total - sum - suppressedSum) <= (rows.length + 1) * 0.005 + 0.000001,
        `${label} total/displayed difference ${total - sum} differs from suppressed holdings ${suppressedSum}`);
      const displayedRawSum = expected.rows.filter((row) => Number.isFinite(row.valueUsd) && row.valueUsd >= 1)
        .reduce((result, row) => result + (row[key] ?? 0), 0);
      if (suppressedSum > 0) requireCondition(rows.length < expected.rows.length && fullTotal >= displayedRawSum,
        `${label} displayed rows are not a strict subset of the full nonzero total`);
    } else {
      requireCondition(await panel.locator(".is-unavailable").count() > 0, `${label} wallet total is unknown despite complete priced rows`);
    }
  }
}

async function assertWalletTotalNegativeControls(page, surface) {
  const panel = page.locator(surface === "home" ? ".home-wallet-panel" : ".asset-wallet-panel");
  const usdColumn = surface === "home" ? 4 : 5;
  const thbColumn = usdColumn + 1;
  const expected = await readWalletInventoryExpectation(page);
  await assertWalletTotals(panel, usdColumn, thbColumn, expected);
  for (const [key, footerOffset, formatter] of [["valueUsd", 2, expectedUsd], ["valueThb", 1, expectedThb]]) {
    const totalKey = key === "valueUsd" ? "totalUsd" : "totalThb";
    const known = expected.rows.find((row) => row.valueUsd > 0 && row.valueUsd < 1 && Number.isFinite(row[key]));
    requireCondition(known && known[key] > 0, "wallet negative control requires a known positive suppressed holding");
    requireCondition(expected.rows.some((row) => row.valueUsd === null), "wallet negative control requires a null-valued holding");
    const footer = panel.locator("tfoot td");
    const cell = footer.nth(await footer.count() - footerOffset);
    const original = await cell.innerHTML();
    const displayedSum = expected.rows.filter((row) => Number.isFinite(row.valueUsd) && row.valueUsd >= 1)
      .reduce((sum, row) => sum + row[key], 0);
    for (const [name, wrongTotal] of [["inflated by 1,000,000", displayedSum + 1_000_000], ["missing a known suppressed holding", expected[totalKey] - known[key]]]) {
      let rejection = "";
      try {
        await cell.evaluate((element, value) => { element.textContent = value; }, formatter(wrongTotal));
        await assertWalletTotals(panel, usdColumn, thbColumn, await readWalletInventoryExpectation(page));
      } catch (error) {
        rejection = error instanceof Error ? error.message : String(error);
      } finally {
        await cell.evaluate((element, html) => { element.innerHTML = html; }, original);
      }
      requireCondition(rejection === `${key === "valueUsd" ? "USD" : "THB"} wallet total differs from the full joined inventory`,
        `${key} footer ${name} was not rejected by the live full-inventory equality: ${rejection || "accepted"}`);
    }
  }
  await assertWalletTotals(panel, usdColumn, thbColumn, await readWalletInventoryExpectation(page));
  return "USD and THB: displayed sum + 1,000,000 and omission of one known $0.999 holding both rejected; null holding contributes nothing; original footer restored";
}

async function readHomeWalletSummaryCount(page) {
  const summary = page.locator("[data-wallet-summary-count]");
  requireCondition(await summary.count() === 1, "full-set wallet summary is missing or duplicated");
  const text = compactText((await summary.textContent()) ?? "");
  const match = text.match(/([\d,]+)\s+wallet assets?\b/i);
  requireCondition(match, `visible wallet summary count is missing: ${text}`);
  const count = parseGroupedCount(match[1], "wallet summary count");
  requireCondition(
    await summary.getAttribute("data-wallet-summary-count") === String(count),
    "wallet summary count differs from its visible label",
  );
  return count;
}

async function readHomeWalletPanelCounts(panel) {
  const nativeAttribute = await panel.getAttribute("data-wallet-native-count");
  const tokenAttribute = await panel.getAttribute("data-wallet-token-count");
  requireCondition(nativeAttribute !== null, "wallet panel native total is missing");
  requireCondition(tokenAttribute !== null, "wallet panel token total is missing");
  return {
    native: parseGroupedCount(nativeAttribute, "wallet panel native total"),
    token: parseGroupedCount(tokenAttribute, "wallet panel token total"),
  };
}

async function readHomeWalletHeaderCounts(panel) {
  const text = compactText((await panel.locator(".panel-count").textContent()) ?? "");
  const match = text.match(/([\d,]+)\s+NATIVE\s*·\s*([\d,]+)\s+TOKENS/i);
  requireCondition(match, `wallet header counts are malformed: ${text}`);
  return {
    native: parseGroupedCount(match[1], "visible native count"),
    token: parseGroupedCount(match[2], "visible token count"),
  };
}

async function checkOwnershipLanguage(page, routeName) {
  const text = await renderedText(page);

  await check(`${routeName} renders no owner/investor names or language`, async () => {
    for (const owner of removedOwnerNames) {
      requireCondition(!new RegExp(`\\b${owner}\\b`).test(text), `${owner} is rendered`);
    }
    for (const retiredName of retiredInvestorNames) {
      requireCondition(!text.includes(retiredName), `retired demo investor ${retiredName} is rendered`);
    }
    requireCondition(!text.toUpperCase().includes(removedOwnershipLabel), `${removedOwnershipLabel} is rendered`);
    requireCondition(!/\b(?:investors?|owners?|ownership)\b/i.test(text), "owner/investor language is rendered");
    requireCondition(!/\b(?:pending\s+migration|migration|demo(?:nstration)?)\b/i.test(text), "migration/demo wording is rendered");
  });
}

async function checkPnlContract(page) {
  await check("home follows the P&L-center section order", async () => {
    const selectors = [
      ".pnl-value-hero", ".pnl-metric-strip", ".pnl-performance", ".pnl-allocation",
      ".pnl-calendar", ".pnl-assets", ".pnl-source-strip",
    ];
    for (const selector of selectors) {
      requireCondition(await page.locator(selector).count() === 1, `${selector} is missing or duplicated`);
    }
    const ordered = await page.evaluate((sectionSelectors) => sectionSelectors.every((selector, index) => {
      if (index === 0) return true;
      const previous = document.querySelector(sectionSelectors[index - 1]);
      const current = document.querySelector(selector);
      return Boolean(previous && current && (previous.compareDocumentPosition(current) & Node.DOCUMENT_POSITION_FOLLOWING));
    }), selectors);
    requireCondition(ordered, "P&L-center sections differ from the brief's order");
  });

  await check("home P&L summary distinguishes none, partial and complete honestly", async () => {
    const summary = page.locator("[data-pnl-summary]");
    requireCondition(await summary.count() === 1, "P&L summary is missing or duplicated");
    const state = await summary.getAttribute("data-pnl-state");
    requireCondition(["none", "partial", "complete"].includes(state), `invalid P&L summary state ${state}`);
    const text = compactText((await summary.textContent()) ?? "");
    requireCondition(/P&L \(recorded\)/i.test(text), "P&L is not identified as recorded");
    if (state === "none") {
      const unreconciledCount = await page.locator('.pnl-assets tr[data-pnl-eligibility="unreconciled"]').count();
      requireCondition(unreconciledCount > 0
        ? /Recorded P&L unavailable.*unreconciled holdings are excluded/i.test(text)
        : /No recorded cost basis/i.test(text), "unavailable P&L explanation does not match the known basis evidence");
      requireCondition(/P&L unavailable|P&L not computable/i.test(text), "P&L unavailability is not explicit");
      requireCondition(text.includes("—"), "unknown P&L is not displayed as —");
      requireCondition(!/(?:\$|฿|USD\s*|THB\s*)[+-]?0(?:\.0+)?(?![\d.])|[+-]?0(?:\.0+)?%/.test(text), "unknown P&L is displayed as zero");
    } else if (state === "partial") {
      requireCondition(/Partial P&L/i.test(text), "partial eligible-subset P&L is not identified");
      requireCondition(/\d[\d,]* of \d[\d,]* holdings have recorded basis/i.test(text), "partial P&L omits its holding coverage");
    } else {
      requireCondition(/complete|all holdings/i.test(text), "complete P&L coverage is not identified");
    }
    const daily = page.locator("[data-daily-change]");
    requireCondition(await daily.count() === 1, "daily-change state is missing or duplicated");
    const dailyState = await daily.getAttribute("data-daily-change");
    requireCondition(["available", "unavailable"].includes(dailyState), "daily-change availability is invalid");
    if (dailyState === "unavailable") {
      const metric = compactText((await daily.locator(".pnl-metric-line").textContent()) ?? "");
      requireCondition(metric.includes("—") && !/\d/.test(metric), "unavailable daily change invents a value or percentage");
      requireCondition(/Awaiting comparable snapshots/i.test((await daily.textContent()) ?? ""), "unavailable daily change lacks its history explanation");
    }
    return `P&L state: ${state}`;
  });

  await check("home per-asset P&L keeps unknown basis null and exclusions explicit", async () => {
    const table = page.locator(".pnl-assets");
    const rows = await table.locator("tr[data-basis-status]").evaluateAll((elements) => elements.map((element) => ({
      status: element.getAttribute("data-basis-status"),
      eligibility: element.getAttribute("data-pnl-eligibility"),
      valueUsd: element.querySelector('[data-pnl-cell="value"]')?.firstChild?.textContent ?? "",
      value: element.querySelector('[data-pnl-cell="value"]')?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      basis: element.querySelector('[data-pnl-cell="basis"]')?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      pnl: element.querySelector('[data-pnl-cell="pnl"]')?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      text: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
      note: element.getAttribute("title") || element.querySelector("[title]")?.getAttribute("title"),
    })));
    if (rows.length === 0) {
      const text = compactText((await table.textContent()) ?? "");
      requireCondition(/unavailable|no holdings|no joined holdings|no asset rows/i.test(text), "empty per-asset table lacks an explicit explanation");
      return "no joined rows; unavailable/empty state remains explicit";
    }
    for (const row of rows) {
      requireCondition(["t212-live", "onchain-derived", "arrival-priced", "airdrop-free", "not-recorded"].includes(row.status), `invalid basisStatus ${row.status}`);
      requireCondition(["eligible", "not-recorded", "unreconciled"].includes(row.eligibility), `invalid pnlEligibility ${row.eligibility}`);
      requireCondition(row.value.length > 0 && row.basis.length > 0 && row.pnl.length > 0, "P&L row omits value/basis/P&L cells");
      requireCondition(row.text.includes(row.status), `basisStatus chip ${row.status} is not visible`);
      requireCondition(Boolean(row.note?.trim()), `basis note tooltip is missing for ${row.status}`);
      if (row.status === "not-recorded") {
        requireCondition(/basis not recorded/i.test(row.text), "not-recorded row lacks an honest basis label");
        for (const [name, value] of [["basis", row.basis], ["P&L", row.pnl]]) {
          requireCondition(value.includes("—"), `unknown ${name} does not display —`);
          requireCondition(!/(?:\$|฿|USD\s*|THB\s*)[+-]?0(?:\.0+)?(?![\d.])/.test(value), `unknown ${name} displays zero`);
          requireCondition(!/[+-]?\d+(?:\.\d+)?%/.test(value), `unknown ${name} displays a percentage`);
        }
        requireCondition(row.eligibility !== "eligible", "not-recorded holding is marked eligible");
      }
      if (row.eligibility !== "eligible") {
        requireCondition(/excluded/i.test(row.text), `${row.eligibility} row does not explain its exclusion`);
      }
      if (row.eligibility === "unreconciled") {
        requireCondition(new RegExp(row.eligibility, "i").test(row.text), `${row.eligibility} is not visually distinguished`);
      }
      const currentValue = parseDisplayedUsd(row.valueUsd);
      requireCondition(currentValue !== null && currentValue >= 1, "market P&L row has unknown or sub-threshold current value");
      if (row.status === "airdrop-free") {
        requireCondition(/(?:\$|USD\s*)0(?:\.0+)?(?![\d.])/.test(row.basis), "verified free basis is not shown as zero USD");
        requireCondition(!/[+-]?\d+(?:\.\d+)?%/.test(row.pnl), "zero-basis acquisition invents a P&L percentage");
      }
    }
    const summaryState = await page.locator("[data-pnl-summary]").getAttribute("data-pnl-state");
    if (rows.every((row) => row.eligibility !== "eligible")) {
      requireCondition(summaryState === "none", "zero eligible holdings do not produce unavailable P&L");
    }
    if (summaryState === "complete") {
      requireCondition(rows.every((row) => row.eligibility === "eligible"), "complete P&L includes excluded holdings");
    }
    return `${rows.length} joined rows · ${rows.filter((row) => row.status === "not-recorded").length} basis not recorded`;
  });

  await check("home performance uses snapshot history or the honest empty state", async () => {
    const performance = page.locator(".pnl-performance");
    const text = compactText((await performance.textContent()) ?? "");
    requireCondition(/Performance/i.test(text), "performance title is missing");
    const periods = performance.getByRole("group", { name: "Performance period", exact: true });
    requireCondition(await periods.count() === 1, "accessible performance period group is missing");
    for (const label of ["1M", "3M", "All"]) {
      requireCondition(await periods.getByRole("button", { name: label, exact: true }).count() === 1, `period ${label} is missing or duplicated`);
    }
    const count = await performance.getAttribute("data-history-count");
    requireCondition(count !== null, "performance snapshot count is missing");
    const historyCount = parseGroupedCount(count, "performance history count");
    if (historyCount === 0) {
      requireCondition(/history starts today/i.test(text), "empty performance invents history or lacks the history-starts-today label");
      for (const button of await periods.getByRole("button").all()) {
        requireCondition(await button.isDisabled(), "empty-history period control is enabled");
      }
      requireCondition(await performance.locator(".axis").count() === 0, "empty performance renders chart axes with no observations");
      return "history starts today · empty period controls disabled";
    }
    const summaryBefore = compactText((await page.locator("[data-pnl-summary]").textContent()) ?? "");
    for (const label of ["1M", "3M", "All"]) {
      const button = periods.getByRole("button", { name: label, exact: true });
      requireCondition(await button.isEnabled(), `populated-history period ${label} is disabled`);
      await button.click();
      await page.waitForFunction(() => {
        const card = document.querySelector(".pnl-performance");
        const chart = card?.querySelector("[data-chart-ready]");
        return chart?.getAttribute("data-chart-ready") === "true"
          || (!chart && /no snapshots? in (?:this|the selected) period|no recorded snapshots? in/i.test(card?.textContent ?? ""));
      }, undefined, { timeout: 15_000 });
      if (await performance.locator("[data-chart-ready]").count() > 0) {
        requireCondition(await performance.locator(".axis").count() >= 2, "snapshot performance has no Plottable axes");
      } else {
        requireCondition(label !== "All", "All hides existing snapshot history");
      }
      requireCondition(compactText((await page.locator("[data-pnl-summary]").textContent()) ?? "") === summaryBefore, "period display filter changed current P&L totals");
    }
    return `${historyCount} snapshots · period controls preserve current totals`;
  });

  await check("home allocation remains value-based even when P&L is unavailable", async () => {
    const allocation = page.locator(".pnl-allocation");
    const text = compactText((await allocation.textContent()) ?? "");
    requireCondition(/Allocation by class/i.test(text), "value allocation title is missing");
    for (const label of ["Stocks Port", "Crypto Port"]) {
      requireCondition(new RegExp(label, "i").test(text), `allocation class ${label} is missing`);
    }
    requireCondition(/value|USD/i.test(text), "allocation is not identified as current value");
    const labels = await allocation.locator(".pnl-allocation-item > div:first-child > span").allTextContents();
    requireCondition(JSON.stringify(labels.map(compactText)) === JSON.stringify(["Stocks Port", "Crypto Port"]), "allocation must contain exactly the two grouped classes in order");
    const keys = await page.locator("[data-value-class]").evaluateAll((rows) => rows.map((row) => row.dataset.valueClass));
    requireCondition(JSON.stringify(keys) === JSON.stringify(["t212", "crypto"]), "value-class keys must be exactly t212/crypto");
    return JSON.stringify({ keys, allocation: await allocation.locator(".pnl-allocation-item").allTextContents() });
  });

  await check("home calendar displays recorded coverage or an honest empty month", async () => {
    const calendar = page.locator(".pnl-calendar");
    const text = compactText((await calendar.textContent()) ?? "");
    requireCondition(/P&L calendar/i.test(text), "P&L calendar title is missing");
    const count = await calendar.getAttribute("data-history-count");
    requireCondition(count !== null, "calendar snapshot count is missing");
    const historyCount = parseGroupedCount(count, "calendar history count");
    const days = calendar.locator("[data-snapshot-date]");
    requireCondition(await days.count() === historyCount, "calendar snapshot count differs from its recorded days");
    if (historyCount === 0) {
      requireCondition(/history starts today|no snapshots|no recorded snapshots/i.test(text), "empty month has no honest history explanation");
      return "no recorded days; no historical P&L invented";
    }
    for (const day of await days.all()) {
      const coverage = await day.getAttribute("data-snapshot-coverage");
      requireCondition(["complete", "partial"].includes(coverage), "recorded calendar day lacks actual coverage");
      const dayText = compactText((await day.textContent()) ?? "");
      const accessibleText = `${dayText} ${await day.getAttribute("aria-label") ?? ""} ${await day.getAttribute("title") ?? ""}`;
      requireCondition(new RegExp(coverage, "i").test(accessibleText), "calendar coverage is not readable");
      requireCondition(/USD/i.test(accessibleText) && /THB/i.test(accessibleText), "calendar day omits explicit USD/THB units");
      if (await day.getAttribute("data-pnl-available") === "false") {
        requireCondition(dayText.includes("—"), "unknown calendar P&L does not display —");
        const pnlLabel = ((await day.getAttribute("aria-label")) ?? "").split(/\bValue\b/)[0];
        requireCondition(!/(?:\$|฿|USD\s*|THB\s*)[+-]?0(?:\.0+)?(?![\d.])/.test(pnlLabel), "unknown calendar P&L displays zero");
      }
    }
    return `${historyCount} recorded days with per-day coverage`;
  });

  await check("home retains all seven source statuses and unavailable-source honesty", async () => {
    const sources = page.locator(".pnl-source-strip [data-source-key]");
    requireCondition(await sources.count() === 9, `expected nine sources, found ${await sources.count()}`);
    const keys = await sources.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-source-key")));
    requireCondition(new Set(keys).size === 9, "source keys are duplicated");
    for (const key of ["t212Summary", "t212Positions", "nfts", "fiatFx", "ethPrice", "walletNative", "walletTokens", "manualHoldings", "capital"]) requireCondition(keys.includes(key), `missing source ${key}`);
    for (const source of await sources.all()) {
      requireCondition(/^(?:live|partial|unavailable)$/i.test(compactText((await source.locator(".live-source-badge").textContent()) ?? "")), "source has no readable availability status");
    }
    const allUnavailable = await sources.evaluateAll((elements) => elements.every((element) => element.querySelector(".live-source-badge")?.textContent?.trim() === "unavailable"));
    if (allUnavailable) {
      requireCondition(await page.locator("[data-pnl-summary]").getAttribute("data-pnl-state") === "none", "unavailable sources imply computable P&L");
      requireCondition(/No recorded cost basis/i.test((await page.locator("[data-pnl-summary]").textContent()) ?? ""), "unavailable source fixture lacks the honest P&L empty state");
    }
    return allUnavailable ? "all nine sources unavailable · P&L remains honest" : "seven original plus two ledger source statuses retained";
  });
}

async function checkHomeContract(page) {
  await check("home permits value allocation while banning retired ownership copy", async () => {
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

  await check("home renders the USD-primary value hero and P&L metric strip", async () => {
    const hero = page.locator(".pnl-value-hero");
    requireCondition(await hero.count() === 1, "value hero is missing or duplicated");
    const text = compactText((await hero.textContent()) ?? "");
    requireCondition(/Portfolio value/i.test(text), "portfolio value label is missing");
    requireCondition(/live joined portfolio/i.test(text), "live joined portfolio label is missing");
    const primary = hero.locator('[data-value-currency="USD"]');
    requireCondition(await primary.count() === 1, "value hero lacks its primary USD value");
    requireCondition(/THB/i.test((await hero.locator(".pnl-secondary").textContent()) ?? ""), "value hero lacks its secondary THB value");
    const usdFirst = await primary.evaluate((element) => {
      const secondary = element.closest(".pnl-value-hero")?.querySelector(".pnl-secondary");
      return Boolean(secondary && (element.compareDocumentPosition(secondary) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    requireCondition(usdFirst, "THB precedes USD in the value hero");
    for (const label of ["Stocks Port", "Crypto Port"]) {
      requireCondition(new RegExp(label, "i").test(text), `class mini-value ${label} is missing`);
    }
    const strip = page.locator(".pnl-metric-strip");
    requireCondition(await strip.count() === 1, "P&L metric strip is missing or duplicated");
    const stripText = compactText((await strip.textContent()) ?? "");
    requireCondition(/P&L \(recorded\)/i.test(stripText), "recorded P&L metric is missing");
    requireCondition(/Daily change/i.test(stripText), "daily-change metric is missing");
    await readHomeWalletSummaryCount(page);
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

  await check("H1 home wallet has no retired filter controls or suppression traces", async () => {
    await assertNoSuppressionTrace(page);
    requireCondition(await page.locator('.home-wallet-panel input, .home-wallet-panel button, .home-wallet-panel select').count() === 0, "wallet panel still exposes a control");
  });

  await check("H2 home wallet headers and hero count exactly the displayable rows", async () => {
    const panel = page.locator(".home-wallet-panel");
    const counts = await readHomeWalletPanelCounts(panel);
    const header = await readHomeWalletHeaderCounts(panel);
    const nativeCount = await panel.locator('tr[data-wallet-kind="native"]').count();
    const tokenCount = await panel.locator('tr[data-wallet-kind="token"]').count();
    requireCondition(counts.native === nativeCount && counts.token === tokenCount, "wallet data counts differ from displayed native/token rows");
    requireCondition(header.native === nativeCount && header.token === tokenCount, "wallet header counts differ from displayed native/token rows");
    requireCondition(await readHomeWalletSummaryCount(page) === nativeCount + tokenCount, "hero wallet count differs from displayed rows");
    await assertWalletRows(panel, 4);
    if (nativeCount + tokenCount === 0) {
      requireCondition(await panel.locator(".home-wallet-table").count() === 0, "empty wallet renders a holding table");
      requireCondition(compactText(await panel.locator(".home-empty strong").innerText()) === "No wallet holdings to display in this snapshot.", "wallet neutral empty copy changed");
    }
    return `${nativeCount} native + ${tokenCount} tokens = header and hero counts`;
  });

  await check("H3 home wallet totals equal the full joined inventory and remain stable", async () => {
    const panel = page.locator(".home-wallet-panel");
    const rowsBefore = await panel.locator("tr[data-wallet-kind]").allTextContents();
    const totalsBefore = await panel.locator("tfoot").allTextContents();
    await assertWalletTotals(panel, 4, 5, await readWalletInventoryExpectation(page));
    const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth);
    requireCondition(overflow <= 1, `wallet creates ${overflow}px of horizontal body overflow`);
    requireCondition(JSON.stringify(await panel.locator("tr[data-wallet-kind]").allTextContents()) === JSON.stringify(rowsBefore), "wallet rows changed during the read-only audit");
    await assertNoSuppressionTrace(page);
    requireCondition(JSON.stringify(await panel.locator("tfoot").allTextContents()) === JSON.stringify(totalsBefore), "wallet totals changed during the read-only audit");
    return `${rowsBefore.length} displayed rows; USD/THB totals equal the independently summed full inventory`;
  });

  await check("home wallet rows keep native/token order and exclude unknown current values", async () => {
    return assertWalletRows(page.locator(".home-wallet-panel"), 4);
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

  await check("asset-list wallet registry has no filter and counts only displayed holdings", async () => {
    const panel = page.locator(".asset-wallet-panel");
    await assertNoSuppressionTrace(page);
    requireCondition(await panel.locator("input, button, select").count() === 0, "wallet registry still exposes a control");
    const rowCount = await panel.locator("tr[data-wallet-kind]").count();
    const rowsBefore = await panel.locator("tr[data-wallet-kind]").allTextContents();
    const totalsBefore = await panel.locator("tfoot").allTextContents();
    const summary = compactText((await page.locator(".asset-registry-kpi").last().textContent()) ?? "");
    const match = summary.match(/([\d,]+)\s+Crypto Port assets?\b/i);
    const nftCount = await page.locator(".asset-nft-table tbody tr").count();
    requireCondition(match && parseGroupedCount(match[1], "registry crypto count") === rowCount + nftCount, "registry crypto summary differs from displayed NFT and wallet rows");
    requireCondition(compactText((await panel.locator(".asset-wallet-count .panel-count").textContent()) ?? "") === `${rowCount} ASSETS`, "registry header differs from displayed rows");
    await assertWalletRows(panel, 5);
    await assertWalletTotals(panel, 5, 6, await readWalletInventoryExpectation(page));
    if (rowCount === 0) {
      requireCondition(await panel.locator(".asset-wallet-table").count() === 0, "empty registry renders a holding table");
      requireCondition(compactText(await panel.locator(".asset-empty-state strong").innerText()) === "No wallet holdings to display in this snapshot.", "registry neutral empty copy changed");
    }
    requireCondition(JSON.stringify(await panel.locator("tr[data-wallet-kind]").allTextContents()) === JSON.stringify(rowsBefore), "registry rows changed during the read-only audit");
    requireCondition(JSON.stringify(await panel.locator("tfoot").allTextContents()) === JSON.stringify(totalsBefore), "registry totals changed during the read-only audit");
    return `${rowCount} displayed rows = registry header and summary; USD/THB totals equal the independently summed full inventory`;
  });

  await check("asset-list wallet rows keep native/token order and exclude unknown current values", async () => {
    return assertWalletRows(page.locator(".asset-wallet-panel"), 5);
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
}

async function checkNoMutationControls(page, routeName) {
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

    const bannedNames = ["currentPrice", "ticker", "fullName", "sourceLink", "rate", "currencyCode", "fromCurrency", "toCurrency"];
    const legacyMutationFields = page.locator([
      'button[type="submit"]',
      ...bannedNames.flatMap((name) => [`input[name="${name}"]`, `select[name="${name}"]`]),
      '[contenteditable]:not([contenteditable="false"])',
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

    const controlLabels = await page.locator("button, [role='button'], input[type='button'], input[type='submit'], a").evaluateAll((elements) =>
      elements.map((element) => `${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""}`.trim()),
    );
    const mutationControl = controlLabels.find((label) => /\b(?:add|edit|save|update|delete|remove|recover|override)\b/i.test(label));
    requireCondition(!mutationControl, `manual mutation control rendered: ${JSON.stringify(mutationControl)}`);
  });
}

const mascotMoods = ["calm", "happy", "excited", "thinking", "worried", "sad", "sleepy", "proud", "alert"];
const mascotMotions = {
  calm: "idle",
  happy: "happy_clap",
  excited: "excited_bounce",
  thinking: "idle",
  worried: "idle",
  sad: "idle",
  sleepy: "idle",
  proud: "happy_clap",
  alert: "idle",
};

function mascotMediaStem(clip) {
  return clip.replaceAll("_", "-");
}

async function installMascotSurfaceAudit(page) {
  await page.addInitScript(() => {
    window.__mascotSurfaceAudit = {
      hydrationSeen: false,
      inspections: 0,
      states: [],
      videoPlaybackProofs: [],
      violations: [],
    };
    const start = () => {
      const audit = window.__mascotSurfaceAudit;
      const inspect = () => {
        const companion = document.querySelector("[data-mascot-companion]");
        if (!companion?.hasAttribute("data-mascot-hydrated")) return;
        audit.hydrationSeen = true;
        audit.inspections++;
        const state = companion.getAttribute("data-mascot-3d");
        const canvas = companion.querySelector("[data-mascot-canvas]");
        const video = companion.querySelector("[data-mascot-video]");
        const sprite = companion.querySelector(".mascot-sprite");
        const canvasCount = companion.querySelectorAll("[data-mascot-canvas]").length;
        const videoCount = companion.querySelectorAll("[data-mascot-video]").length;
        const stateLabel = state ?? "unset";
        if (!audit.states.includes(stateLabel)) audit.states.push(stateLabel);
        const visiblyOccupiesChip = (element) => {
          if (!(element instanceof HTMLElement)) return false;
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0
            && style.display !== "none" && style.visibility !== "hidden"
            && Number(style.opacity) > 0;
        };
        // The off-DOM canvas is appended immediately before the React state
        // handoff removes video, so a brief two-surface overlap is continuous
        // motion rather than a static gap. Settled-state checks remain exact.
        const hasVisibleMotionSurface = (state === "on" && canvasCount >= 1 && visiblyOccupiesChip(canvas))
          || (state === "video" && videoCount >= 1 && visiblyOccupiesChip(video));
        const spriteHidden = sprite instanceof HTMLElement && getComputedStyle(sprite).opacity === "0";
        if ((!hasVisibleMotionSurface || !spriteHidden) && audit.violations.length < 10) {
          audit.violations.push({ state: stateLabel, canvasCount, videoCount,
            canvasVisible: visiblyOccupiesChip(canvas), videoVisible: visiblyOccupiesChip(video), spriteHidden });
        }
      };
      new MutationObserver(inspect).observe(document.documentElement, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ["data-mascot-3d", "data-mascot-hydrated"],
      });
      inspect();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  });
}

async function assertNoStaticMascotAfterMotion(page) {
  const audit = await page.evaluate(() => window.__mascotSurfaceAudit);
  for (const state of audit?.states ?? []) observedMascotSurfaceStates.add(state);
  requireCondition(audit?.hydrationSeen && audit.inspections > 0,
    "mascot motion-surface audit never observed the explicit client hydration boundary");
  requireCondition(audit.violations.length === 0,
    `mascot lost its motion surface after hydration: ${JSON.stringify(audit.violations)}`);
  if (audit.states.includes("video")) {
    requireCondition(audit.videoPlaybackProofs.length > 0,
      "hydrated video surface was visible but never proved advancing playback");
  }
  return `hydration boundary retained only visible motion surfaces; ${audit.videoPlaybackProofs.length} advancing-video proof(s)`;
}

async function assertMascotVideoPlaying(page, expectedClip) {
  const expectedWebm = `/mascot/motion-${mascotMediaStem(expectedClip)}.webm`;
  await page.waitForFunction(({ clip, webm }) => {
    const video = document.querySelector("[data-mascot-video]");
    if (!(video instanceof HTMLVideoElement)) return false;
    let currentPath = "";
    try { currentPath = new URL(video.currentSrc).pathname; } catch {}
    return video.getAttribute("data-mascot-motion") === clip
      && currentPath === webm
      && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && video.videoWidth === 720
      && video.videoHeight === 720
      && !video.paused
      && video.error === null;
  }, { clip: expectedClip, webm: expectedWebm }, { timeout: 20_000 });

  const before = await page.locator("[data-mascot-video]").evaluate((video) => ({
    currentTime: video.currentTime,
    duration: video.duration,
  }));
  await page.waitForFunction(({ startedAt, duration }) => {
    const video = document.querySelector("[data-mascot-video]");
    if (!(video instanceof HTMLVideoElement) || video.paused || video.error) return false;
    const elapsed = video.currentTime >= startedAt
      ? video.currentTime - startedAt
      : video.currentTime + duration - startedAt;
    return elapsed >= 0.08;
  }, { startedAt: before.currentTime, duration: before.duration }, { timeout: 10_000 });

  const detail = await page.locator("[data-mascot-video]").evaluate((video) => ({
    currentSrc: new URL(video.currentSrc).pathname,
    currentTime: video.currentTime,
    duration: video.duration,
    readyState: video.readyState,
    width: video.videoWidth,
    height: video.videoHeight,
    paused: video.paused,
    error: video.error ? { code: video.error.code, message: video.error.message } : null,
  }));
  requireCondition(Number.isFinite(detail.duration) && Math.abs(detail.duration - 7) <= 0.05,
    `fallback video duration is ${detail.duration}, expected 7.00 seconds`);
  requireCondition(!detail.paused && detail.error === null, `fallback video is not playing cleanly: ${JSON.stringify(detail)}`);
  await page.evaluate(({ clip, source, currentTime }) => {
    const audit = window.__mascotSurfaceAudit;
    if (!audit) return;
    audit.videoPlaybackProofs.push({ clip, source, currentTime });
  }, { clip: expectedClip, source: detail.currentSrc, currentTime: detail.currentTime });
  observedMascotVideoSources.add(detail.currentSrc);
  return `${detail.currentSrc} · readyState ${detail.readyState} · 720×720 · ${detail.currentTime.toFixed(2)}s/7.00s advancing`;
}

async function assertMascotScreenshotMotion(page, delayMs = 700) {
  const chip = page.locator(".mascot-chip");
  const before = await chip.screenshot({ animations: "allow" });
  await page.waitForTimeout(delayMs);
  const after = await chip.screenshot({ animations: "allow" });
  const diff = await page.evaluate(async ({ first, second }) => {
    const decode = async (base64) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      bitmap.close();
      return { width: canvas.width, height: canvas.height, pixels: [...pixels] };
    };
    const [one, two] = await Promise.all([decode(first), decode(second)]);
    if (one.width !== two.width || one.height !== two.height) {
      return { changedPixels: 0, totalPixels: 0, dimensions: `${one.width}x${one.height}/${two.width}x${two.height}` };
    }
    let changedPixels = 0;
    for (let index = 0; index < one.pixels.length; index += 4) {
      if (Math.abs(one.pixels[index] - two.pixels[index]) > 2
        || Math.abs(one.pixels[index + 1] - two.pixels[index + 1]) > 2
        || Math.abs(one.pixels[index + 2] - two.pixels[index + 2]) > 2
        || Math.abs(one.pixels[index + 3] - two.pixels[index + 3]) > 2) changedPixels++;
    }
    return { changedPixels, totalPixels: one.width * one.height, dimensions: `${one.width}x${one.height}` };
  }, { first: before.toString("base64"), second: after.toString("base64") });
  const minimumChangedPixels = Math.max(20, Math.ceil(diff.totalPixels * 0.001));
  requireCondition(diff.totalPixels > 0 && diff.changedPixels >= minimumChangedPixels,
    `video fallback screenshots ${delayMs}ms apart changed ${diff.changedPixels}/${diff.totalPixels} pixels (${diff.dimensions})`);
  return `${diff.changedPixels}/${diff.totalPixels} pixels changed across ${delayMs}ms (${diff.dimensions})`;
}

async function assertMascot(page, expectedMood) {
  const companion = page.locator("[data-mascot-companion]");
  requireCondition(await companion.count() === 1 && await companion.isVisible(), "mascot is missing, hidden or duplicated");
  const mood = await companion.getAttribute("data-mascot-mood");
  requireCondition(mascotMoods.includes(mood), `unknown mascot mood ${mood}`);
  if (expectedMood) requireCondition(mood === expectedMood, `expected ${expectedMood}, rendered ${mood}`);
  const sprite = companion.locator("img");
  requireCondition(await sprite.count() === 1, "mascot sprite is missing or duplicated");
  requireCondition(await sprite.getAttribute("alt") === `PortManager guide — ${mood}`, "mascot sprite lacks meaningful mood alt text");
  requireCondition(await sprite.getAttribute("width") === "320" && await sprite.getAttribute("height") === "480", "mascot sprite lacks intrinsic 320×480 dimensions");
  requireCondition(await sprite.getAttribute("src") === `/mascot/mascot-${mood}.webp`, "mascot sprite does not match its derived mood");
  await sprite.evaluate((image) => image.decode());
  requireCondition(await sprite.evaluate((image) => image.complete && image.naturalWidth === 320 && image.naturalHeight === 480), "mascot WebP failed to load at 320×480");
  const bubble = companion.locator("[data-mascot-bubble]");
  if (await bubble.count()) {
    const message = compactText(await bubble.innerText());
    requireCondition(message.length > 0 && message.length <= 100, `mascot bubble length is ${message.length}, expected 1–100 characters`);
    requireCondition(!/[\d$฿%]|\b(?:USD|THB)\b/.test(message), "mascot bubble states a financial number or currency");
    requireCondition(!/\b(?:buy|sell|guarantee|predict|moon|profit|loss)\b/i.test(message), "mascot bubble contains advice, hype or unsupported profit/loss wording");
  }
  const toggle = companion.getByRole("button", { name: "Toggle guide", exact: true });
  requireCondition(await toggle.count() === 1 && await toggle.getAttribute("type") === "button", "mascot chip is not an accessible type=button toggle");
  requireCondition(await toggle.evaluate((button) => button.tabIndex >= 0 && button.matches("[data-mascot-toggle]")), "mascot chip is not keyboard focusable");
  const expanded = await toggle.getAttribute("aria-expanded");
  requireCondition(["true", "false"].includes(expanded), "mascot chip lacks its expanded state");
  requireCondition(await companion.locator("[data-mascot-status]").isVisible(), "mascot chip lacks its tiny status dot");
  const mute = companion.getByLabel("Mute guide", { exact: true });
  const hide = companion.getByRole("button", { name: "Hide guide", exact: true });
  if (expanded === "true") {
    requireCondition(await mute.count() === 1 && await mute.isVisible() && await mute.getAttribute("type") === "checkbox", "expanded mascot mute is not an accessible checkbox");
    requireCondition(await mute.evaluate((input) => input.parentElement?.tagName === "LABEL" && !input.closest("form")), "mascot mute is not a non-form labelled checkbox");
    requireCondition(await mute.getAttribute("aria-pressed") === String(await mute.isChecked()), "mascot mute aria-pressed does not reflect its checked state");
    requireCondition(await hide.count() === 1 && await hide.isVisible() && await hide.getAttribute("type") === "button", "expanded mascot hide is not a type=button control");
    requireCondition(await hide.getAttribute("aria-label") === "Hide guide", "mascot hide lacks its explicit safe aria-label");
  } else {
    requireCondition(!await companion.locator(".mascot-controls").isVisible() && !await mute.isVisible() && !await hide.isVisible(), "collapsed mascot exposes controls");
  }
  requireCondition(await companion.locator("form").count() === 0, "mascot adds a form");
  const labels = await companion.locator("label, button, input").evaluateAll((elements) => elements.map((element) => `${element.textContent ?? ""} ${element.getAttribute("aria-label") ?? ""}`));
  requireCondition(labels.every((label) => !/add|edit|save|update|delete|remove|recover|override/i.test(label)), "mascot control label contains a banned mutation word");
  return `${mood} · matching WebP/alt · 320×480 intrinsic · focusable ${expanded === "true" ? "expanded" : "collapsed"} chip · safe controls`;
}

async function assertMascotResting(page, expectedState) {
  await assertMascot(page);
  requireCondition(await page.locator("[data-mascot-toggle]").getAttribute("aria-expanded") === "false", "resting mascot is expanded");
  requireCondition(!await page.locator(".mascot-bubble").isVisible(), "resting mascot has a visible bubble");
  requireCondition(!await page.locator(".mascot-controls").isVisible(), "resting mascot has a visible controls row");
  const reducedMotion = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const viewerDetail = await assertMascotSurfaceState(page, expectedState ?? (reducedMotion ? "video" : "on"));
  await page.waitForFunction(() => {
    const card = document.querySelector(".mascot-card")?.getBoundingClientRect();
    return Boolean(card && card.width <= 65 && card.height <= 99);
  }, undefined, { timeout: 2_000 });
  const geometry = await page.locator(".mascot-card").evaluate((card) => {
    const rect = card.getBoundingClientRect();
    const style = getComputedStyle(card);
    const sprite = card.querySelector("img").getBoundingClientRect();
    const dot = card.querySelector("[data-mascot-status]").getBoundingClientRect();
    return { width: rect.width, height: rect.height, ratio: sprite.width / sprite.height,
      radius: style.borderTopLeftRadius, border: style.borderTopColor, borderWidth: style.borderTopWidth,
      shadow: style.boxShadow, dotWidth: dot.width, dotHeight: dot.height };
  });
  requireCondition(Math.abs(geometry.width - 64) <= 1 && Math.abs(geometry.height - 96) <= 3, `resting card is ${geometry.width}×${geometry.height}, expected about 64×96`);
  requireCondition(Math.abs(geometry.ratio - 2 / 3) < 0.01, "compact motion surface loses its 2:3 aspect ratio");
  requireCondition(geometry.radius === "12px", `compact card radius is ${geometry.radius}, expected 12px`);
  requireCondition(geometry.border === "rgb(223, 229, 242)" && geometry.borderWidth === "1px" && /rgba\(21, 35, 72, 0\.07\) 0px 14px 35px(?: 0px)?/.test(geometry.shadow), "compact card lacks the app border/shadow tokens");
  requireCondition(geometry.dotWidth > 0 && geometry.dotWidth <= 10 && geometry.dotHeight <= 10, "resting status dot is absent or not tiny");
  return `${geometry.width}×${geometry.height}px chip · 2:3 motion surface · tiny status dot · no visible bubble or controls · ${viewerDetail}`;
}

async function assertMascotSurfaceState(page, expectedState) {
  await page.waitForFunction((state) => {
    const companion = document.querySelector("[data-mascot-companion]");
    const canvasCount = companion?.querySelectorAll("[data-mascot-canvas]").length ?? 0;
    const videoCount = companion?.querySelectorAll("[data-mascot-video]").length ?? 0;
    const sprite = companion?.querySelector(".mascot-sprite");
    const canvas = companion?.querySelector("[data-mascot-canvas]");
    const video = companion?.querySelector("[data-mascot-video]");
    const expanded = companion?.querySelector("[data-mascot-toggle]")?.getAttribute("aria-expanded") === "true";
    const mood = companion?.getAttribute("data-mascot-mood");
    const motion = !expanded ? "idle" : ["happy", "proud"].includes(mood) ? "happy_clap" : mood === "excited" ? "excited_bounce" : "idle";
    const ratio = Number(canvas?.getAttribute("data-mascot-pixel-ratio"));
    const motionSurface = state === "on" ? canvas : state === "video" ? video : null;
    return sprite && companion?.getAttribute("data-mascot-3d") === state
      && (state === "on" ? canvasCount === 1 && videoCount === 0
        : state === "video" ? canvasCount === 0 && videoCount === 1
          : canvasCount === 0 && videoCount === 0)
      && getComputedStyle(sprite).opacity === (["on", "video"].includes(state) ? "0" : "1")
      && (state === "off" || motionSurface?.getAttribute("data-mascot-motion") === motion)
      && (state !== "on" || (canvas?.getAttribute("data-mascot-motion") === motion
        && Math.abs(canvas.width - canvas.clientWidth * ratio) <= 1
        && Math.abs(canvas.height - canvas.clientHeight * ratio) <= 1));
  }, expectedState, { timeout: 20_000 });

  const initialMood = await page.locator("[data-mascot-companion]").getAttribute("data-mascot-mood");
  const initialExpanded = await page.locator("[data-mascot-toggle]").getAttribute("aria-expanded") === "true";
  const initialMotion = initialExpanded ? mascotMotions[initialMood] : "idle";
  const playback = expectedState === "video" ? await assertMascotVideoPlaying(page, initialMotion) : null;

  const detail = await page.locator("[data-mascot-companion]").evaluate((companion, state) => {
    const sprite = companion.querySelector(".mascot-sprite");
    const canvas = companion.querySelector("[data-mascot-canvas]");
    const video = companion.querySelector("[data-mascot-video]");
    const motionSurface = state === "on" ? canvas : state === "video" ? video : null;
    const chip = companion.querySelector(".mascot-chip");
    const card = companion.querySelector(".mascot-card");
    const spriteRect = sprite?.getBoundingClientRect();
    const canvasRect = canvas?.getBoundingClientRect();
    const videoRect = video?.getBoundingClientRect();
    const motionSurfaceRect = motionSurface?.getBoundingClientRect();
    const chipRect = chip?.getBoundingClientRect();
    const cardRect = card?.getBoundingClientRect();
    const videoStyle = video ? getComputedStyle(video) : null;
    return {
      rootState: companion.getAttribute("data-mascot-3d"),
      spriteOpacity: sprite ? getComputedStyle(sprite).opacity : null,
      spriteBoxPresent: Boolean(spriteRect?.width && spriteRect?.height && getComputedStyle(sprite).visibility === "visible"),
      canvasCount: companion.querySelectorAll("[data-mascot-canvas]").length,
      videoCount: companion.querySelectorAll("[data-mascot-video]").length,
      expanded: chip?.getAttribute("aria-expanded") === "true",
      canvasPointerEvents: canvas ? getComputedStyle(canvas).pointerEvents : null,
      canvasRadius: canvas ? getComputedStyle(canvas).borderRadius : null,
      chipRadius: chip ? getComputedStyle(chip).borderRadius : null,
      canvasAriaHidden: canvas?.getAttribute("aria-hidden") ?? null,
      animations: canvas?.getAttribute("data-mascot-animations") ?? null,
      motion: motionSurface?.getAttribute("data-mascot-motion") ?? null,
      bounds: canvas?.getAttribute("data-mascot-bounds") ?? null,
      pixelRatio: Number(canvas?.getAttribute("data-mascot-pixel-ratio") ?? 0),
      drawingWidth: canvas?.width ?? 0,
      drawingHeight: canvas?.height ?? 0,
      spriteRect: spriteRect ? { width: spriteRect.width, height: spriteRect.height, left: spriteRect.left, top: spriteRect.top } : null,
      canvasRect: canvasRect ? { width: canvasRect.width, height: canvasRect.height, left: canvasRect.left, top: canvasRect.top } : null,
      videoRect: videoRect ? { width: videoRect.width, height: videoRect.height, left: videoRect.left, top: videoRect.top } : null,
      motionSurfaceRect: motionSurfaceRect ? { width: motionSurfaceRect.width, height: motionSurfaceRect.height, left: motionSurfaceRect.left, top: motionSurfaceRect.top } : null,
      chipRect: chipRect ? { width: chipRect.width, height: chipRect.height } : null,
      cardRect: cardRect ? { width: cardRect.width, height: cardRect.height } : null,
      video: video ? {
        muted: video.muted,
        autoplay: video.autoplay,
        loop: video.loop,
        playsInline: video.playsInline,
        preload: video.preload,
        controls: video.controls,
        ariaHidden: video.getAttribute("aria-hidden"),
        pointerEvents: videoStyle.pointerEvents,
        radius: videoStyle.borderRadius,
        position: videoStyle.position,
        inset: [videoStyle.top, videoStyle.right, videoStyle.bottom, videoStyle.left],
        objectFit: videoStyle.objectFit,
        sources: [...video.querySelectorAll("source")].map((source) => ({
          type: source.getAttribute("type"),
          src: source.getAttribute("src"),
        })),
        currentSrc: video.currentSrc ? new URL(video.currentSrc).pathname : null,
        mp4Support: video.canPlayType('video/mp4; codecs="avc1.64001f"'),
      } : null,
      expectedState: state,
    };
  }, expectedState);

  observedMascotSurfaceStates.add(detail.rootState ?? "unset");
  requireCondition(detail.rootState === expectedState, `expected data-mascot-3d=${expectedState}, found ${detail.rootState}`);
  requireCondition(detail.spriteBoxPresent, "mascot 2D a11y underlay lost its display box");
  const mood = await page.locator("[data-mascot-companion]").getAttribute("data-mascot-mood");
  const expectedMotion = detail.expanded ? mascotMotions[mood] : "idle";
  if (expectedState === "on") {
    requireCondition(detail.videoCount === 0, "live mascot leaves its fallback video mounted");
    requireCondition(detail.canvasCount === 1 && detail.canvasAriaHidden === "true", "live mascot canvas is missing or exposed to assistive technology");
    requireCondition(detail.animations === "idle,happy_clap,excited_bounce", `unexpected GLB clips ${detail.animations}`);
    requireCondition(detail.motion === expectedMotion, `mood ${mood} (${detail.expanded ? "expanded" : "resting"}) plays ${detail.motion}, expected ${expectedMotion}`);
    requireCondition(detail.canvasPointerEvents === "none", "decorative canvas intercepts the chip hit target");
    requireCondition(detail.canvasRadius === detail.chipRadius, "canvas does not inherit the chip border radius");
    requireCondition(detail.spriteOpacity === "0", `live canvas leaves the 2D underlay visually doubled at opacity ${detail.spriteOpacity}`);
    requireCondition(detail.pixelRatio > 0 && detail.pixelRatio <= 2, `renderer pixel ratio is ${detail.pixelRatio}`);
    requireCondition(detail.spriteRect && detail.canvasRect && detail.chipRect && detail.cardRect, "viewer display geometry is incomplete");
    const box = detail.expanded ? { width: 126, height: 189, cardWidth: 128, cardHeight: 262 }
      : { width: 62, height: 93, cardWidth: 64, cardHeight: 95 };
    requireCondition(Math.abs(detail.chipRect.width - box.width) <= 1 && Math.abs(detail.chipRect.height - box.height) <= 3,
      `display box is ${detail.chipRect.width}×${detail.chipRect.height}, expected about ${box.width}×${box.height}`);
    requireCondition(Math.abs(detail.cardRect.width - box.cardWidth) <= 1 && Math.abs(detail.cardRect.height - box.cardHeight) <= 4,
      `card is ${detail.cardRect.width}×${detail.cardRect.height}, expected about ${box.cardWidth}×${box.cardHeight}`);
    for (const dimension of ["width", "height", "left", "top"]) {
      requireCondition(Math.abs(detail.spriteRect[dimension] - detail.canvasRect[dimension]) <= 1,
        `canvas ${dimension} differs from the existing sprite box`);
    }
    requireCondition(Math.abs(detail.drawingWidth / detail.canvasRect.width - detail.pixelRatio) <= 0.02
      && Math.abs(detail.drawingHeight / detail.canvasRect.height - detail.pixelRatio) <= 0.02,
    "canvas drawing buffer does not match its capped pixel ratio");
    const bounds = detail.bounds?.split(",").map(Number) ?? [];
    requireCondition(bounds.length === 3 && bounds.every(Number.isFinite) && bounds[1] > 1.65 && bounds[1] < 1.75,
      `computed model bounds do not frame the ~1.7m full body: ${detail.bounds}`);
  } else if (expectedState === "video") {
    const stem = mascotMediaStem(expectedMotion);
    requireCondition(detail.canvasCount === 0 && detail.videoCount === 1, "video fallback does not own the sole motion surface");
    requireCondition(detail.spriteOpacity === "0", `playing video leaves the static sprite visible at opacity ${detail.spriteOpacity}`);
    requireCondition(detail.motion === expectedMotion,
      `mood ${mood} (${detail.expanded ? "expanded" : "resting"}) video plays ${detail.motion}, expected ${expectedMotion}`);
    requireCondition(detail.video?.muted && detail.video.autoplay && detail.video.loop && detail.video.playsInline
      && detail.video.preload === "auto" && !detail.video.controls && detail.video.ariaHidden === "true",
    `fallback video attributes differ from contract: ${JSON.stringify(detail.video)}`);
    requireCondition(detail.video.pointerEvents === "none" && detail.video.radius === detail.chipRadius
      && detail.video.position === "absolute" && detail.video.inset.every((value) => value === "0px")
      && detail.video.objectFit === "cover", `fallback video CSS differs from contract: ${JSON.stringify(detail.video)}`);
    requireCondition(JSON.stringify(detail.video.sources) === JSON.stringify([
      { type: "video/webm", src: `/mascot/motion-${stem}.webm` },
      { type: "video/mp4", src: `/mascot/motion-${stem}.mp4` },
    ]), `fallback sources are not ordered WebM then MP4: ${JSON.stringify(detail.video.sources)}`);
    requireCondition(detail.video.currentSrc === `/mascot/motion-${stem}.webm`,
      `Chromium selected ${detail.video.currentSrc}, expected VP9 WebM first`);
    requireCondition(detail.video.mp4Support !== "", "browser does not advertise an MP4 fallback capability");
    requireCondition(detail.spriteRect && detail.videoRect && detail.motionSurfaceRect && detail.chipRect && detail.cardRect,
      "video display geometry is incomplete");
    const box = detail.expanded ? { width: 126, height: 189, cardWidth: 128, cardHeight: 262 }
      : { width: 62, height: 93, cardWidth: 64, cardHeight: 95 };
    requireCondition(Math.abs(detail.chipRect.width - box.width) <= 1 && Math.abs(detail.chipRect.height - box.height) <= 3,
      `video display box is ${detail.chipRect.width}×${detail.chipRect.height}, expected about ${box.width}×${box.height}`);
    requireCondition(Math.abs(detail.cardRect.width - box.cardWidth) <= 1 && Math.abs(detail.cardRect.height - box.cardHeight) <= 4,
      `video card is ${detail.cardRect.width}×${detail.cardRect.height}, expected about ${box.cardWidth}×${box.cardHeight}`);
    for (const dimension of ["width", "height", "left", "top"]) {
      requireCondition(Math.abs(detail.spriteRect[dimension] - detail.motionSurfaceRect[dimension]) <= 1,
        `video ${dimension} differs from the existing sprite box`);
    }
  } else {
    requireCondition(expectedState === "off", `unknown mascot surface state ${expectedState}`);
    requireCondition(detail.canvasCount === 0 && detail.videoCount === 0, "last-resort static fallback leaves a motion surface mounted");
    requireCondition(detail.spriteOpacity === "1", `last-resort static sprite opacity is ${detail.spriteOpacity}`);
  }
  if (expectedState === "video") {
    return `data-mascot-3d=video · ${expectedMotion} · ${playback} · no canvas · static sprite hidden`;
  }
  return `data-mascot-3d=${expectedState} · ${expectedState === "on"
    ? `${detail.motion} · clips ${detail.animations} · ${detail.chipRect.width}×${detail.chipRect.height}px unchanged box · DPR ${detail.pixelRatio} · no video`
    : "no canvas/video · visible last-resort sprite"}`;
}

async function assertOpaqueMascotBubble(page) {
  const bubble = page.locator(".mascot-bubble");
  requireCondition(await bubble.isVisible(), "mascot bubble is not visible");
  const styles = await bubble.evaluate((element) => {
    const style = getComputedStyle(element);
    const ancestorOpacities = [];
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) ancestorOpacities.push(getComputedStyle(ancestor).opacity);
    return { background: style.backgroundColor, border: style.borderTopColor, borderWidth: style.borderTopWidth,
      radius: style.borderTopLeftRadius, shadow: style.boxShadow, font: style.fontFamily,
      bodyFont: getComputedStyle(document.body).fontFamily, ancestorOpacities };
  });
  requireCondition(styles.background === "rgb(255, 255, 255)", `bubble background is ${styles.background}, expected opaque white with no alpha`);
  requireCondition(styles.ancestorOpacities.every((opacity) => Number(opacity) === 1), `bubble/ancestor opacity permits content bleed: ${styles.ancestorOpacities.join(", ")}`);
  requireCondition(styles.border === "rgb(223, 229, 242)" && styles.borderWidth === "1px" && styles.radius === "10px", "bubble lacks its #DFE5F2 1px border and 10px radius");
  requireCondition(/rgba\(21, 35, 72, 0\.07\) 0px 14px 35px(?: 0px)?/.test(styles.shadow), `bubble lacks the standard shadow: ${styles.shadow}`);
  requireCondition(styles.font === styles.bodyFont, `bubble font ${styles.font} differs from app body font ${styles.bodyFont}`);
  // The fixture builds real page components outside Next's root layout, which
  // loads Outfit. Its declared body token intentionally uses the Arial fallback.
  if (new URL(page.url()).origin === new URL(baseUrl).origin) {
    requireCondition(/outfit/i.test(styles.font), `production bubble lacks Outfit: ${styles.font}`);
  }
  return `computed background rgb(255, 255, 255) · opacity 1 through every ancestor · #DFE5F2 border · 10px radius · app body font ${styles.font}`;
}

async function assertMascotExpanded(page) {
  await assertMascot(page);
  requireCondition(await page.locator("[data-mascot-toggle]").getAttribute("aria-expanded") === "true", "chip did not expand");
  requireCondition(await page.locator(".mascot-controls").isVisible(), "expanded guide lacks visible controls");
  const width = await page.locator(".mascot-card").evaluate((card) => card.getBoundingClientRect().width);
  requireCondition(Math.abs(width - 128) <= 1, `expanded card width is ${width}px, expected about 128px`);
  const muted = await page.getByLabel("Mute guide", { exact: true }).isChecked();
  requireCondition(await page.locator(".mascot-bubble").isVisible() === !muted, "expanded bubble does not respect mute");
  return `${width}px panel · aria-expanded=true · visible safe controls · ${muted ? "muted bubble hidden" : "current bubble visible"}`;
}

async function assertHomeMascotOcclusion(page, selector, description) {
  requireCondition(await page.evaluate(() => scrollY) === 0, "first-view occlusion check did not start at scrollY=0");
  const targets = page.locator(selector);
  const count = await targets.count();
  requireCondition(count > 0, `${description} targets are missing`);
  const inspect = (element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    const card = document.querySelector(".mascot-card").getBoundingClientRect();
    const visible = rects.map((rect) => ({ left: Math.max(0, rect.left), right: Math.min(innerWidth, rect.right),
      top: Math.max(0, rect.top), bottom: Math.min(innerHeight, rect.bottom) }))
      .filter((rect) => rect.right > rect.left && rect.bottom > rect.top);
    const blocked = visible.some((rect) => {
      if (rect.left < card.right && rect.right > card.left && rect.top < card.bottom && rect.bottom > card.top) return true;
      return [0.15, 0.5, 0.85].some((portion) => {
        const hit = document.elementFromPoint(rect.left + (rect.right - rect.left) * portion, (rect.top + rect.bottom) / 2);
        return !hit || !element.contains(hit);
      });
    });
    const style = getComputedStyle(element);
    return { text: element.textContent?.replace(/\s+/g, " ").trim(), visible: visible.length > 0,
      fullyVisible: rects.length > 0 && rects.every((rect) => rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight),
      blocked, rendered: style.visibility === "visible" && style.display !== "none" && Number(style.opacity) > 0 };
  };
  let firstViewVisible = 0;
  const outsideFirstView = [];
  for (let index = 0; index < count; index++) {
    const result = await targets.nth(index).evaluate(inspect);
    requireCondition(result.rendered && result.text, `${description} has hidden or empty text`);
    requireCondition(!result.blocked, `resting mascot or another surface covers first-view ${description}: ${result.text}`);
    if (result.visible) firstViewVisible++;
    if (!result.fullyVisible) outsideFirstView.push(index);
  }
  for (const index of outsideFirstView) {
    await targets.nth(index).evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }));
    const result = await targets.nth(index).evaluate(inspect);
    requireCondition(result.fullyVisible && !result.blocked, `${description} is not fully visible/hittable after scrolling: ${result.text}`);
  }
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  return `${description}: ${firstViewVisible}/${count} text targets intersect first view and are unoccluded/hittable; ${outsideFirstView.length} outside/partial first-view targets separately scrolled fully into view and hit-tested`;
}

async function assertMascotPlacement(page) {
  const geometry = await page.evaluate(() => {
    const companion = document.querySelector("[data-mascot-companion]");
    if (!companion) throw new Error("mascot is missing");
    const bounds = companion.getBoundingClientRect();
    const cardBounds = companion.querySelector(".mascot-card")?.getBoundingClientRect();
    const clickables = [...companion.querySelectorAll("img, button, input, [data-mascot-bubble]")]
      .map((element) => element.getBoundingClientRect()).filter((rect) => rect.width && rect.height);
    const navBounds = [...document.querySelectorAll(".nav-menu a")].map((link) => link.getBoundingClientRect());
    const overlapsNav = clickables.some((rect) => navBounds.some((nav) => rect.left < nav.right && rect.right > nav.left && rect.top < nav.bottom && rect.bottom > nav.top));
    // Exercise a real empty point in the gap above the card, including when
    // the collapsed wrapper has shrunk to the chip itself.
    const blankX = cardBounds ? cardBounds.right - 4 : bounds.left;
    const blankY = cardBounds ? cardBounds.top - 4 : bounds.top;
    const blankHit = document.elementFromPoint(blankX, blankY);
    return {
      pointerEvents: getComputedStyle(companion).pointerEvents,
      position: getComputedStyle(companion).position,
      overlapsNav,
      overflow: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth,
      insideViewport: [bounds, ...clickables].every((rect) => rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1),
      blankPassesThrough: Boolean(blankHit) && !companion.contains(blankHit),
    };
  });
  requireCondition(geometry.position === "fixed" && geometry.pointerEvents === "none", "mascot wrapper is not a fixed, non-intercepting overlay");
  requireCondition(!geometry.overlapsNav, "mascot overlaps primary navigation");
  requireCondition(geometry.blankPassesThrough, "mascot's blank wrapper area intercepts page content");
  requireCondition(geometry.insideViewport && geometry.overflow <= 1, `mascot escapes the viewport or adds ${geometry.overflow}px overflow`);
  for (const link of await page.locator(".nav-menu a").all()) await link.click({ trial: true });
  return `${geometry.overflow}px overflow · nav clickable · blank overlay passes through`;
}

async function checkMascotRoute(page, route, viewport, response) {
  const prefix = `${viewport.name} ${route.path} mascot`;
  await check(`${prefix} server HTML defaults visible only after login`, async () => {
    const html = await response.text();
    const serverMarkup = await page.evaluate((source) => {
      const doc = new DOMParser().parseFromString(source, "text/html");
      const companions = [...doc.querySelectorAll("[data-mascot-companion]")];
      return { count: companions.length, visible: companions.every((element) => !element.hasAttribute("hidden")),
        collapsed: companions.every((element) => element.querySelector('[data-mascot-toggle][aria-expanded="false"]') && !element.querySelector(".mascot-controls")),
        sprites: companions.reduce((sum, element) => sum + element.querySelectorAll("img[alt][width='320'][height='480']").length, 0),
        canvases: companions.reduce((sum, element) => sum + element.querySelectorAll("[data-mascot-canvas]").length, 0),
        videos: companions.reduce((sum, element) => sum + element.querySelectorAll("[data-mascot-video]").length, 0),
        viewerStates: companions.map((element) => element.getAttribute("data-mascot-3d")),
        hydrated: companions.map((element) => element.hasAttribute("data-mascot-hydrated")) };
    }, html);
    requireCondition(serverMarkup.count === (route.name === "login" ? 0 : 1), `server HTML has ${serverMarkup.count} companions`);
    if (route.name !== "login") {
      requireCondition(serverMarkup.visible && serverMarkup.sprites === 1 && serverMarkup.collapsed, "server HTML omits the collapsed default sprite or exposes expanded controls");
      requireCondition(serverMarkup.canvases === 0 && serverMarkup.videos === 0
        && serverMarkup.viewerStates.every((state) => state === null)
        && serverMarkup.hydrated.every((state) => state === false),
      "server HTML renders a client-only motion surface or claims a hydrated mascot state");
    }
    return route.name === "login" ? "absent from login HTML" : "collapsed static sprite is the pre-hydration exception; state unset and no canvas/video or controls row";
  });
  if (route.name === "login") {
    await check(`${prefix} remains absent after hydration`, async () => {
      requireCondition(await page.locator("[data-mascot-companion], img[src^='/mascot/']").count() === 0, "login renders a mascot");
    });
    return;
  }
  await check(`${prefix} renders an accessible chip and expanded read-only controls`, async () => {
    await assertMascot(page);
    requireCondition(await page.locator("[data-mascot-toggle]").getAttribute("aria-expanded") === "false", "route defaults to an expanded mascot");
    await page.locator("[data-mascot-toggle]").click();
    await assertMascotExpanded(page);
    await page.locator("[data-mascot-toggle]").click();
    return assertMascotResting(page);
  });
  await check(`${prefix} preserves navigation, page hit targets and viewport bounds`, () => assertMascotPlacement(page));
}

function expectedUsd(value) {
  return value === null ? "—" : new Intl.NumberFormat("en-GB", {
    style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}

function expectedThb(value) {
  return value === null ? "—" : `฿${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function assertPortfolioChart(page, independentPortfolio) {
  const knownLive = independentPortfolio !== undefined
    && Object.values(independentPortfolio.sources).some((source) => source.status === "live")
    && Number.isFinite(independentPortfolio.totals.grandTotalUsd)
    && Number.isFinite(independentPortfolio.totals.grandTotalThb);
  const host = page.locator(".portfolio-chart-host");
  const hostCount = await host.count();
  requireCondition(hostCount <= 1, `expected at most one chart host, found ${hostCount}`);
  // Independent known data must survive even an incorrectly hidden host/unavailable legend.
  requireCondition(!knownLive || hostCount === 1, "known live fixture value has no chart host");
  if (hostCount === 0) {
    const empty = page.locator(".portfolio-chart-empty");
    requireCondition(await empty.count() === 1, "portfolio chart lacks an explicit empty/unavailable state");
    requireCondition(/no valuation snapshot|unavailable|no recorded/i.test((await empty.textContent()) ?? ""), "portfolio chart empty state is not explained");
    return "no chart host · explicit unavailable valuation state";
  }

  await host.waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForFunction(
    () => document.querySelector(".portfolio-chart-host")?.getAttribute("data-chart-ready") === "true",
    undefined,
    { timeout: 15_000 },
  );
  const axisCount = await host.locator(".axis").count();
  requireCondition(axisCount >= 2, `expected at least two Plottable axes, found ${axisCount}`);
  const liveMarkers = await host.locator(".scatter-plot path").evaluateAll((paths) => paths
    .filter((path) => {
      const style = getComputedStyle(path);
      const fill = `${path.getAttribute("fill") ?? ""} ${style.fill}`;
      const box = path.getBoundingClientRect();
      return /#355cc9|rgb\(\s*53\s*,\s*92\s*,\s*201\s*\)/i.test(fill)
        && style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0
        && box.width > 0 && box.height > 0;
    })
    .map((path) => path.__data__));
  const liveUnavailable = await page.locator(".chart-legend .is-unavailable").count() > 0;
  const expectsLiveMarker = independentPortfolio === undefined ? !liveUnavailable : knownLive;
  requireCondition(expectsLiveMarker ? liveMarkers.length > 0 : liveMarkers.length === 0,
    expectsLiveMarker ? "known live value is missing its visible Plottable marker" : "unavailable live value has an invented Plottable marker");

  if (knownLive) {
    requireCondition(!liveUnavailable, "known live fixture value is incorrectly marked unavailable");
    const { grandTotalUsd, grandTotalThb } = independentPortfolio.totals;
    requireCondition(liveMarkers.length === 1 && liveMarkers[0].series === "live"
      && liveMarkers[0].date === independentPortfolio.asOf.slice(0, 10)
      && liveMarkers[0].asOf === independentPortfolio.asOf
      && liveMarkers[0].valueUsd === grandTotalUsd && liveMarkers[0].valueThb === grandTotalThb,
    "live marker datum differs from independent fixture date/USD/THB");
    const kpi = page.locator(".portfolio-kpi-card.live-edge");
    requireCondition(compactText(await kpi.locator(".metric-value").innerText()) === expectedUsd(grandTotalUsd), "live KPI USD differs from independent fixture value");
    requireCondition(compactText(await kpi.locator("small").innerText()) === `${expectedThb(grandTotalThb)} · THB equivalent`, "live KPI THB differs from independent fixture value");
    const ledger = page.locator(".live-ledger-row .value-cell");
    requireCondition(await ledger.evaluate((element) => element.firstChild?.textContent) === expectedUsd(grandTotalUsd), "live register USD differs from independent fixture value");
    requireCondition(compactText(await ledger.locator("small").innerText()) === expectedThb(grandTotalThb), "live register THB differs from independent fixture value");
    return `independent source=live · USD ${grandTotalUsd.toFixed(2)} · THB ${grandTotalThb.toFixed(2)} · exact live marker/KPI/register`;
  }
  return `${axisCount} axes · ${liveMarkers.length} live marker${liveMarkers.length === 1 ? "" : "s"}`;
}

async function checkPortfolioContract(page, independentPortfolio) {
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
    return assertPortfolioChart(page, independentPortfolio);
  });
}

async function assertCalendarDetail(calendar, snapshot) {
  const detail = calendar.locator(".pnl-calendar-detail");
  requireCondition(compactText(await detail.locator("h3").innerText()) === snapshot.date, "selected calendar date did not change to the clicked record");
  const eligible = snapshot.coverage.eligible > 0;
  for (const [label, usd, thb] of [
    ["P&L (recorded)", eligible ? snapshot.pnlUsd : null, eligible ? snapshot.pnlThb : null],
    ["Portfolio value", snapshot.totalValueUsd, snapshot.totalValueThb],
    ["Recorded basis", eligible ? snapshot.costBasisUsd : null, eligible ? snapshot.costBasisThb : null],
  ]) {
    const value = detail.locator("dl > div").filter({ has: detail.page().getByText(label, { exact: true }) }).locator("dd");
    requireCondition(await value.evaluate((element) => element.firstChild?.textContent) === expectedUsd(usd), `${snapshot.date} ${label} USD differs from independent snapshot`);
    const secondary = compactText(await value.locator("small").innerText());
    const percentage = !eligible || snapshot.pnlPct === null ? "—"
      : `${snapshot.pnlPct > 0 ? "+" : snapshot.pnlPct < 0 ? "−" : ""}${Math.abs(snapshot.pnlPct).toFixed(2)}%`;
    const expectedSecondary = label === "P&L (recorded)" ? `${expectedThb(thb)} · ${percentage}` : expectedThb(thb);
    requireCondition(secondary === expectedSecondary, `${snapshot.date} ${label} THB/percentage differs from independent snapshot: ${secondary}`);
  }
  const coverage = detail.locator("dl > div").filter({ has: detail.page().getByText("Coverage", { exact: true }) }).locator("dd");
  requireCondition(await coverage.evaluate((element) => element.firstChild?.textContent) === snapshot.coverage.status, "selected calendar coverage status differs from independent snapshot");
  requireCondition(compactText(await coverage.locator("small").innerText())
    === `${snapshot.coverage.eligible} / ${snapshot.coverage.totalHoldings} holdings eligible`, "selected calendar eligible holding counts differ from independent snapshot");
}

async function auditPopulatedFixtures(browser, fixtureUrl, viewport) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
  page.on("console", (message) => captureBrowserConsole(browserErrors, message));
  const prefix = `${viewport.name} fixture`;
  const navigate = (scenario) => check(`${prefix} ${scenario} renders real app components`, async () => {
    const response = await page.goto(`${fixtureUrl}/?scenario=${scenario}`, { waitUntil: "networkidle", timeout: 15_000 });
    requireCondition(response?.ok(), `fixture HTTP ${response?.status() ?? "unavailable"}`);
    await page.locator(scenario.startsWith("portfolio-") ? ".portfolio-chart-panel" : ".pnl-performance").waitFor();
  });
  try {
    if (!await navigate("portfolio-live")) return;
    await check(`${prefix} finding #2 known live source requires exact live marker and USD/THB value`, async () => {
      const input = browserFixture.portfolio;
      requireCondition(Object.values(input.sources).every((source) => source.status === "live")
        && Number.isFinite(input.totals.grandTotalUsd) && input.totals.grandTotalUsd > 0
        && Number.isFinite(input.totals.grandTotalThb) && input.totals.grandTotalThb > 0,
      "independent fixture no longer supplies known positive USD/THB and live sources");
      return assertPortfolioChart(page, input);
    });
    await check(`${prefix} finding #2 rejects hidden live marker plus a false unavailable legend`, async () => {
      await page.evaluate(() => {
        for (const path of document.querySelectorAll('.scatter-plot path[fill="#355CC9"]')) path.style.visibility = "hidden";
        const legend = document.querySelector(".chart-legend .legend-marker.live")?.parentElement;
        legend?.classList.add("is-unavailable");
        legend?.append(" unavailable");
      });
      let rejection = "";
      try { await assertPortfolioChart(page, browserFixture.portfolio); } catch (error) { rejection = String(error); }
      requireCondition(/known live value is missing its visible Plottable marker/.test(rejection), "independent live requirement accepted a hidden known marker and unavailable legend");
      return "negative control rejected; UI unavailable copy cannot waive known fixture data";
    });
    await check(`${prefix} finding #2 rejects a missing host for independently known live data`, async () => {
      await page.locator(".portfolio-chart-host").evaluate((host) => {
        const empty = document.createElement("div");
        empty.className = "portfolio-chart-empty";
        empty.textContent = "No valuation snapshot is available.";
        host.replaceWith(empty);
      });
      let rejection = "";
      try { await assertPortfolioChart(page, browserFixture.portfolio); } catch (error) { rejection = String(error); }
      requireCondition(/known live fixture value has no chart host/.test(rejection), "independent live requirement accepted an invented empty chart state");
      return "negative control rejected before empty-state return";
    });

    if (!await navigate("portfolio-unavailable")) return;
    await check(`${prefix} independently unavailable live data retains honest legacy-only chart`, async () => {
      const input = structuredClone(browserFixture.portfolio);
      input.totals.grandTotalUsd = null;
      input.totals.grandTotalThb = null;
      for (const source of Object.values(input.sources)) source.status = "unavailable";
      const result = await assertPortfolioChart(page, input);
      requireCondition(await page.locator(".chart-legend .is-unavailable").count() === 1, "unknown live data is not marked unavailable");
      requireCondition(await page.locator('.scatter-plot path[fill="#8290A5"]').count() === browserFixture.legacyPoints.length, "legacy-only chart dropped independent archive records");
      requireCondition(compactText(await page.locator(".portfolio-kpi-card.live-edge .metric-value").innerText()) === "—", "unknown live KPI invents a value");
      return result;
    });

    if (!await navigate("recent")) return;
    await check(`${prefix} finding #4 populated periods are enabled and filter exact recorded rows`, async () => {
      const performance = page.locator(".pnl-performance");
      requireCondition(await performance.getAttribute("data-history-count") === String(browserFixture.snapshots.length), "populated performance dropped independent snapshot rows");
      const periods = performance.getByRole("group", { name: "Performance period", exact: true });
      for (const [label, count] of [["1M", 6], ["3M", 7], ["All", 8], ["1M", 6], ["All", 8]]) {
        const button = periods.getByRole("button", { name: label, exact: true });
        requireCondition(await button.isEnabled(), `populated-history period ${label} is disabled`);
        await button.click();
        await page.waitForFunction((expected) => document.querySelector(".pnl-performance")?.getAttribute("data-period-count") === String(expected)
          && document.querySelector(".pnl-chart-host")?.getAttribute("data-chart-ready") === "true", count);
        requireCondition(await button.getAttribute("aria-pressed") === "true", `period ${label} did not become selected`);
        requireCondition(await performance.locator("tbody tr").count() === count, `period ${label} observation table differs from the fixture`);
        requireCondition(await performance.locator(".axis").count() >= 2, `period ${label} has no Plottable axes`);
      }
      return "1M/3M/All enabled · 6/7/8 exact observations · repeated period changes draw charts";
    });
    const calendar = page.locator(".pnl-calendar");
    for (const date of ["2026-09-01", "2026-09-02", "2026-09-03"]) {
      await check(`${prefix} finding #4 clicking ${date} shows exact recorded USD/THB and coverage`, async () => {
        const snapshot = browserFixture.snapshots.find((row) => row.date === date);
        requireCondition(snapshot, `independent calendar fixture ${date} is missing`);
        const day = calendar.locator(`[data-snapshot-date="${date}"]`);
        requireCondition(await day.isEnabled(), `recorded calendar day ${date} is disabled`);
        await day.click();
        requireCondition(await day.getAttribute("aria-pressed") === "true", "clicked recorded day did not become selected");
        await assertCalendarDetail(calendar, snapshot);
        return `${date} · value ${expectedUsd(snapshot.totalValueUsd)} / ${expectedThb(snapshot.totalValueThb)} · P&L ${expectedUsd(snapshot.pnlUsd)} / ${expectedThb(snapshot.pnlThb)} · ${snapshot.coverage.status} ${snapshot.coverage.eligible}/${snapshot.coverage.totalHoldings}`;
      });
    }
    await check(`${prefix} finding #4 previous/next month changes grid and exact selected observation`, async () => {
      const previous = calendar.getByRole("button", { name: "Previous recorded month", exact: true });
      const next = calendar.getByRole("button", { name: "Next recorded month", exact: true });
      requireCondition(await previous.isEnabled() && await next.isDisabled(), "current fixture month has incorrect navigation availability");
      await previous.click();
      requireCondition(compactText(await calendar.locator(".pnl-month-controls strong").innerText()) === "August 2026", "previous month did not change the calendar heading");
      requireCondition(await calendar.locator("[data-snapshot-date]").count() === 1
        && await calendar.locator('[data-snapshot-date="2026-08-31"]').count() === 1, "previous month did not replace the recorded-day grid");
      await assertCalendarDetail(calendar, browserFixture.snapshots.find((row) => row.date === "2026-08-31"));
      requireCondition(await next.isEnabled(), "next recorded month cannot be reached");
      await next.click();
      requireCondition(compactText(await calendar.locator(".pnl-month-controls strong").innerText()) === "September 2026", "next month did not restore the calendar heading");
      requireCondition(await calendar.locator("[data-snapshot-date]").count() === 5, "next month did not restore September recorded days");
      await assertCalendarDetail(calendar, browserFixture.snapshots.find((row) => row.date === "2026-09-05"));
      return "September → August (2026-08-31) → September (2026-09-05); exact grid/value/basis/P&L/coverage";
    });
    await check(`${prefix} wallet keeps exact $1 rows while totals include suppressed values`, async () => {
      const wallet = page.locator(".home-wallet-panel");
      const symbols = () => wallet.locator("tbody .ticker-cell").allTextContents();
      requireCondition((await symbols()).join(",") === "NATIVE-ONE,TOKEN-ONE", "strict raw threshold lost a $1 holding or exposed a .999/unknown holding");
      requireCondition(await wallet.locator('tr[data-wallet-priced="false"]').count() === 0, "unknown native/token row is rendered");
      const total = await wallet.locator("tfoot").innerText();
      requireCondition(total.includes("US$3.01") && total.includes("฿108.32"), "wallet total omits known suppressed holdings worth $1.009 / ฿36.324");
      await assertNoSuppressionTrace(page);
      await assertWalletRows(wallet, 4);
      await assertWalletTotals(wallet, 4, 5, {
        rows: [...browserFixture.wallet.nativeRows, ...browserFixture.wallet.tokenRows], totalUsd: 3.009, totalThb: 108.324,
      });
      const counts = await readHomeWalletPanelCounts(wallet);
      const header = await readHomeWalletHeaderCounts(wallet);
      requireCondition(counts.native === 1 && counts.token === 1 && header.native === 1 && header.token === 1, "fixture native/token counts differ from rendered rows");
      requireCondition((await symbols()).join(",") === "NATIVE-ONE,TOKEN-ONE" && await wallet.locator("tfoot").innerText() === total, "read-only wallet rows or totals changed");
      return "$3.009 / ฿108.324 total = $2 / ฿72 displayed + $0.999 and $0.01 suppressed holdings";
    });
    await check(`${prefix} populated page fits viewport and keeps numbers honest`, async () => {
      const overflow = await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth);
      requireCondition(overflow <= 1, `populated fixture overflows by ${overflow}px`);
      requireCondition(!/\b(?:undefined|NaN|null)\b/.test(await renderedText(page)), "populated fixture renders undefined/NaN/null");
      return `${overflow}px horizontal overflow`;
    });

    if (!await navigate("older")) return;
    await check(`${prefix} older history keeps enabled empty-period controls and restores All`, async () => {
      const performance = page.locator(".pnl-performance");
      for (const label of ["1M", "3M"]) {
        const button = performance.getByRole("button", { name: label, exact: true });
        requireCondition(await button.isEnabled(), `older-history period ${label} is disabled`);
        await button.click();
        requireCondition((await performance.innerText()).includes("No snapshots in this period") && await performance.locator(".pnl-chart-host").count() === 0, "empty selected period invents a history chart");
      }
      await performance.getByRole("button", { name: "All", exact: true }).click();
      await performance.locator('[data-chart-ready="true"]').waitFor();
      requireCondition(await performance.getAttribute("data-period-count") === "1", "All failed to restore older snapshot");
      requireCondition((await calendar.locator(".pnl-calendar-detail").innerText()).includes("No snapshots this month"), "current empty month hides older-history state");
      await calendar.getByRole("button", { name: "Previous recorded month", exact: true }).click();
      await assertCalendarDetail(calendar, browserFixture.snapshots[0]);
    });
    if (!await navigate("empty")) return;
    await check(`${prefix} empty history disables periods/days and states history starts today`, async () => {
      requireCondition(await page.locator(".pnl-periods button:disabled").count() === 3, "empty fixture period controls are enabled");
      requireCondition(await page.locator(".pnl-calendar-day:not(:disabled)").count() === 0, "empty fixture calendar invents a selectable record");
      requireCondition((await page.locator(".pnl-performance").innerText()).includes("History starts today")
        && (await calendar.locator(".pnl-calendar-detail").innerText()).includes("History starts today"), "empty history explanation is missing");
    });
    if (!await navigate("filtered-empty")) return;
    await check(`${prefix} all-small/unknown wallet has zero rows and only neutral empty copy`, async () => {
      const wallet = page.locator(".home-wallet-panel");
      requireCondition(await wallet.locator("tr[data-wallet-kind], table, tfoot, input, button, select").count() === 0, "all-small/unknown fixture renders a row, total table or control");
      requireCondition(compactText(await wallet.locator(".home-empty strong").innerText()) === "No wallet holdings to display in this snapshot.", "neutral wallet empty copy changed");
      requireCondition(!/\$1|hidden|filter|no balances/i.test(await wallet.innerText()), "empty wallet discloses suppression or claims no balances");
      const counts = await readHomeWalletPanelCounts(wallet);
      const header = await readHomeWalletHeaderCounts(wallet);
      requireCondition(counts.native === 0 && counts.token === 0 && header.native === 0 && header.token === 0, "empty wallet counts are not zero");
      await assertNoSuppressionTrace(page);
    });
    await check(`${prefix} populated/empty/live/legacy interactions keep browser console clean`, async () => {
      requireCondition(browserErrors.length === 0, browserErrors.join(" | "));
    });
  } finally {
    await page.close();
  }
}

async function auditBasisEvidenceFixtures(browser, fixtureUrl, viewport) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
  page.on("console", (message) => captureBrowserConsole(browserErrors, message));
  const prefix = `${viewport.name} basis evidence`;
  let positiveValue;
  try {
    for (const scenario of ["basis", "basis-missing"]) {
      const positive = scenario === "basis";
      const label = `${prefix} ${positive ? "positive" : "fail-closed"}`;
      if (!await check(`${label} renders real joined inputs`, async () => {
        const response = await page.goto(`${fixtureUrl}/?scenario=dust-${scenario}-home`, { waitUntil: "networkidle", timeout: 15_000 });
        requireCondition(response?.ok(), `fixture HTTP ${response?.status() ?? "unavailable"}`);
        await page.locator(".pnl-asset-table").waitFor();
      })) continue;
      const book = await page.evaluate(() => window.__dustFixturePortfolio);
      await check(`${label} pins basis amounts, coverage identities and unchanged source cardinality`, async () => {
        const rows = [book.wallet.native[0], book.nfts[0], book.wallet.tokens[0]];
        const expected = positive ? [[1100, 400, "arrival-priced", "eligible"], [40, 20, "onchain-derived", "eligible"], [null, null, "not-recorded", "not-recorded"]]
          : Array.from({ length: 3 }, () => [null, null, "not-recorded", "not-recorded"]);
        requireCondition(JSON.stringify(rows.map((row) => [row.costBasisUsd, row.pnlUsd, row.basisStatus, row.pnlEligibility])) === JSON.stringify(expected), "derived lot basis/P&L/provenance differs");
        requireCondition(book.nfts[0].tokenCount === 2 && (positive ? book.nfts[0].costBasisUsd / 2 === 20 : book.nfts[0].costBasisUsd === null), "batch payment was not allocated once across its two units");
        const c = book.totals.pnlCoverage;
        requireCondition(c.totalHoldings === 3 && c.eligible === (positive ? 2 : 0) && c.notRecorded === (positive ? 1 : 3)
          && c.dust === 0 && c.unpriced === 0 && c.unreconciled === 0 && c.status === "partial" && c.sourcesComplete === true, "coverage counts or source completeness differ");
        requireCondition(c.eligible + c.notRecorded + c.dust + c.unpriced + c.unreconciled === c.totalHoldings, "coverage bucket identity changed");
        const keys = ["capital", "ethPrice", "fiatFx", "manualHoldings", "nfts", "t212Positions", "t212Summary", "walletNative", "walletTokens"];
        requireCondition(JSON.stringify(Object.keys(book.sources).sort()) === JSON.stringify(keys), "basis cache added/lost a source");
        requireCondition(book.totals.costBasisUsd === (positive ? 1140 : null) && book.totals.pnlUsd === (positive ? 420 : null), "recorded summary includes unknown basis or doubles the batch");
        requireCondition(book.totals.grandTotalUsd === 1561, "basis changed the independent full book valuation");
        if (positive) positiveValue = book.totals.grandTotalUsd;
        else requireCondition(book.totals.grandTotalUsd === positiveValue, "removing evidence changed full book value");
        return JSON.stringify({ rows: expected, coverage: c });
      });
      await check(`${label} displays provenance chips, exact values and honest no-evidence exclusions`, async () => {
        const ids = ["native:1", "nft:collection-one", "token:1:0x0000000000000000000000000000000000000001"];
        const rows = [book.wallet.native[0], book.nfts[0], book.wallet.tokens[0]];
        requireCondition(await page.locator('.pnl-asset-table tbody tr').count() === 3, "fixture market row count differs");
        for (const [index, id] of ids.entries()) {
          const row = page.locator(`.pnl-asset-table tr[data-holding-id="${id}"]`);
          const holding = rows[index];
          requireCondition(await row.getAttribute("data-basis-status") === holding.basisStatus, `${id} basis attribute differs`);
          requireCondition(await row.getAttribute("data-pnl-eligibility") === holding.pnlEligibility, `${id} eligibility attribute differs`);
          requireCondition(await row.locator(".basis-chip").isVisible() && compactText(await row.locator(".basis-chip").innerText()) === holding.basisStatus, `${id} provenance chip not visible`);
          for (const [cell, value] of [["basis", holding.costBasisUsd], ["pnl", holding.pnlUsd]]) {
            requireCondition(await row.locator(`[data-pnl-cell="${cell}"]`).evaluate((element) => element.firstChild?.textContent) === expectedUsd(value), `${id} ${cell} differs from derived amount/null`);
          }
          const text = compactText(await row.innerText());
          requireCondition(text.includes(holding.pnlEligibility === "eligible" ? "Included in recorded P&L" : "Basis not recorded · excluded from P&L"), `${id} eligibility copy changed`);
          if (holding.basisStatus === "arrival-priced") {
            const note = await row.locator(".basis-chip").getAttribute("title");
            requireCondition((note ?? "").includes(": funding arrivals priced at their arrival-date ETH/USD, weighted average (owner rule 2026-09-11; convention extended 2026-09-12); "), "arrival chip fails to state the weighted-average owner convention exactly");
          }
        }
      });
      await check(`${label} preserves summary coverage copy and thinking mascot priority`, async () => {
        const summary = page.locator("[data-pnl-summary]");
        requireCondition(await summary.getAttribute("data-pnl-state") === (positive ? "partial" : "none"), "summary state differs from recorded subset");
        requireCondition((await summary.innerText()).includes(positive ? "Partial P&L (2 of 3 holdings have recorded basis)" : "No recorded cost basis yet — P&L unavailable"), "coverageLabel summary copy changed");
        requireCondition(compactText(await page.locator(".pnl-coverage .pnl-metric-line > strong").innerText()) === `${positive ? 2 : 0} / 3`, "coverage widget numerator/denominator differs");
        await assertMascot(page, "thinking");
        const toggle = page.locator("[data-mascot-toggle]");
        if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
        requireCondition(compactText(await page.locator("[data-mascot-bubble]").innerText()) === "Still mapping cost basis. Where I have no clean acquisition record I won't guess a number.", "no-evidence holding lost the unchanged thinking copy/priority");
      });
      await checkNoMutationControls(page, label);
    }
    await check(`${prefix} controls keep browser console clean`, async () => {
      requireCondition(browserErrors.length === 0, browserErrors.join(" | "));
    });
  } finally { await page.close(); }
}

async function auditDustFixtures(browser, fixtureUrl, viewport) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
  page.on("console", (message) => captureBrowserConsole(browserErrors, message));
  const prefix = `${viewport.name} render-only fixture`;
  try {
    for (const scenario of ["mixed", "empty", "wholesale", "failed", "inventory", "eth-outage", "fiat-outage"]) {
      for (const surface of ["home", "registry"]) {
        const label = `${prefix} ${scenario} ${surface}`;
        if (!await check(`${label} renders the real page through buildJoinedPortfolio`, async () => {
          const response = await page.goto(`${fixtureUrl}/?scenario=dust-${scenario}-${surface}`, { waitUntil: "networkidle", timeout: 15_000 });
          requireCondition(response?.ok(), `fixture HTTP ${response?.status() ?? "unavailable"}`);
          await page.locator(surface === "home" ? ".pnl-value-hero" : ".asset-registry-hero").waitFor();
        })) continue;
        const portfolio = await page.evaluate(() => window.__dustFixturePortfolio);
        const recordedHoldings = await page.evaluate(() => window.__dustFixtureRecordedHoldings);
        const displayable = (rows) => rows.filter((row) => Number.isFinite(row.valueUsd) && row.valueUsd >= 1);
        const displayed = {
          investments: displayable(portfolio.t212.investments), nfts: displayable(portfolio.nfts),
          native: displayable(portfolio.wallet.native), tokens: displayable(portfolio.wallet.tokens),
        };
        const marketRows = [...portfolio.t212.investments, ...portfolio.nfts, ...portfolio.wallet.native, ...portfolio.wallet.tokens];
        const displayRows = [...displayed.investments, ...displayed.nfts, ...displayed.native, ...displayed.tokens];
        await check(`${label} has no suppressed rows, labels, attributes or comments`, async () => {
          await assertNoSuppressionTrace(page);
          await assertMarketRowValues(page);
          const text = await renderedText(page);
          for (const name of ["SECURITY-SMALL", "SECURITY-UNKNOWN", "COLLECTION-SMALL", "COLLECTION-UNKNOWN", "COLLECTION-ZERO", "COLLECTION-POSITIVE", "NATIVE-SMALL", "TOKEN-SMALL", "TOKEN-UNKNOWN"]) {
            requireCondition(!text.includes(name), `${name} survived render-only suppression`);
          }
          const expectedFullRows = { mixed: 11, empty: 7, wholesale: 5, failed: 3, inventory: 11, "eth-outage": 10, "fiat-outage": 4 }[scenario];
          requireCondition(marketRows.length === expectedFullRows, "joined holding arrays lost full inventory rows");
          requireCondition(displayRows.length < marketRows.length, "displayed rows are not a strict subset of the joined inventory");
          requireCondition(Object.keys(recordedHoldings).length === marketRows.length + portfolio.manualHoldings.length, "recorded holdings map lost suppressed inventory identities");
          const coverage = portfolio.totals.pnlCoverage;
          requireCondition(coverage.totalHoldings === displayRows.length && coverage.dust === 0 && coverage.unpriced === 0, "coverage counts suppressed rows");
          requireCondition(coverage.eligible + coverage.notRecorded + coverage.unreconciled === coverage.totalHoldings, "coverage bucket identity is broken");
        });
        await check(`${label} counts exactly its DOM rows and preserves source truth`, async () => {
          const wallet = page.locator(surface === "home" ? ".home-wallet-panel" : ".asset-wallet-panel");
          const walletCount = await wallet.locator("tr[data-wallet-kind]").count();
          requireCondition(walletCount === displayed.native.length + displayed.tokens.length, "wallet DOM differs from displayable joined rows");
          if (surface === "home") {
            const counts = await readHomeWalletPanelCounts(wallet);
            const header = await readHomeWalletHeaderCounts(wallet);
            requireCondition(counts.native === displayed.native.length && counts.token === displayed.tokens.length, "wallet attributes differ from displayable joined rows");
            requireCondition(header.native === counts.native && header.token === counts.token && await readHomeWalletSummaryCount(page) === walletCount, "wallet header/hero count differs from DOM");
            requireCondition(await page.locator('.pnl-asset-table tbody tr:not([data-manual-cash="true"])').count() === portfolio.totals.pnlCoverage.totalHoldings, "P&L market row count differs from coverage");
            requireCondition(compactText(await page.locator(".pnl-coverage .pnl-metric-line > strong").innerText()) === `${portfolio.totals.pnlCoverage.eligible} / ${portfolio.totals.pnlCoverage.totalHoldings}`, "coverage numerator/denominator differs from displayed market holdings");
            for (const key of ["t212Positions", "nfts", "walletNative", "walletTokens"]) {
              requireCondition(compactText(await page.locator(`[data-source-key="${key}"] .live-source-badge`).innerText()) === portfolio.sources[key].status, `${key} source badge differs from joined status`);
            }
          } else {
            requireCondition(compactText(await wallet.locator(".asset-wallet-count .panel-count").innerText()) === `${walletCount} ASSETS`, "registry wallet header differs from rows");
            const securities = page.locator(".asset-live-panel").filter({ has: page.getByRole("heading", { name: "Live Securities Registry", exact: true }) });
            const nfts = page.locator(".asset-live-panel").filter({ has: page.getByRole("heading", { name: "Live NFT Collection Registry", exact: true }) });
            const positions = await securities.locator("tbody tr").count();
            const collections = await nfts.locator("tbody tr").count();
            const tokens = displayed.nfts.reduce((sum, row) => sum + row.tokenCount, 0);
            requireCondition(positions === displayed.investments.length && collections === displayed.nfts.length, "security/NFT registry DOM differs from displayable joined rows");
            requireCondition(compactText(await securities.locator(".panel-count").innerText()) === `${positions} POSITIONS`, "position header differs from displayed rows");
            requireCondition(compactText(await nfts.locator(".panel-count").innerText()) === `${collections} COLLECTIONS · ${tokens} TOKENS`, "NFT header counts suppressed collections/tokens");
            const summary = page.locator(".asset-registry-kpi").last();
            requireCondition(compactText(await summary.locator("strong").innerText()) === String(positions + collections + walletCount), "registry grand entry count differs from DOM");
            requireCondition(compactText(await summary.locator("small").innerText()) === `${positions} Stocks Port · ${collections + walletCount} Crypto Port assets`, "registry class summary differs from displayed rows");
          }
          if (walletCount === 0) {
            requireCondition(compactText(await wallet.locator(surface === "home" ? ".home-empty strong" : ".asset-empty-state strong").innerText()) === "No wallet holdings to display in this snapshot.", "neutral wallet empty copy changed");
            requireCondition(!/\$1|hidden|filter|no balances/i.test(await wallet.innerText()), "empty wallet exposes suppression or falsely claims no balances");
          }
          await assertWalletTotals(wallet, surface === "home" ? 4 : 5, surface === "home" ? 5 : 6, {
            rows: [...portfolio.wallet.native, ...portfolio.wallet.tokens], totalUsd: portfolio.totals.walletUsd, totalThb: portfolio.totals.walletThb,
          });
          const liveExpectation = await readWalletInventoryExpectation(page);
          requireCondition(liveExpectation.totalUsd === portfolio.totals.walletUsd && liveExpectation.totalThb === portfolio.totals.walletThb,
            "same-page full inventory sums differ from joined wallet totals/null semantics");
          await assertWalletTotals(wallet, surface === "home" ? 4 : 5, surface === "home" ? 5 : 6, liveExpectation);
        });
        await check(`${label} pins independent totals, boundary, cash exemption and outage behavior`, async () => {
          const expectedMarketCount = ["empty", "wholesale", "fiat-outage"].includes(scenario) ? 0 : scenario === "failed" ? 1 : scenario === "eth-outage" ? 2 : 4;
          requireCondition(portfolio.totals.pnlCoverage.totalHoldings === expectedMarketCount, "independent market holding count differs");
          const unavailable = ["wholesale", "failed", "eth-outage", "fiat-outage"].includes(scenario);
          const expectedAccountTotal = scenario === "empty" || scenario === "fiat-outage" ? 0.999 : 1.999;
          requireCondition(portfolio.t212.totalValue === expectedAccountTotal && portfolio.t212.investmentsCurrentValue === expectedAccountTotal, "filtered positions changed authoritative broker figures");
          requireCondition(scenario === "fiat-outage" ? portfolio.totals.t212Thb === null : Math.abs(portfolio.totals.t212Thb - expectedAccountTotal * 36) < 1e-9, "account THB differs from authoritative broker total/conversion availability");
          const expectedTotal = unavailable ? null : scenario === "empty" ? 3.996 : 8.246;
          requireCondition(expectedTotal === null ? portfolio.totals.grandTotalUsd === null : Math.abs(portfolio.totals.grandTotalUsd - expectedTotal) < 1e-9, "joined total differs from authoritative account plus full other classes");
          const hero = page.locator(surface === "home" ? '[data-value-currency="USD"]' : ".asset-registry-value");
          requireCondition(compactText(await hero.innerText()) === expectedUsd(expectedTotal), "hero differs from independent authoritative account sum/outage null");
          const expectedTotalThb = expectedTotal === null ? null : scenario === "empty" ? 143.856 : 296.856;
          requireCondition(expectedTotalThb === null ? portfolio.totals.grandTotalThb === null : Math.abs(portfolio.totals.grandTotalThb - expectedTotalThb) < 1e-9,
            "THB joined total differs from the full independent inventory");
          const heroThb = page.locator(surface === "home" ? ".pnl-value-hero .pnl-secondary" : ".asset-registry-secondary > span:first-child strong");
          requireCondition(compactText(await heroThb.innerText()) === `${expectedThb(expectedTotalThb)}${surface === "home" ? " THB" : ""}`,
            "THB hero omits suppressed holdings or loses outage null");
          if (surface === "home") {
            if (unavailable) requireCondition((await page.locator(".pnl-value-hero").innerText()).includes("Value unavailable"), "outage lost the unavailable hero");
            const expectedCash = ["empty", "wholesale", "eth-outage", "fiat-outage"].includes(scenario) ? [] : [0.25, 0];
            const cash = await page.locator('[data-manual-cash="true"] [data-pnl-cell="value"]').evaluateAll((cells) => cells.map((cell) => cell.firstChild?.textContent ?? ""));
            requireCondition(JSON.stringify(cash.map(parseDisplayedUsd)) === JSON.stringify(expectedCash), "manual quarter/zero cash pot exemption changed");
            requireCondition(await page.locator('.pnl-assets tbody tr').count() === expectedMarketCount + expectedCash.length, "P&L table lost cash exemption or reintroduced market rows");
            requireCondition(compactText(await page.locator(".pnl-assets .panel-count").innerText()) === `${expectedMarketCount + expectedCash.length} holdings to display`,
              "P&L holdings count includes suppressed market rows or omits manual cash");
          }
          if (scenario === "mixed" || scenario === "inventory") {
            requireCondition(displayRows.every((row) => row.valueUsd === 1), "exact $1 market boundary is not retained across four classes");
            requireCondition(Math.abs(portfolio.totals.walletUsd - 3.998) < 1e-9 && Math.abs(portfolio.totals.walletThb - 143.928) < 1e-9
              && Math.abs(portfolio.totals.nftsUsd - 1.999) < 1e-9, "full wallet/NFT subtotals omit known suppressed values");
            const suppressedKnown = marketRows.filter((row) => Number.isFinite(row.valueUsd) && row.valueUsd < 1);
            requireCondition(suppressedKnown.length === 4 && suppressedKnown.every((row) => Math.abs(row.valueUsd - 0.999) < 1e-9), "independent four $0.999 suppressed holdings changed");
            const displayedTotal = displayRows.reduce((sum, row) => sum + row.valueUsd, 0) + 0.25;
            const suppressedTotal = suppressedKnown.reduce((sum, row) => sum + row.valueUsd, 0);
            requireCondition(Math.abs(displayedTotal - 4.25) < 1e-9 && Math.abs(suppressedTotal - 3.996) < 1e-9
              && Math.abs(portfolio.totals.grandTotalUsd - displayedTotal - suppressedTotal) < 1e-9
              && suppressedTotal > 0 && suppressedTotal < suppressedKnown.length, "book/displayed difference is not exactly bounded by the four sub-$1 holdings");
            for (const id of ["t212:SECURITY-SMALL", "nft:collection-small", "native:8453", "token:1:0x0000000000000000000000000000000000000002"]) {
              requireCondition(Math.abs(recordedHoldings[id] - 0.999) < 1e-9, `${id} is absent or changed in the recorded holdings map`);
            }
            for (const id of ["t212:SECURITY-UNKNOWN", "nft:collection-unknown", "token:1:0x0000000000000000000000000000000000000003"]) {
              requireCondition(Object.hasOwn(recordedHoldings, id) && recordedHoldings[id] === null, `${id} is absent or valued instead of null in the recorded holdings map`);
            }
            requireCondition(portfolio.totals.pnlCoverage.eligible === 4, "priced evidence-backed holdings lost eligible coverage");
            requireCondition(portfolio.sources.walletTokens.status === "live", "mixed token pricing changed source status");
            requireCondition(portfolio.sources.nfts.status === (scenario === "inventory" ? "partial" : "live"), "NFT status conflates incomplete inventory and missing individual price");
            requireCondition(portfolio.totals.pnlCoverage.status === (scenario === "inventory" ? "partial" : "complete"), "suppression caused partial P&L or inventory incompleteness disappeared");
            if (surface === "home") {
              for (const [key, value] of [["t212", 1.999 + 0.25], ["crypto", 1.999 * 3]]) {
                requireCondition(compactText(await page.locator(`[data-value-class="${key}"] strong`).innerText()) === expectedUsd(value), `${key} class value differs from full joined holdings`);
              }
              const allocationValues = await page.locator(".pnl-allocation-item > div:first-child > strong").allTextContents();
              requireCondition(JSON.stringify(allocationValues.map(compactText)) === JSON.stringify([1.999 + 0.25, 1.999 * 3].map(expectedUsd)), "allocation values differ from full joined class sums");
            }
            return "$8.246 / ฿296.856 hero/book = $4.25 displayed + four $0.999 holdings ($3.996 < $4); all 13 recording identities retained";
          } else if (scenario === "empty") {
            requireCondition(Object.values(portfolio.sources).every((source) => source.status === "live"), "all-small mixed pricing book invents incomplete sources");
            requireCondition(portfolio.totals.pnlCoverage.status === "complete" && portfolio.totals.pnlCoverage.eligible === 0, "known zero displayed holdings invented partial coverage");
            requireCondition(!/(?:under|below)\s+\$1|hidden under|(?:wallet|asset) filter/i.test(await renderedText(page)), "all-small/unknown page exposes threshold or wallet-filter copy");
            const text = await renderedText(page);
            for (const claim of ["No holdings in this snapshot", "No positions yet", "No NFT collections found"]) {
              requireCondition(!text.includes(claim), `all-suppressed inventory falsely claims ${claim}`);
            }
            requireCondition(text.includes("No positions to display."), "all-suppressed securities lack neutral empty copy");
            if (surface === "home") {
              requireCondition(compactText(await page.locator(".pnl-assets .home-empty strong").innerText()) === "No holdings to display in this snapshot.", "all-suppressed P&L lacks neutral empty copy");
              requireCondition(compactText(await page.locator('[data-book-pnl="available"] .pnl-metric-line > strong').innerText()) === expectedUsd(-0.254),
                "all-suppressed book P&L omits the $3.996 full inventory value");
            } else {
              requireCondition(text.includes("No NFT collections to display."), "all-suppressed NFT registry lacks neutral empty copy");
            }
          } else if (scenario === "wholesale" || scenario === "failed") {
            for (const key of ["nfts", "walletNative", "walletTokens"]) requireCondition(portfolio.sources[key].status === "unavailable", `${key} outage became a zero/live class`);
            for (const key of ["nftsUsd", "walletNativeUsd", "walletTokensUsd"]) requireCondition(portfolio.totals[key] === null, `${key} outage became zero`);
            requireCondition(portfolio.totals.pnlCoverage.sourcesComplete === false && portfolio.totals.pnlCoverage.status === "partial", "outage no longer makes coverage incomplete");
          }
        });
        if (scenario === "mixed") {
          await check(`${label} live wallet-total assertion rejects inflated and omitted-value footers`, async () =>
            assertWalletTotalNegativeControls(page, surface));
        }
        if (scenario === "eth-outage" || scenario === "fiat-outage") {
          await check(`${label} keeps unavailable conversion dependencies null and renders no zero valuation`, async () => {
            const ethOutage = scenario === "eth-outage";
            const unavailableClasses = ethOutage ? ["nfts", "walletNative"] : ["t212Positions", "nfts", "walletNative", "walletTokens"];
            requireCondition(portfolio.sources[ethOutage ? "ethPrice" : "fiatFx"].status === "unavailable", "independent fixture lost the failed conversion feed");
            for (const key of unavailableClasses) requireCondition(portfolio.sources[key].status === "unavailable", `${key} conversion outage became a live/zero class`);
            const nullTotals = ethOutage
              ? ["nftsUsd", "nftsThb", "walletNativeUsd", "walletNativeThb", "grandTotalUsd", "grandTotalThb"]
              : ["t212Thb", "nftsThb", "walletNativeThb", "walletTokensThb", "walletThb", "grandTotalUsd", "grandTotalThb"];
            for (const key of nullTotals) requireCondition(portfolio.totals[key] === null, `${key} invents zero from suppressed rows despite its failed conversion dependency`);
            if (ethOutage) requireCondition(portfolio.sources.walletTokens.status === "live" && Math.abs(portfolio.totals.walletTokensUsd - 1.999) < 1e-9 && Math.abs(portfolio.totals.walletTokensThb - 71.964) < 1e-9
              && Math.abs(portfolio.totals.walletUsd - 1.999) < 1e-9 && Math.abs(portfolio.totals.walletThb - 71.964) < 1e-9, "ETH outage changed independent full token pricing/partial wallet aggregate");
            requireCondition(portfolio.totals.pnlCoverage.sourcesComplete === false && portfolio.totals.pnlCoverage.status === "partial", "conversion outage disappeared from source completeness");
            const heroUsd = page.locator(surface === "home" ? '[data-value-currency="USD"]' : ".asset-registry-value");
            const heroThb = page.locator(surface === "home" ? ".pnl-value-hero .pnl-secondary" : ".asset-registry-secondary > span:first-child strong");
            requireCondition(compactText(await heroUsd.innerText()) === "—", "conversion outage renders a zero USD book total");
            requireCondition(compactText(await heroThb.innerText()) === (surface === "home" ? "— THB" : "—"), "conversion outage renders a zero THB book total");
            if (surface === "home") {
              requireCondition(compactText(await page.locator(".pnl-hero-asof .pnl-status").innerText()) === "Value unavailable", "conversion outage is rendered as a finite partial joined value");
              for (const key of [...unavailableClasses, ethOutage ? "ethPrice" : "fiatFx"]) {
                requireCondition(compactText(await page.locator(`[data-source-key="${key}"] .live-source-badge`).innerText()) === "unavailable", `${key} failed dependency is missing its unavailable source badge`);
              }
              for (const key of ethOutage ? ["crypto"] : ["t212", "crypto"]) {
                const valueClass = page.locator(`[data-value-class="${key}"]`);
                requireCondition(compactText(await valueClass.locator(":scope > span:last-child").innerText()) === "—", `${key} renders a zero THB class subtotal`);
                if (ethOutage) requireCondition(compactText(await valueClass.locator("strong").innerText()) === "—", `${key} renders a zero USD class subtotal`);
              }
            } else {
              const nfts = page.locator(".asset-live-panel").filter({ has: page.getByRole("heading", { name: "Live NFT Collection Registry", exact: true }) });
              requireCondition(compactText(await nfts.locator(".asset-source-badge").innerText()) === "UNAVAILABLE", "NFT registry loses its unavailable source badge");
              requireCondition(await nfts.locator(".asset-empty-state.is-unavailable").count() === 1, "suppressed NFT rows render a known-empty state during a conversion outage");
              const nftKpi = page.locator(".asset-registry-kpi").nth(2);
              requireCondition(compactText(await nftKpi.locator("small").innerText()).split(" · ")[0] === "—", "NFT registry renders a zero THB subtotal");
              if (ethOutage) requireCondition(compactText(await nftKpi.locator("strong").innerText()) === "—", "NFT registry renders a zero USD subtotal");
              const walletBadges = page.locator(".asset-wallet-source-label .asset-source-badge");
              requireCondition(compactText(await walletBadges.nth(0).innerText()) === "UNAVAILABLE", "native registry loses its unavailable source badge");
              if (!ethOutage) requireCondition(compactText(await walletBadges.nth(1).innerText()) === "UNAVAILABLE", "token registry loses its unavailable FX dependency badge");
            }
            return ethOutage ? "0 and 0.1 ETH floors cannot mask failed NFT/native pricing; dependent totals stay null/—" : "all four market inputs are $0.999; failed fiat conversion keeps dependent totals null/—";
          });
        }
        await checkNoMutationControls(page, label);
      }
    }
    await check(`${prefix} inconsistent same-currency T212 triple still exercises the unreconciled alert`, async () => {
      const response = await page.goto(`${fixtureUrl}/?scenario=dust-unreconciled-home`, { waitUntil: "networkidle", timeout: 15_000 });
      requireCondition(response?.ok(), `fixture HTTP ${response?.status() ?? "unavailable"}`);
      const row = page.locator('.pnl-asset-table tr[data-pnl-eligibility="unreconciled"]');
      await row.waitFor();
      const portfolio = await page.evaluate(() => window.__dustFixturePortfolio);
      const holding = portfolio.t212.investments[0];
      requireCondition(holding.currency === "USD" && holding.pplCurrency === "USD"
        && holding.valueAccount === 100 && holding.costAccount === 90 && holding.pnlUsd === 5,
      "fixture no longer derives a genuinely inconsistent same-currency provider triple");
      requireCondition(portfolio.totals.pnlCoverage.unreconciled === 1 && portfolio.totals.pnlCoverage.eligible === 0,
        "inconsistent holding was not excluded from recorded P&L");
      requireCondition((await row.innerText()).includes("Unreconciled · excluded from P&L"), "unreconciled eligibility chip changed");
      requireCondition((await page.locator("[data-pnl-summary]").innerText()).includes("Recorded P&L unavailable — unreconciled holdings are excluded"),
        "unreconciled-only holdings lost the unavailable P&L explanation");
      await assertMascot(page, "alert");
      requireCondition(/holdings are unreconciled/i.test(await page.locator("[data-mascot-bubble]").innerText()),
        "provider inconsistency no longer drives the mascot unreconciled bubble");
      return "USD 100 - 90 != 5: real joined row, exclusion chip, unavailable summary and alert bubble retained";
    });
    await check(`${prefix} all scenarios keep browser console clean`, async () => {
      requireCondition(browserErrors.length === 0, browserErrors.join(" | "));
    });
  } finally {
    await page.close();
  }
}

async function auditMascotFixtures(browser, fixtureUrl, viewport) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  await installMascotSurfaceAudit(page);
  const browserErrors = [];
  let glbRequests = 0;
  page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
  page.on("console", (message) => captureBrowserConsole(browserErrors, message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/mascot/mascot-3d.glb") glbRequests++;
  });
  const prefix = `${viewport.name} mascot fixture`;
  try {
    const coveredMoods = new Set();
    // Exercise the real video fallback without downloading and parsing the
    // 4.48 MB model for every derivation case. The live block below separately
    // pins every motion transition in one WebGL instance.
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const fixture of browserFixture.mascotScenarios) {
      await check(`${prefix} ${fixture.scenario} derives ${fixture.mood} and maps fallback video`, async () => {
        const clock = new Date(browserFixture.asOf);
        clock.setUTCHours(fixture.hourUtc, 0, 0, 0);
        await page.clock.setFixedTime(clock);
        const response = await page.goto(`${fixtureUrl}/?scenario=${fixture.scenario}`, { waitUntil: "networkidle", timeout: 15_000 });
        requireCondition(response?.ok(), `fixture HTTP ${response?.status() ?? "unavailable"}`);
        await page.locator("[data-mascot-companion]").waitFor();
        await assertMascot(page, fixture.mood);
        requireCondition(await page.locator("[data-mascot-toggle]").getAttribute("aria-expanded") === "false", "new fixture defaults expanded");
        await assertMascotSurfaceState(page, "video");
        await assertOpaqueMascotBubble(page);
        await page.locator("[data-mascot-toggle]").click();
        await assertMascotExpanded(page);
        await assertMascotSurfaceState(page, "video");
        await assertMascotPlacement(page);
        await page.locator("[data-mascot-toggle]").click();
        await assertMascotResting(page);
        await assertNoStaticMascotAfterMotion(page);
        coveredMoods.add(fixture.mood);
        return fixture.description;
      });
    }
    await check(`${prefix} covers all nine distinct moods and video mappings`, async () => {
      requireCondition(mascotMoods.every((mood) => coveredMoods.has(mood)), `missing moods: ${mascotMoods.filter((mood) => !coveredMoods.has(mood)).join(", ")}`);
      const fixtureByMood = new Map(browserFixture.mascotScenarios.map((fixture) => [fixture.mood, fixture]));
      const reducedMoodOrder = [...mascotMoods.filter((mood) => mood !== "proud"), "proud"];
      const firstFixture = fixtureByMood.get(reducedMoodOrder[0]);
      const firstClock = new Date(browserFixture.asOf);
      firstClock.setUTCHours(firstFixture.hourUtc, 0, 0, 0);
      await page.clock.setFixedTime(firstClock);
      const response = await page.goto(`${fixtureUrl}/?scenario=${firstFixture.scenario}`, { waitUntil: "networkidle", timeout: 15_000 });
      requireCondition(response?.ok(), `fixture HTTP ${response?.status() ?? "unavailable"}`);
      await page.locator("[data-mascot-toggle]").click();
      await assertMascotExpanded(page);
      let previousClip = mascotMotions[reducedMoodOrder[0]];
      let previousVideo = await page.locator("[data-mascot-video]").elementHandle();
      await assertMascotSurfaceState(page, "video");
      for (const mood of reducedMoodOrder.slice(1)) {
        const fixture = fixtureByMood.get(mood);
        const clock = new Date(browserFixture.asOf);
        clock.setUTCHours(fixture.hourUtc, 0, 0, 0);
        await page.clock.setFixedTime(clock);
        await page.evaluate((scenario) => window.dispatchEvent(new CustomEvent("ui-fixture:scenario", { detail: scenario })), fixture.scenario);
        await page.locator(`[data-mascot-mood="${mood}"]`).waitFor();
        await assertMascotSurfaceState(page, "video");
        const expectedClip = mascotMotions[mood];
        const currentVideo = await page.locator("[data-mascot-video]").elementHandle();
        if (expectedClip !== previousClip) {
          requireCondition(await previousVideo.evaluate((video) => !video.isConnected && video.paused),
            `${previousClip} video was not stopped/removed before ${expectedClip}`);
          requireCondition(await currentVideo.evaluate((video) => video.currentTime < 1.5),
            `${expectedClip} in-document mood switch did not restart near zero`);
        }
        await previousVideo.dispose();
        previousVideo = currentVideo;
        previousClip = expectedClip;
      }
      await page.locator("[data-mascot-toggle]").click();
      await assertMascotResting(page, "video");
      requireCondition(await previousVideo.evaluate((video) => !video.isConnected && video.paused),
        "expanded proud video was not stopped/removed when collapse selected idle");
      await previousVideo.dispose();
      const neverStatic = await assertNoStaticMascotAfterMotion(page);
      requireCondition(glbRequests === 0, `reduced-motion derivation fixtures made ${glbRequests} GLB requests`);
      return `${coveredMoods.size} mood sprites retain intrinsic dimensions/alt text; all mapped videos play across reload and in-document mood changes; proud→idle collapse restarts; zero GLB requests · ${neverStatic}`;
    });

    await check(`${prefix} DOM WebGL 3D switches all nine mapped mood motions without re-downloading`, async () => {
      const requestsBefore = glbRequests;
      const fixtureByMood = new Map(browserFixture.mascotScenarios.map((fixture) => [fixture.mood, fixture]));
      const happyFixture = fixtureByMood.get("happy");
      const initialClock = new Date(browserFixture.asOf);
      initialClock.setUTCHours(happyFixture.hourUtc, 0, 0, 0);
      await page.clock.setFixedTime(initialClock);
      const response = await page.goto(`${fixtureUrl}/?scenario=${happyFixture.scenario}`, { waitUntil: "networkidle", timeout: 15_000 });
      requireCondition(response?.ok(), `fixture HTTP ${response?.status() ?? "unavailable"}`);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.locator("[data-mascot-toggle]").click();
      await assertMascotSurfaceState(page, "on");
      for (const mood of mascotMoods) {
        const fixture = fixtureByMood.get(mood);
        const clock = new Date(browserFixture.asOf);
        clock.setUTCHours(fixture.hourUtc, 0, 0, 0);
        await page.clock.setFixedTime(clock);
        await page.evaluate((scenario) => window.dispatchEvent(new CustomEvent("ui-fixture:scenario", { detail: scenario })), fixture.scenario);
        try {
          await page.waitForFunction(({ expectedMood, expectedMotion }) => {
            const companion = document.querySelector("[data-mascot-companion]");
            return companion?.getAttribute("data-mascot-mood") === expectedMood
              && companion.getAttribute("data-mascot-3d") === "on"
              && companion.querySelector("[data-mascot-canvas]")?.getAttribute("data-mascot-motion") === expectedMotion;
          }, { expectedMood: mood, expectedMotion: mascotMotions[mood] }, { timeout: 15_000 });
        } catch {
          const actual = await page.locator("[data-mascot-companion]").evaluate((companion) => ({
            mood: companion.getAttribute("data-mascot-mood"),
            state: companion.getAttribute("data-mascot-3d"),
            motion: companion.querySelector("[data-mascot-canvas]")?.getAttribute("data-mascot-motion") ?? null,
          }));
          throw new Error(`${mood}→${mascotMotions[mood]} transition stalled at ${JSON.stringify(actual)}`);
        }
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      const videoFallback = await assertMascotSurfaceState(page, "video");
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const restored = await assertMascotSurfaceState(page, "on");
      requireCondition(glbRequests - requestsBefore === 1, `nine in-document mood changes made ${glbRequests - requestsBefore} GLB requests`);
      requireCondition(await page.locator("[data-mascot-canvas]").getAttribute("data-mascot-motion") === mascotMotions.alert, "re-enabled viewer lost the current alert motion");
      const neverStatic = await assertNoStaticMascotAfterMotion(page);
      return `data-mascot-3d=on · ${mascotMoods.map((mood) => `${mood}→${mascotMotions[mood]}`).join(", ")} · on→video→on (${videoFallback}; ${restored}) · ${neverStatic} · one GLB request`;
    });

    await check(`${prefix} DOM new server props refresh mood and preserve expanded mute`, async () => {
      await page.goto(`${fixtureUrl}/?scenario=portfolio-mascot-thinking`, { waitUntil: "networkidle" });
      await assertMascot(page, "thinking");
      await page.locator("[data-mascot-toggle]").click();
      await page.getByLabel("Mute guide", { exact: true }).check();
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("ui-fixture:scenario", { detail: "portfolio-mascot-worried" })));
      await page.locator('[data-mascot-mood="worried"]').waitFor();
      requireCondition(await page.getByLabel("Mute guide", { exact: true }).isChecked(), "server prop change lost mute preference");
      requireCondition(await page.locator("[data-mascot-bubble]").count() === 0, "server prop change revealed a muted bubble");
      await assertMascotExpanded(page);
      requireCondition(await page.evaluate(() => localStorage.getItem("portmanager:mascot:muted")) === "true", "prop transition lost persisted mute");
      await page.getByLabel("Mute guide", { exact: true }).uncheck();
      await assertMascot(page, "worried");
      requireCondition(await page.locator("[data-mascot-bubble]").isVisible(), "unmute did not expose the latest server message");
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("ui-fixture:scenario", { detail: "portfolio-mascot-thinking" })));
      await page.locator('[data-mascot-mood="thinking"]').waitFor();
      requireCondition(/mapping cost basis/i.test(await page.locator("[data-mascot-bubble]").innerText()), "new mood retained a stale P&L message");
      await assertMascotExpanded(page);
      return "thinking → worried while muted: expanded controls retained, checkbox/aria-pressed/localStorage stay true, no bubble; unmute shows latest message";
    });
    await check(`${prefix} DOM new mood restarts a finite transient bubble without expanding`, async () => {
      await page.locator("[data-mascot-toggle]").click();
      await assertMascotResting(page);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("ui-fixture:scenario", { detail: "portfolio-mascot-alert" })));
      await page.locator('[data-mascot-mood="alert"]').waitFor();
      await assertOpaqueMascotBubble(page);
      requireCondition(await page.locator("[data-mascot-toggle]").getAttribute("aria-expanded") === "false" && !await page.locator(".mascot-controls").isVisible(), "new mood automatically expanded the panel");
      await page.locator("[data-mascot-bubble]").waitFor({ state: "detached", timeout: 8_000 });
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("ui-fixture:scenario", { detail: "portfolio-mascot-alert" })));
      await page.waitForTimeout(300);
      return assertMascotResting(page);
    });
    await check(`${prefix} DOM changed message with the same mood restarts the bubble`, async () => {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("ui-fixture:scenario", { detail: "portfolio-mascot-unreconciled" })));
      await page.locator("[data-mascot-bubble]").waitFor();
      await assertMascot(page, "alert");
      requireCondition(/holdings are unreconciled/i.test(await page.locator("[data-mascot-bubble]").innerText()), "same-mood prop transition retained the old source message");
      requireCondition(await page.locator("[data-mascot-toggle]").getAttribute("aria-expanded") === "false", "changed message automatically expanded the panel");
      await assertOpaqueMascotBubble(page);
      return "alert source message expired; alert unreconciled message is newly visible while controls remain hidden";
    });
    await check(`${prefix} DOM reduced motion keeps fallback video moving while CSS animation/fade is disabled`, async () => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.locator("[data-mascot-toggle]").click();
      await assertMascotExpanded(page);
      const fallback = await assertMascotSurfaceState(page, "video");
      const styles = await page.locator("[data-mascot-companion], [data-mascot-companion] *").evaluateAll((elements) => elements
        .filter((element) => element.tagName !== "SOURCE")
        .map((element) => {
          const style = getComputedStyle(element);
          return { animation: style.animationName, transition: style.transitionDuration, property: style.transitionProperty };
        }));
      requireCondition(styles.length > 0 && styles.every((style) => style.animation === "none"
        && style.transition.split(",").every((duration) => parseFloat(duration) === 0)), "mascot CSS animation or transition remains enabled under reduced motion");
      await page.locator("[data-mascot-toggle]").click();
      await assertMascotResting(page);
      const neverStatic = await assertNoStaticMascotAfterMotion(page);
      return `${fallback} · ${styles.length} expanded companion elements: CSS animation-name=none, transition durations=0; native video continues; collapse leaves compact chip · ${neverStatic}`;
    });
    await check(`${prefix} console remains clean across every mood and prop transition`, async () => {
      requireCondition(browserErrors.length === 0, browserErrors.join(" | "));
    });
  } finally {
    await page.close();
  }
}

async function auditMascotRestingIdle(browser, fixtureUrl, viewport) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "no-preference" });
  await installMascotSurfaceAudit(page);
  const browserErrors = [];
  let glbRequests = 0;
  let restingCanvas;
  page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
  page.on("console", (message) => captureBrowserConsole(browserErrors, message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/mascot/mascot-3d.glb") glbRequests++;
  });
  await page.addInitScript(() => {
    window.mascotWebglProbes = 0;
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function countedWebgl(type, ...args) {
      if (type === "webgl2") window.mascotWebglProbes++;
      return Reflect.apply(getContext, this, [type, ...args]);
    };
  });
  const prefix = `${viewport.name} mascot fixture`;
  const assertSameCanvas = async () => {
    requireCondition(restingCanvas && await restingCanvas.evaluate((canvas) => canvas.isConnected
      && canvas === document.querySelector("[data-mascot-canvas]")), "expansion/collapse replaced the resting canvas");
    requireCondition(await page.evaluate(() => window.mascotWebglProbes) === 1, "expansion/collapse reinitialised WebGL");
    requireCondition(glbRequests === 1, `page made ${glbRequests} GLB requests instead of one`);
  };
  try {
    await check(`${prefix} DOM WebGL resting chip plays idle without a click`, async () => {
      const response = await page.goto(`${fixtureUrl}/?scenario=portfolio-mascot-excited`, { waitUntil: "networkidle", timeout: 15_000 });
      requireCondition(response?.ok(), `fixture HTTP ${response?.status() ?? "unavailable"}`);
      await assertMascot(page, "excited");
      await assertMascotSurfaceState(page, "on");
      requireCondition(await page.locator("[data-mascot-toggle]").getAttribute("aria-expanded") === "false", "idle motion needed expansion");
      restingCanvas = await page.locator("[data-mascot-canvas]").elementHandle();
      await assertSameCanvas();
      await page.locator("[data-mascot-bubble]").waitFor({ state: "detached", timeout: 8_000 });
      return `${await assertMascotResting(page)} · no click · one GLB request`;
    });
    await check(`${prefix} WebGL resting idle changes rendered frames continuously`, async () => {
      const frames = [];
      for (let index = 0; index < 3; index++) {
        frames.push(await page.locator("[data-mascot-canvas]").evaluate((canvas) => new Promise((resolve) => {
          requestAnimationFrame(() => resolve(canvas.toDataURL()));
        })));
        await page.waitForTimeout(900);
      }
      requireCondition(new Set(frames).size === frames.length, "resting idle renders identical frames instead of moving");
      await assertSameCanvas();
      await assertMascotResting(page);
      return `${new Set(frames).size}/${frames.length} distinct rendered frames · idle still live after announcement · same canvas`;
    });
    await check(`${prefix} DOM WebGL expand/collapse preserves canvas and switches idle to excited_bounce`, async () => {
      const toggle = page.locator("[data-mascot-toggle]");
      for (let cycle = 0; cycle < 2; cycle++) {
        await toggle.click();
        await assertMascotExpanded(page);
        await assertMascotSurfaceState(page, "on");
        requireCondition(await page.locator("[data-mascot-canvas]").getAttribute("data-mascot-motion") === "excited_bounce", "expanded excited fixture lost its mood clip");
        await assertSameCanvas();
        if (cycle === 0) await toggle.click();
        else {
          await page.getByLabel("Mute guide", { exact: true }).focus();
          await page.keyboard.press("Escape");
          requireCondition(await toggle.evaluate((button) => document.activeElement === button), "Escape did not return focus to chip");
        }
        await assertMascotResting(page);
        await assertSameCanvas();
      }
      return `idle → excited_bounce → idle twice (click + Escape) · same canvas/WebGL context · 126×189px expanded box / 128×262px card · ${glbRequests} total GLB request`;
    });
    await check(`${prefix} DOM WebGL collapsed mood updates retain idle and the mounted canvas`, async () => {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("ui-fixture:scenario", { detail: "portfolio-mascot-happy" })));
      await page.locator('[data-mascot-mood="happy"]').waitFor();
      await assertMascot(page, "happy");
      await assertMascotSurfaceState(page, "on");
      requireCondition(await page.locator("[data-mascot-toggle]").getAttribute("aria-expanded") === "false", "mood update expanded resting chip");
      await assertSameCanvas();
      return "excited → happy server props · still collapsed/idle · same canvas · one GLB request";
    });
    await check(`${prefix} DOM WebGL resting reduced-motion toggle hands idle to video and restores live`, async () => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const fallback = await assertMascotSurfaceState(page, "video");
      requireCondition(await page.locator(".mascot-3d-host").count() === 0, "reduced motion retains the viewer host");
      requireCondition(await restingCanvas.evaluate((canvas) => !canvas.isConnected), "reduced motion did not remove live canvas");
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const restored = await assertMascotSurfaceState(page, "on");
      requireCondition(await page.locator("[data-mascot-toggle]").getAttribute("aria-expanded") === "false", "restored idle needed expansion");
      requireCondition(glbRequests === 1, `restoring idle made ${glbRequests} GLB requests`);
      requireCondition(await page.locator("[data-mascot-video]").count() === 0, "restored live viewer retains fallback video");
      return `on → video → on while collapsed · ${fallback} · ${restored} · cached GLB`;
    });
    await check(`${prefix} DOM WebGL context loss switches the live idle canvas to playing video`, async () => {
      const liveCanvas = page.locator("[data-mascot-canvas]");
      requireCondition(await liveCanvas.count() === 1, "context-loss fixture has no live canvas");
      await liveCanvas.dispatchEvent("webglcontextlost", { cancelable: true });
      const fallback = await assertMascotSurfaceState(page, "video");
      requireCondition(await liveCanvas.count() === 0, "context loss leaves the canvas mounted");
      requireCondition(glbRequests === 1, `context loss made ${glbRequests} GLB requests`);
      const neverStatic = await assertNoStaticMascotAfterMotion(page);
      return `${fallback} · one cached GLB request · ${neverStatic}`;
    });
    await check(`${prefix} WebGL resting idle and transition console stays clean`, async () => {
      requireCondition(browserErrors.length === 0, browserErrors.join(" | "));
      return "zero page/console errors or Three/WebGL warnings";
    });
  } finally {
    await restingCanvas?.dispose();
    await page.close();
  }
}

async function auditMascotLoading(browser, fixtureUrl, viewport) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "no-preference" });
  await installMascotSurfaceAudit(page);
  let releaseModel;
  const modelGate = new Promise((resolve) => { releaseModel = resolve; });
  let glbRequests = 0;
  const mediaRequests = [];
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
  page.on("console", (message) => captureBrowserConsole(browserErrors, message));
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/^\/mascot\/motion-/.test(pathname)) mediaRequests.push(pathname);
  });
  page.on("requestfailed", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/^\/mascot\/motion-/.test(pathname)) browserErrors.push(`media request failed: ${pathname} (${request.failure()?.errorText ?? "unknown"})`);
  });
  await page.route("**/mascot/mascot-3d.glb", async (route) => {
    glbRequests++;
    await modelGate;
    await route.continue();
  });
  try {
    await check(`${viewport.name} mascot fixture DOM WebGL loading plays video then hands off to the live canvas`, async () => {
      const requested = page.waitForRequest("**/mascot/mascot-3d.glb");
      await page.goto(`${fixtureUrl}/?scenario=portfolio-mascot-excited`, { waitUntil: "domcontentloaded" });
      await requested;
      await assertMascot(page, "excited");
      requireCondition(await page.locator("[data-mascot-canvas]").count() === 0, "loading GLB exposes a canvas before it is ready");
      const before = await page.locator(".mascot-card").boundingBox();
      const fallback = await assertMascotSurfaceState(page, "video");
      const fallbackVideo = await page.locator("[data-mascot-video]").elementHandle();
      releaseModel();
      const live = await assertMascotSurfaceState(page, "on");
      const after = await page.locator(".mascot-card").boundingBox();
      requireCondition(JSON.stringify(before) === JSON.stringify(after), `loading shifted resting card: ${JSON.stringify({ before, after })}`);
      requireCondition(await fallbackVideo.evaluate((video) => !video.isConnected && video.paused),
        "loading fallback video was not stopped and removed after live canvas attachment");
      requireCondition(glbRequests === 1, `loading made ${glbRequests} GLB requests`);
      requireCondition(mediaRequests.length > 0 && mediaRequests.every((path) => path === "/mascot/motion-idle.webm"),
        `loading requested unused/fallback media sources: ${mediaRequests.join(", ") || "none"}`);
      requireCondition(browserErrors.length === 0, browserErrors.join(" | "));
      const neverStatic = await assertNoStaticMascotAfterMotion(page);
      return `video → on · ${fallback} · ${live} · stopped/removed video · ${after.width}×${after.height}px unchanged card · one GLB · WebM-only request · ${neverStatic}`;
    });
  } finally {
    releaseModel();
    await page.close();
  }
}

async function auditMascotReducedMotion(browser, url, viewport, originLabel) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
  await installMascotSurfaceAudit(page);
  const browserErrors = [];
  let glbRequests = 0;
  page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
  page.on("console", (message) => captureBrowserConsole(browserErrors, message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/mascot/mascot-3d.glb") glbRequests++;
  });
  await page.addInitScript(() => {
    window.mascotWebglProbes = 0;
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function countedWebgl(type, ...args) {
      if (type === "webgl2") window.mascotWebglProbes++;
      return Reflect.apply(getContext, this, [type, ...args]);
    };
  });
  try {
    await check(`${viewport.name} ${originLabel} mascot DOM reduced motion plays video without mounting WebGL`, async () => {
      const response = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
      requireCondition(response?.ok(), `HTTP ${response?.status() ?? "unavailable"}`);
      await assertMascot(page);
      const fallback = await assertMascotSurfaceState(page, "video");
      requireCondition(await page.locator("[data-mascot-toggle]").getAttribute("aria-expanded") === "false", "reduced-motion page starts expanded");
      requireCondition(await page.locator(".mascot-3d-host").count() === 0, "reduced motion mounts the viewer");
      const styles = await page.locator("[data-mascot-companion], [data-mascot-companion] *").evaluateAll((elements) => elements
        .filter((element) => element.tagName !== "SOURCE")
        .map((element) => {
          const style = getComputedStyle(element);
          return { animation: style.animationName, transition: style.transitionDuration, property: style.transitionProperty };
        }));
      requireCondition(styles.every((style) => style.animation === "none"
        && style.transition.split(",").every((duration) => parseFloat(duration) === 0)), "reduced-motion CSS animation or transition remains enabled");
      const pixelMotion = await assertMascotScreenshotMotion(page, 700);
      await page.evaluate(() => {
        window.__mascotTestHidden = true;
        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => window.__mascotTestHidden,
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForFunction(() => document.querySelector("[data-mascot-video]")?.paused === true);
      await page.evaluate(() => {
        window.__mascotTestHidden = false;
        document.dispatchEvent(new Event("visibilitychange"));
      });
      const resumed = await assertMascotVideoPlaying(page, "idle");
      await page.locator("[data-mascot-bubble]").waitFor({ state: "detached", timeout: 8_000 });
      const detail = await assertMascotResting(page);
      requireCondition(await page.evaluate(() => window.mascotWebglProbes) === 0 && glbRequests === 0, "reduced-motion startup attempted WebGL or fetched the GLB");
      requireCondition(browserErrors.length === 0, browserErrors.join(" | "));
      const neverStatic = await assertNoStaticMascotAfterMotion(page);
      return `${fallback} · ${detail} · ${pixelMotion} · hidden pauses/visible resumes (${resumed}) · zero WebGL probes/GLB requests · CSS animation/fade disabled · ${neverStatic} · clean console`;
    });
  } finally {
    await page.close();
  }
}

async function auditMascotNoWebgl(browser, fixtureUrl, viewport) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  await installMascotSurfaceAudit(page);
  const browserErrors = [];
  let glbRequests = 0;
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function disabledWebgl(type, ...args) {
      if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
      return Reflect.apply(getContext, this, [type, ...args]);
    };
  });
  page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
  page.on("console", (message) => captureBrowserConsole(browserErrors, message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/mascot/mascot-3d.glb") glbRequests++;
  });
  const prefix = `${viewport.name} mascot fixture`;
  try {
    await check(`${prefix} DOM WebGL disabled plays video and restarts clips on expand/collapse`, async () => {
      const response = await page.goto(`${fixtureUrl}/?scenario=portfolio-mascot-happy`, { waitUntil: "networkidle", timeout: 15_000 });
      requireCondition(response?.ok(), `fixture HTTP ${response?.status() ?? "unavailable"}`);
      await assertMascot(page, "happy");
      const initial = await assertMascotSurfaceState(page, "video");
      requireCondition(await page.locator("[data-mascot-toggle]").getAttribute("aria-expanded") === "false", "WebGL-disabled fixture starts expanded");
      await page.waitForTimeout(250);
      await page.locator("[data-mascot-toggle]").click();
      await assertMascotExpanded(page);
      const detail = await assertMascotSurfaceState(page, "video");
      requireCondition(await page.locator("[data-mascot-video]").evaluate((video) => video.currentTime < 1.5),
        "expanded happy_clap fallback did not restart near time zero");
      requireCondition(glbRequests === 0, `WebGL-disabled fallback requested the GLB ${glbRequests} times`);
      await page.locator("[data-mascot-toggle]").click();
      const resting = await assertMascotResting(page, "video");
      requireCondition(await page.locator("[data-mascot-video]").evaluate((video) => video.currentTime < 1.5),
        "collapsed idle fallback did not restart near time zero");
      const neverStatic = await assertNoStaticMascotAfterMotion(page);
      return `${initial} · idle→happy_clap→idle with near-zero restarts · ${detail} · ${resting} · zero GLB requests · ${neverStatic}`;
    });
    await check(`${prefix} WebGL-disabled mascot fallback console is clean`, async () => {
      await page.waitForTimeout(200);
      requireCondition(browserErrors.length === 0, browserErrors.join(" | "));
      return "zero page errors or Three/WebGL warnings";
    });
  } finally {
    await page.close();
  }
}

async function auditMascotLoadError(browser, fixtureUrl, viewport) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  await installMascotSurfaceAudit(page);
  const browserErrors = [];
  let glbRequests = 0;
  await page.route("**/mascot/mascot-3d.glb", async (route) => {
    glbRequests++;
    await route.fulfill({ status: 200, contentType: "model/gltf-binary", body: "invalid glb fixture" });
  });
  page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
  page.on("console", (message) => captureBrowserConsole(browserErrors, message));
  const prefix = `${viewport.name} mascot fixture`;
  try {
    await check(`${prefix} DOM WebGL malformed GLB keeps playing video at rest and after expansion`, async () => {
      const response = await page.goto(`${fixtureUrl}/?scenario=portfolio-mascot-happy`, { waitUntil: "networkidle", timeout: 15_000 });
      requireCondition(response?.ok(), `fixture HTTP ${response?.status() ?? "unavailable"}`);
      await assertMascot(page, "happy");
      await assertMascotSurfaceState(page, "video");
      requireCondition(await page.locator("[data-mascot-toggle]").getAttribute("aria-expanded") === "false", "malformed-GLB fallback needed expansion");
      await page.locator("[data-mascot-toggle]").click();
      await assertMascotExpanded(page);
      const detail = await assertMascotSurfaceState(page, "video");
      await page.locator("[data-mascot-toggle]").click();
      const resting = await assertMascotResting(page, "video");
      await page.waitForTimeout(200);
      requireCondition(glbRequests === 1, `malformed-GLB fallback made ${glbRequests} model requests`);
      requireCondition(browserErrors.length === 0, browserErrors.join(" | "));
      const neverStatic = await assertNoStaticMascotAfterMotion(page);
      return `${detail} · ${resting} · one request · ${neverStatic} · zero page/video errors or Three/WebGL warnings`;
    });
  } finally {
    await page.close();
  }
}

async function auditMascotInteractions(browser, viewport) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const browserErrors = [];
  const mascotInfo = [];
  let glbRequests = 0;
  page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));
  page.on("console", (message) => {
    captureBrowserConsole(browserErrors, message);
    if (message.text().startsWith("[mascot-3d] gltf.animations")) mascotInfo.push(message.text());
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/mascot/mascot-3d.glb") glbRequests++;
  });
  const prefix = `${viewport.name} production mascot`;
  try {
    const ready = await check(`${prefix} interaction route loads`, async () => {
      const response = await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 45_000 });
      requireCondition(response?.ok(), `HTTP ${response?.status() ?? "unavailable"}`);
      await assertMascot(page);
      requireCondition(await page.locator("[data-mascot-toggle]").getAttribute("aria-expanded") === "false", "fresh production document defaults expanded");
      requireCondition(await page.locator("[data-mascot-bubble]").isVisible(), "fresh default bubble is not visible");
    });
    if (!ready) return;
    await check(`${prefix} DOM transient bubble is opaque white without alpha`, () => assertOpaqueMascotBubble(page));
    await check(`${prefix} DOM resting chip has no visible bubble or controls after six seconds`, async () => {
      // Observe the real production timer and its fading DOM mutation. The
      // shell must stay opaque even while its own text is fading away.
      const timing = await page.evaluate(() => new Promise((resolve, reject) => {
        const companion = document.querySelector("[data-mascot-companion]");
        const started = performance.now();
        let fading;
        const observer = new MutationObserver(() => {
          const bubble = companion.querySelector("[data-mascot-bubble]");
          if (bubble?.classList.contains("is-fading")) {
            const opacities = [];
            for (let element = bubble; element; element = element.parentElement) opacities.push(getComputedStyle(element).opacity);
            fading = { background: getComputedStyle(bubble).backgroundColor, opacities };
          }
          if (!bubble) {
            clearTimeout(timeout);
            observer.disconnect();
            resolve({ elapsed: performance.now() - started, fading });
          }
        });
        const timeout = setTimeout(() => { observer.disconnect(); reject(new Error("initial bubble did not settle within eight seconds")); }, 8_000);
        observer.observe(companion, { childList: true, attributes: true, subtree: true });
      }));
      requireCondition(timing.elapsed >= 4_000 && timing.elapsed <= 8_000, `transient bubble duration after initial DOM checks was ${Math.round(timing.elapsed)}ms, expected about six seconds`);
      requireCondition(timing.fading?.background === "rgb(255, 255, 255)" && timing.fading.opacities.every((opacity) => Number(opacity) === 1), "bubble shell becomes translucent during its dismissal fade");
      const resting = await assertMascotResting(page);
      await page.waitForTimeout(300);
      await assertMascotResting(page);
      return `${resting} · settled in ${Math.round(timing.elapsed)}ms after initial DOM checks · opaque through fade · no repeat`;
    });
    await check(`${prefix} DOM resting occlusion leaves home hero as-of/status metadata visible and hittable`, async () => {
      await assertMascotResting(page);
      return assertHomeMascotOcclusion(page, ".pnl-hero-asof > .pnl-status, .pnl-hero-asof > small, .pnl-hero-asof > p", "hero as-of/status metadata");
    });
    await check(`${prefix} DOM resting occlusion leaves home class legend visible and hittable`, async () => {
      await assertMascotResting(page);
      requireCondition(await page.locator(".pnl-class-values [data-value-class]").count() === 2, "home class legend does not contain exactly Stocks Port and Crypto Port");
      for (const key of ["t212", "crypto"]) requireCondition(await page.locator(`.pnl-class-values [data-value-class="${key}"]`).count() === 1, `missing or duplicate value class ${key}`);
      return assertHomeMascotOcclusion(page, ".pnl-class-values [data-value-class] > small, .pnl-class-values [data-value-class] > strong, .pnl-class-values [data-value-class] > span:not(.pnl-class-dot)", "two-class legend labels and USD/THB values");
    });
    await check(`${prefix} DOM WebGL 3D click expands the live viewer; panel stays expanded`, async () => {
      await page.locator("[data-mascot-toggle]").click();
      const detail = await assertMascotExpanded(page);
      const viewerDetail = await assertMascotSurfaceState(page, "on");
      requireCondition(glbRequests === 1, `resting/expansion requested the GLB ${glbRequests} times`);
      requireCondition(mascotInfo.includes('[mascot-3d] gltf.animations ["idle","happy_clap","excited_bounce"]'),
        `exact gltf.animations log is missing: ${mascotInfo.join(" | ")}`);
      await assertOpaqueMascotBubble(page);
      await assertMascotPlacement(page);
      await page.waitForTimeout(6_300);
      await assertMascotExpanded(page);
      await assertMascotSurfaceState(page, "on");
      return `${detail} · ${viewerDetail} · exact gltf.animations log · bubble/controls/live loop remain beyond the transient deadline`;
    });
    await check(`${prefix} DOM second click collapses back to the resting chip`, async () => {
      await page.locator("[data-mascot-toggle]").click();
      return assertMascotResting(page);
    });
    await check(`${prefix} DOM keyboard expands cached 3D viewer; Escape collapses and restores chip focus`, async () => {
      const toggle = page.locator("[data-mascot-toggle]");
      await toggle.focus();
      await page.keyboard.press("Enter");
      await assertMascotExpanded(page);
      await assertMascotSurfaceState(page, "on");
      requireCondition(glbRequests === 1, `re-expansion re-downloaded the GLB (${glbRequests} requests)`);
      await page.getByLabel("Mute guide", { exact: true }).focus();
      await page.keyboard.press("Escape");
      await assertMascotResting(page);
      requireCondition(await toggle.evaluate((button) => document.activeElement === button), "Escape from mute did not restore chip focus");
      await page.keyboard.press("Space");
      await assertMascotExpanded(page);
      await assertMascotSurfaceState(page, "on");
      requireCondition(glbRequests === 1, `second re-expansion re-downloaded the GLB (${glbRequests} requests)`);
      await page.getByRole("button", { name: "Hide guide", exact: true }).focus();
      await page.keyboard.press("Escape");
      await assertMascotResting(page);
      requireCondition(await toggle.evaluate((button) => document.activeElement === button), "Escape from hide did not restore chip focus");
      return "Enter and Space expand cached 3D bytes without another GLB request; Escape from Mute guide and Hide guide collapses, aria-expanded=false, focus returns to chip";
    });
    await check(`${prefix} DOM mute hides the bubble, retains the a11y sprite underlay and persists on reload`, async () => {
      await page.locator("[data-mascot-toggle]").click();
      const mute = page.getByLabel("Mute guide", { exact: true });
      await mute.check();
      requireCondition(await mute.isChecked() && await mute.getAttribute("aria-pressed") === "true", "mute does not expose its pressed state");
      requireCondition(await page.locator("[data-mascot-bubble]").count() === 0 && await page.locator("[data-mascot-companion] img").isVisible(), "mute hides the sprite or leaves a bubble");
      requireCondition(await page.evaluate(() => localStorage.getItem("portmanager:mascot:muted")) === "true", "mute is not stored client-side");
      await assertMascotExpanded(page);
      await page.reload({ waitUntil: "networkidle" });
      await assertMascotResting(page);
      await page.locator("[data-mascot-toggle]").click();
      requireCondition(await mute.isChecked() && await mute.getAttribute("aria-pressed") === "true", "reload lost mute");
      requireCondition(await page.locator("[data-mascot-bubble]").count() === 0 && await page.locator("[data-mascot-companion] img").isVisible(), "reload reveals a muted bubble or loses the sprite");
      await mute.focus();
      await page.keyboard.press("Space");
      requireCondition(!await mute.isChecked() && await mute.getAttribute("aria-pressed") === "false", "keyboard unmute does not update state");
      requireCondition(await page.locator("[data-mascot-bubble]").isVisible(), "keyboard unmute does not restore bubble");
      await mute.focus();
      await page.keyboard.press("Enter");
      requireCondition(await mute.isChecked() && !await page.locator("[data-mascot-bubble]").isVisible(), "Enter does not mute the guide");
      await page.keyboard.press("Enter");
      requireCondition(!await mute.isChecked() && await page.locator("[data-mascot-bubble]").isVisible(), "Enter does not unmute the guide");
      return "mute checkbox/aria-pressed/localStorage agree · accessible sprite DOM underlay retained beneath motion surface · reload rests silently · Space/Enter unmute restore current bubble";
    });
    await check(`${prefix} DOM hide removes the companion, survives client navigation and resets on reload`, async () => {
      const documentToken = await page.evaluate(() => performance.timeOrigin);
      await page.getByRole("button", { name: "Hide guide", exact: true }).click();
      requireCondition(await page.locator("[data-mascot-companion]").count() === 0, "hide leaves the companion visible");
      requireCondition(await page.evaluate(() => localStorage.getItem("portmanager:mascot:hidden-document")) === String(documentToken), "hide is not persisted for this document");
      for (const [name, route] of [["Portfolio", "/portfolio"], ["Asset List", "/asset-list"], ["Exchange Rate", "/exchange-rate"], ["Home", "/"]]) {
        await page.locator(".nav-menu").getByRole("link", { name, exact: true }).click();
        await page.waitForURL(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
        requireCondition(await page.evaluate(() => performance.timeOrigin) === documentToken, `${route} used a full document load instead of client navigation`);
        requireCondition(await page.locator("[data-mascot-companion]").count() === 0, `${route} lost hidden state on client navigation`);
      }
      await page.reload({ waitUntil: "networkidle" });
      requireCondition(await page.evaluate(() => performance.timeOrigin) !== documentToken, "reload did not create a new document");
      await assertMascot(page);
      requireCondition(await page.locator("[data-mascot-toggle]").getAttribute("aria-expanded") === "false", "reload restored an expanded panel");
      await page.locator("[data-mascot-toggle]").click();
      requireCondition(!await page.getByLabel("Mute guide", { exact: true }).isChecked(), "reload lost the separately persisted unmuted state");
      return "companion absent across all four pages in one document; collapsed chip restored after reload; independent mute preference retained";
    });
    await check(`${prefix} DOM interaction and hydration console stays clean`, async () => {
      requireCondition(browserErrors.length === 0, browserErrors.join(" | "));
      return "zero page errors, hydration errors or console errors";
    });
  } finally {
    await page.close();
  }
}

async function auditRoute(browser, route, viewport) {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  const browserErrors = [];

  page.on("console", (message) => {
    captureBrowserConsole(browserErrors, message);
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

    await checkMascotRoute(page, route, viewport, response);

    await check(`${viewport.name} ${route.path} uses the light Outfit design`, async () => {
      const theme = await page.evaluate(() => ({
        htmlDark: document.documentElement.classList.contains("bp6-dark"),
        bodyDark: document.body.classList.contains("bp6-dark"),
        darkProviders: document.querySelectorAll(".bp6-dark").length,
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        background: getComputedStyle(document.body).backgroundColor,
        font: getComputedStyle(document.body).fontFamily,
      }));
      requireCondition(!theme.htmlDark && !theme.bodyDark && theme.darkProviders === 0, "bp6-dark remains on html/body or a provider");
      requireCondition(theme.colorScheme.includes("light") && !theme.colorScheme.includes("dark"), `computed color-scheme is ${theme.colorScheme || "unset"}`);
      requireCondition(theme.background === "rgb(245, 247, 251)", `page background is ${theme.background}, expected #F5F7FB`);
      requireCondition(/outfit/i.test(theme.font), `body font is ${theme.font}, expected Outfit`);
    });

    await check(`${viewport.name} ${route.path} uses the reference card tokens`, async () => {
      const cards = await page.locator(".panel, .kpi-card, .asset-kpi-card, .portfolio-kpi-card, .login-panel").evaluateAll((elements) => elements.map((element) => {
        const style = getComputedStyle(element);
        return { className: element.className, background: style.backgroundColor,
          border: style.borderTopColor, width: style.borderTopWidth, radius: style.borderTopLeftRadius,
          shadow: style.boxShadow };
      }));
      requireCondition(cards.length > 0, "no content card is rendered");
      for (const card of cards) {
        requireCondition(card.background === "rgb(255, 255, 255)", `${card.className} is not white`);
        requireCondition(card.border === "rgb(223, 229, 242)" && card.width === "1px", `${card.className} lacks the #DFE5F2 1px border`);
        requireCondition(card.radius === "10px", `${card.className} radius is ${card.radius}, expected 10px`);
        requireCondition(/rgba\(21, 35, 72, 0\.07\) 0px 14px 35px(?: 0px)?/.test(card.shadow), `${card.className} shadow is ${card.shadow}`);
      }
      return `${cards.length} white cards · 10px radius · reference border/shadow`;
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

    await checkNoMutationControls(page, `${viewport.name} ${route.name}`);
    await check(`${viewport.name} ${route.name} has no suppressed market rows or disclosure traces`, async () => {
      await assertNoSuppressionTrace(page);
      await assertMarketRowValues(page);
    });
    await checkOwnershipLanguage(page, `${viewport.name} ${route.name}`);
    if (route.name === "login") {
      await check(`${viewport.name} login preserves the Google sign-in gate`, async () => {
        requireCondition(await page.getByRole("link", { name: "Continue with Google", exact: true }).count() === 1, "Google sign-in link is missing or duplicated");
        requireCondition(await page.locator('a.google-signin-button[href="/api/auth/login"]').count() === 1, "Google sign-in destination changed");
        requireCondition(await page.locator('form, a[href="/api/auth/logout"]').count() === 0, "login unexpectedly renders a form or logout link");
      });
    } else {
      await checkSidebarLogoutContract(page, route.path, viewport.name);
    }

    if (route.name === "home") {
      await checkPnlContract(page);
      await checkHomeContract(page);
    }
    if (route.name === "asset-list" || route.name === "exchange-rate" || route.name === "asset-master") {
      await checkReadonlyLivePage(page, `${viewport.name} ${route.name}`);
    }
    if (route.name === "asset-list" || route.name === "asset-master") await checkAssetWalletContract(page);
    if (route.name === "portfolio") await checkPortfolioContract(page);

    await page.waitForTimeout(200);
    const consoleLabel = route.name === "home"
      ? `H4 ${viewport.name} home wallet/history paths keep the browser console clean`
      : `${viewport.name} ${route.path} keeps the browser console clean`;
    await check(consoleLabel, async () => {
      requireCondition(browserErrors.length === 0, browserErrors.join(" | "));
    });
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-angle=swiftshader"],
});

try {
  for (const viewport of viewports) {
    for (const route of routes) {
      await auditRoute(browser, route, viewport);
    }
    await auditMascotInteractions(browser, viewport);
    await auditMascotReducedMotion(browser, `${baseUrl}/`, viewport, "production");
  }
  let fixtureServer;
  try {
    const started = await check("committed independent browser fixtures build and start locally", async () => {
      fixtureServer = await startUiFixtureServer();
      return "scripts/__fixtures__/pnl-browser.json + real app components; temporary assets and ephemeral localhost port";
    });
    if (started) {
      for (const viewport of viewports) {
        await auditCapitalFixtures(browser, fixtureServer.url, viewport, check);
        await auditPopulatedFixtures(browser, fixtureServer.url, viewport);
        await auditDustFixtures(browser, fixtureServer.url, viewport);
        await auditBasisEvidenceFixtures(browser, fixtureServer.url, viewport);
        await auditMascotFixtures(browser, fixtureServer.url, viewport);
        await auditMascotReducedMotion(browser, `${fixtureServer.url}/?scenario=portfolio-mascot-excited`, viewport, "fixture");
        await auditMascotLoading(browser, fixtureServer.url, viewport);
        await auditMascotRestingIdle(browser, fixtureServer.url, viewport);
        await auditMascotNoWebgl(browser, fixtureServer.url, viewport);
        await auditMascotLoadError(browser, fixtureServer.url, viewport);
      }
    }
  } finally {
    await fixtureServer?.close();
  }
} finally {
  await browser.close();
}

const requiredMascotVideoSources = [
  "/mascot/motion-idle.webm",
  "/mascot/motion-happy-clap.webm",
  "/mascot/motion-excited-bounce.webm",
];
record("Mascot motion surfaces never settle on the static fallback in codec-capable Chromium",
  observedMascotSurfaceStates.has("on") && observedMascotSurfaceStates.has("video")
    && [...observedMascotSurfaceStates].every((state) => state === "on" || state === "video"),
  `post-hydration states observed: ${[...observedMascotSurfaceStates].sort().join("/") || "none"}`);
record("Mascot video fallback selects every contracted VP9 WebM clip",
  requiredMascotVideoSources.every((source) => observedMascotVideoSources.has(source)),
  `selected sources observed: ${[...observedMascotVideoSources].sort().join(", ") || "none"}`);

const failures = results.filter((result) => !result.passed);
const mascotResults = results.filter((result) => /mascot/i.test(result.label));
const mascotFailures = mascotResults.filter((result) => !result.passed);
const mascotDomResults = mascotResults.filter((result) => /\bDOM\b/.test(result.label));
const mascotDomFailures = mascotDomResults.filter((result) => !result.passed);
const mascotOcclusionResults = mascotDomResults.filter((result) => /resting.*(?:chip|occlusion)/i.test(result.label));
const mascotOcclusionFailures = mascotOcclusionResults.filter((result) => !result.passed);
const mascotMotionResults = mascotResults.filter((result) => /\b(?:3D|WebGL|video|motion surface)\b/i.test(result.label));
const mascotMotionFailures = mascotMotionResults.filter((result) => !result.passed);
process.stdout.write(`\n${mascotOcclusionFailures.length === 0 ? "PASS" : "FAIL"} | Mascot resting/occlusion summary — ${mascotOcclusionResults.length - mascotOcclusionFailures.length}/${mascotOcclusionResults.length} checks passed at 1440×1000 and 390×844\n`);
process.stdout.write(`${mascotDomFailures.length === 0 ? "PASS" : "FAIL"} | Mascot DOM assertion summary — ${mascotDomResults.length - mascotDomFailures.length}/${mascotDomResults.length} checks passed (individual assertions printed above)\n`);
process.stdout.write(`${mascotMotionFailures.length === 0 ? "PASS" : "FAIL"} | Mascot 3D/video fallback summary — ${mascotMotionResults.length - mascotMotionFailures.length}/${mascotMotionResults.length} checks passed · data-mascot-3d states observed: ${[...observedMascotSurfaceStates].sort().join("/") || "none"} · selected video sources: ${[...observedMascotVideoSources].sort().join(", ") || "none"}\n`);
process.stdout.write(`\n${mascotFailures.length === 0 ? "PASS" : "FAIL"} | Mascot contract summary — ${mascotResults.length - mascotFailures.length}/${mascotResults.length} checks passed\n`);
process.stdout.write(`\n${failures.length === 0 ? "PASS" : "FAIL"} | UI contract summary — ${results.length - failures.length}/${results.length} checks passed\n`);
if (failures.length > 0) process.exitCode = 1;
