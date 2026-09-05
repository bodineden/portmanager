import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { browserFixture, startUiFixtureServer } from "./ui-fixture-server.mjs";

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
      requireCondition(["t212-live", "onchain-derived", "airdrop-free", "not-recorded"].includes(row.status), `invalid basisStatus ${row.status}`);
      requireCondition(["eligible", "not-recorded", "dust", "unpriced", "unreconciled"].includes(row.eligibility), `invalid pnlEligibility ${row.eligibility}`);
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
      if (["dust", "unpriced", "unreconciled"].includes(row.eligibility)) {
        requireCondition(new RegExp(row.eligibility, "i").test(row.text), `${row.eligibility} is not visually distinguished`);
      }
      if (row.eligibility === "unpriced") {
        requireCondition(row.value.includes("—"), "unpriced current value is not —");
        requireCondition(!/(?:\$|฿|USD\s*|THB\s*)[+-]?\d/.test(row.value), "unpriced row invents a current value");
      }
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
    for (const label of ["T212", "NFT", "native", "tokens"]) {
      requireCondition(new RegExp(label, "i").test(text), `allocation class ${label} is missing`);
    }
    requireCondition(/value|USD/i.test(text), "allocation is not identified as current value");
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
    requireCondition(await sources.count() === 7, `expected seven sources, found ${await sources.count()}`);
    const keys = await sources.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-source-key")));
    requireCondition(new Set(keys).size === 7, "source keys are duplicated");
    for (const source of await sources.all()) {
      requireCondition(/^(?:live|partial|unavailable)$/i.test(compactText((await source.locator(".live-source-badge").textContent()) ?? "")), "source has no readable availability status");
    }
    const allUnavailable = await sources.evaluateAll((elements) => elements.every((element) => element.querySelector(".live-source-badge")?.textContent?.trim() === "unavailable"));
    if (allUnavailable) {
      requireCondition(await page.locator("[data-pnl-summary]").getAttribute("data-pnl-state") === "none", "unavailable sources imply computable P&L");
      requireCondition(/No recorded cost basis/i.test((await page.locator("[data-pnl-summary]").textContent()) ?? ""), "unavailable source fixture lacks the honest P&L empty state");
    }
    return allUnavailable ? "all seven sources unavailable · P&L remains honest" : "seven source statuses retained";
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
    for (const label of ["T212", "NFT", "native", "tokens"]) {
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

  await check("H1 home wallet hide-under-$1 toggle is present and checked by default", async () => {
    const panel = page.locator(".home-wallet-panel");
    const filter = panel.locator(".home-wallet-filter");
    requireCondition(await filter.count() === 1, "expected exactly one home wallet filter");
    requireCondition(await filter.isVisible(), "home wallet filter is not visible");
    requireCondition(compactText((await filter.textContent()) ?? "") === "Hide under $1", "home wallet filter label changed");

    const toggle = filter.locator('input[type="checkbox"][aria-label="Hide assets under $1"]');
    requireCondition(await toggle.count() === 1, "accessible home wallet filter checkbox is missing or duplicated");
    requireCondition(await toggle.isChecked(), "home wallet filter is not checked by default");
  });

  await check("H2 home wallet default view hides unpriced and under-$1 rows", async () => {
    const panel = page.locator(".home-wallet-panel");
    const table = panel.locator(".home-wallet-table");
    const fullCounts = await readHomeWalletPanelCounts(panel);
    const fullCount = fullCounts.native + fullCounts.token;
    const summaryCount = await readHomeWalletSummaryCount(page);
    requireCondition(fullCount === summaryCount, `panel has ${fullCount} total rows but wallet summary reports ${summaryCount}`);

    if (await table.count() === 0) {
      requireCondition(fullCount === 0, `wallet table is absent despite ${fullCount} total rows`);
      requireCondition(await panel.locator(".home-empty").count() === 1, "wallet table has no explicit empty/unavailable state");
      return "wallet sources returned no display rows";
    }

    const rows = panel.locator("tr[data-wallet-kind]");
    const rowContracts = await rows.evaluateAll((elements) => elements.map((element) => ({
      kind: element.getAttribute("data-wallet-kind"),
      priced: element.getAttribute("data-wallet-priced"),
      valueUsd: (element.querySelectorAll("td")[4]?.textContent ?? "").replace(/\s+/g, " ").trim(),
    })));
    const visibleNativeCount = rowContracts.filter((row) => row.kind === "native").length;
    const visibleTokenCount = rowContracts.filter((row) => row.kind === "token").length;
    const headerCounts = await readHomeWalletHeaderCounts(panel);
    requireCondition(headerCounts.native === visibleNativeCount, `header shows ${headerCounts.native} native, found ${visibleNativeCount}`);
    requireCondition(headerCounts.token === visibleTokenCount, `header shows ${headerCounts.token} tokens, found ${visibleTokenCount}`);
    // Unknown-price native balances stay visible; unpriced tokens are hidden by the existing dust filter.
    requireCondition(
      await panel.locator('tr[data-wallet-kind="token"][data-wallet-priced="false"]').count() === 0,
      "an unpriced token is visible while the filter is on",
    );

    for (const row of rowContracts) {
      requireCondition(row.kind === "native" || row.kind === "token", `unexpected wallet row kind ${row.kind ?? "missing"}`);
      if (row.kind === "token") requireCondition(row.priced === "true", "visible token is not marked priced");
      const valueUsd = parseDisplayedUsd(row.valueUsd);
      if (valueUsd !== null) requireCondition(valueUsd >= 1, `visible ${row.kind} row is worth ${row.valueUsd}`);
    }

    const hiddenCount = fullCount - rowContracts.length;
    requireCondition(hiddenCount >= 0, `visible row count ${rowContracts.length} exceeds full count ${fullCount}`);
    const hiddenNote = panel.locator(".home-wallet-hidden-count");
    if (hiddenCount > 0) {
      requireCondition(await hiddenNote.count() === 1, "hidden-under-$1 note is missing");
      requireCondition(
        compactText((await hiddenNote.textContent()) ?? "") === `(${hiddenCount} hidden under $1)`,
        "hidden-under-$1 note count is incorrect",
      );
    } else {
      requireCondition(await hiddenNote.count() === 0, "hidden-under-$1 note is rendered with no hidden rows");
    }

    const filteredEmptyCell = table.locator('tbody td[colspan="6"]');
    if (rowContracts.length === 0 && fullCount > 0) {
      requireCondition(await filteredEmptyCell.count() === 1, "all-hidden wallet explanation is missing or duplicated");
      requireCondition(
        compactText((await filteredEmptyCell.textContent()) ?? "")
          === `All ${fullCount} wallet assets are hidden under $1 — uncheck "Hide under $1" to show them`,
        "all-hidden wallet explanation changed",
      );
    } else {
      requireCondition(await filteredEmptyCell.count() === 0, "all-hidden wallet explanation is rendered with visible rows");
    }

    return `${rowContracts.length}/${fullCount} wallet rows visible by default`;
  });

  await check("H3 home wallet toggle restores the full ordered row set and preserves totals", async () => {
    const panel = page.locator(".home-wallet-panel");
    const toggle = panel.locator('input[type="checkbox"][aria-label="Hide assets under $1"]');
    const table = panel.locator(".home-wallet-table");
    const fullCounts = await readHomeWalletPanelCounts(panel);
    const fullCount = fullCounts.native + fullCounts.token;
    const summaryCount = await readHomeWalletSummaryCount(page);
    requireCondition(fullCount === summaryCount, `panel has ${fullCount} total rows but wallet summary reports ${summaryCount}`);

    if (await table.count() === 0) {
      requireCondition(fullCount === 0, `wallet table is absent despite ${fullCount} total rows`);
      await toggle.uncheck();
      requireCondition(!(await toggle.isChecked()), "home wallet filter stayed checked");
      requireCondition(await panel.locator(".home-empty").count() === 1, "empty wallet state disappeared after toggling");
      requireCondition(
        await panel.locator(".home-wallet-hidden-count").count() === 0,
        "hidden-under-$1 note appeared for an empty wallet after toggling off",
      );
      await toggle.check();
      requireCondition(await toggle.isChecked(), "empty wallet filter did not return to its default state");
      requireCondition(await panel.locator(".home-empty").count() === 1, "empty wallet state disappeared after restoring the filter");
      return "wallet sources returned no display rows; empty state remained stable in both toggle directions";
    }

    const defaultVisibleCount = await panel.locator("tr[data-wallet-kind]").count();
    const defaultVisibleRows = await panel.locator("tr[data-wallet-kind]").allTextContents();
    const defaultUnpricedNativeCount = await panel.locator('tr[data-wallet-kind="native"][data-wallet-priced="false"]').count();
    const hiddenBefore = fullCount - defaultVisibleCount;
    const totalBefore = compactText((await table.locator(".table-total-row").textContent()) ?? "");
    requireCondition(/Total wallet \(priced\)/i.test(totalBefore), "priced wallet total is missing before toggling");

    await toggle.uncheck();
    await page.waitForFunction(
      (expected) => document.querySelectorAll(".home-wallet-panel tr[data-wallet-kind]").length === expected,
      fullCount,
      { timeout: 5_000 },
    );
    requireCondition(!(await toggle.isChecked()), "home wallet filter stayed checked");

    const rowContracts = await panel.locator("tr[data-wallet-kind]").evaluateAll((elements) => elements.map((element) => ({
      kind: element.getAttribute("data-wallet-kind"),
      priced: element.getAttribute("data-wallet-priced"),
      cells: Array.from(element.querySelectorAll("td"), (cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim()),
    })));
    requireCondition(rowContracts.length === fullCount, `toggle restored ${rowContracts.length}/${fullCount} wallet rows`);
    requireCondition(
      hiddenBefore > 0 ? rowContracts.length > defaultVisibleCount : rowContracts.length === defaultVisibleCount,
      hiddenBefore > 0 ? "toggle did not add the hidden rows" : "toggle changed a full default row set",
    );

    const restoredNativeCount = rowContracts.filter((row) => row.kind === "native").length;
    const restoredTokenCount = rowContracts.filter((row) => row.kind === "token").length;
    requireCondition(restoredNativeCount === fullCounts.native, `restored ${restoredNativeCount}/${fullCounts.native} native rows`);
    requireCondition(restoredTokenCount === fullCounts.token, `restored ${restoredTokenCount}/${fullCounts.token} token rows`);
    requireCondition(
      rowContracts.filter((row) => row.kind === "native" && row.priced === "false").length === defaultUnpricedNativeCount,
      "native holdings with unavailable prices were hidden by the default filter",
    );
    const headerCounts = await readHomeWalletHeaderCounts(panel);
    requireCondition(headerCounts.native === restoredNativeCount, "restored native header count is incorrect");
    requireCondition(headerCounts.token === restoredTokenCount, "restored token header count is incorrect");

    let tokenSeen = false;
    let unpricedSeen = false;
    for (const row of rowContracts) {
      requireCondition(row.kind === "native" || row.kind === "token", "restored row has invalid data-wallet-kind");
      requireCondition(row.priced === "true" || row.priced === "false", "restored row has invalid data-wallet-priced");
      if (row.kind === "token") tokenSeen = true;
      if (row.kind === "native") requireCondition(!tokenSeen, "native row appears after a token row");
      if (row.kind === "native" && row.priced === "false") {
        for (const index of [3, 4, 5]) {
          requireCondition(row.cells[index] === "—", `unpriced native cell ${index + 1} is not —`);
        }
      }
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

    requireCondition(await panel.locator(".home-wallet-hidden-count").count() === 0, "hidden-under-$1 note remained after toggling off");
    requireCondition(await table.locator(".home-wallet-filtered-empty").count() === 0, "all-hidden explanation remained after toggling off");
    const totalAfter = compactText((await table.locator(".table-total-row").textContent()) ?? "");
    requireCondition(totalAfter === totalBefore, "priced wallet total changed after toggling");
    const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth);
    requireCondition(overflow <= 1, `unfiltered wallet creates ${overflow}px of horizontal body overflow`);
    await toggle.check();
    requireCondition(await toggle.isChecked(), "wallet filter did not return to its default state");
    await page.waitForFunction(
      (expected) => document.querySelectorAll(".home-wallet-panel tr[data-wallet-kind]").length === expected,
      defaultVisibleCount,
      { timeout: 5_000 },
    );
    const filteredAgain = await panel.locator("tr[data-wallet-kind]").allTextContents();
    requireCondition(JSON.stringify(filteredAgain) === JSON.stringify(defaultVisibleRows), "restoring the filter changed its original row set");
    requireCondition(compactText((await table.locator(".table-total-row").textContent()) ?? "") === totalBefore, "priced wallet total changed after restoring the filter");
    return `${defaultVisibleCount} default · ${rowContracts.length} restored · both toggle directions preserve totals`;
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
      requireCondition(row.kind === "native" || row.kind === "token", "wallet row has invalid data-wallet-kind");
      requireCondition(row.priced === "true" || row.priced === "false", "wallet row has invalid data-wallet-priced");
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

  await check("asset-list wallet filter defaults on and preserves the full registry totals", async () => {
    const panel = page.locator(".asset-wallet-panel");
    const toggle = panel.locator('input[type="checkbox"][aria-label="Hide assets under $1"]');
    requireCondition(await toggle.count() === 1 && await toggle.isChecked(), "registry filter is missing or not checked by default");
    const summary = compactText((await page.locator(".asset-registry-kpi").last().textContent()) ?? "");
    const match = summary.match(/([\d,]+)\s+wallet assets?\b/i);
    const defaultRows = await panel.locator("tr[data-wallet-kind]").allTextContents();
    const hiddenNote = panel.locator(".asset-wallet-hidden-count");
    const hiddenText = await hiddenNote.count() > 0 ? compactText((await hiddenNote.textContent()) ?? "") : "";
    const hiddenMatch = hiddenText.match(/^\(([\d,]+) hidden under \$1\)$/);
    requireCondition(!hiddenText || hiddenMatch, "registry hidden-row count is malformed");
    const hiddenCount = hiddenMatch ? parseGroupedCount(hiddenMatch[1], "hidden registry rows") : 0;
    const fullCount = defaultRows.length + hiddenCount;
    if (match) {
      requireCondition(parseGroupedCount(match[1], "registry wallet count") === fullCount, "registry filter counts differ from the full summary");
    } else {
      requireCondition(/—\s+wallet assets?\b/i.test(summary), "registry summary omits its unavailable wallet count");
      requireCondition(await panel.locator(".asset-source-badge.is-unavailable").count() > 0, "registry summary is unavailable despite complete wallet sources");
    }
    requireCondition(compactText((await panel.locator(".asset-wallet-count .panel-count").textContent()) ?? "") === `${defaultRows.length} ASSETS`, "registry visible count differs from its rows");
    requireCondition(hiddenCount > 0
      ? compactText((await hiddenNote.textContent()) ?? "") === `(${hiddenCount} hidden under $1)`
      : await hiddenNote.count() === 0, "registry hidden-row count is incorrect");
    const defaultValues = await panel.locator("tr[data-wallet-kind]").evaluateAll((elements) => elements.map((element) => ({
      kind: element.getAttribute("data-wallet-kind"), priced: element.getAttribute("data-wallet-priced"),
      value: element.querySelectorAll("td")[5]?.textContent ?? "",
    })));
    for (const row of defaultValues) {
      requireCondition(row.kind !== "token" || row.priced === "true", "default registry displays an unpriced token");
      const value = parseDisplayedUsd(row.value);
      requireCondition(value === null || value >= 1, "default registry displays an under-$1 holding");
    }
    const table = panel.locator(".asset-wallet-table");
    if (await table.count() === 0) {
      requireCondition(fullCount === 0, "registry table is absent despite joined holdings");
      await toggle.uncheck();
      requireCondition(await panel.locator(".asset-empty-state").count() === 1, "empty registry state disappeared after toggling off");
      await toggle.check();
      requireCondition(await panel.locator(".asset-empty-state").count() === 1, "empty registry state disappeared after restoring the filter");
      return "empty registry is stable in both toggle directions";
    }
    if (defaultRows.length === 0) {
      requireCondition(await panel.locator(".asset-wallet-filtered-empty").count() === 1, "all-hidden registry has no explicit explanation");
    }
    const totals = compactText((await table.locator("tfoot").textContent()) ?? "");
    await toggle.uncheck();
    await page.waitForFunction((expected) => document.querySelectorAll(".asset-wallet-panel tr[data-wallet-kind]").length === expected, fullCount, { timeout: 5_000 });
    const fullRows = await panel.locator("tr[data-wallet-kind]").evaluateAll((elements) => elements.map((element) => ({
      kind: element.getAttribute("data-wallet-kind"), priced: element.getAttribute("data-wallet-priced"),
      cells: Array.from(element.querySelectorAll("td"), (cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim()),
    })));
    let tokenSeen = false;
    let unpricedTokenSeen = false;
    for (const row of fullRows) {
      requireCondition(["native", "token"].includes(row.kind) && ["true", "false"].includes(row.priced), "registry wallet attributes are invalid");
      if (row.kind === "token") tokenSeen = true;
      if (row.kind === "native") requireCondition(!tokenSeen, "restored registry native appears after a token");
      if (row.priced === "false") {
        for (const index of [4, 5, 6]) requireCondition(row.cells[index] === "—", "restored unpriced registry cell is not —");
      }
      if (row.kind === "token" && row.priced === "false") {
        unpricedTokenSeen = true;
        requireCondition(/UNPRICED/i.test(row.cells[2]), "restored unpriced token tag is missing");
      }
      if (row.kind === "token" && row.priced === "true") requireCondition(!unpricedTokenSeen, "restored priced token follows an unpriced token");
    }
    requireCondition(fullRows.filter((row) => row.kind === "native" && row.priced === "false").length
      === defaultValues.filter((row) => row.kind === "native" && row.priced === "false").length, "registry filter hid a native holding with unavailable price");
    requireCondition(await hiddenNote.count() === 0 && await panel.locator(".asset-wallet-filtered-empty").count() === 0, "registry hidden-state labels remained after toggling off");
    requireCondition(compactText((await table.locator("tfoot").textContent()) ?? "") === totals, "registry filter changed full-set totals");
    await toggle.check();
    await page.waitForFunction((expected) => document.querySelectorAll(".asset-wallet-panel tr[data-wallet-kind]").length === expected, defaultRows.length, { timeout: 5_000 });
    requireCondition(JSON.stringify(await panel.locator("tr[data-wallet-kind]").allTextContents()) === JSON.stringify(defaultRows), "restoring registry filter changed the default row set");
    requireCondition(compactText((await table.locator("tfoot").textContent()) ?? "") === totals, "restoring registry filter changed totals");
    return `${defaultRows.length} default · ${fullCount} restored · totals unchanged in both directions`;
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
      requireCondition(row.kind === "native" || row.kind === "token", "registry row has invalid data-wallet-kind");
      requireCondition(row.priced === "true" || row.priced === "false", "registry row has invalid data-wallet-priced");
      if (row.kind === "token") tokenSeen = true;
      if (row.kind === "native") requireCondition(!tokenSeen, "native registry row appears after a token row");
      if (row.kind === "native" && row.priced === "false") {
        for (const index of [4, 5, 6]) {
          requireCondition(row.cells[index] === "—", `unpriced native registry cell ${index + 1} is not —`);
        }
      }
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
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(`console: ${message.text()}`); });
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
    await check(`${prefix} wallet preserves raw $1 threshold, unknown native rows and full totals`, async () => {
      const wallet = page.locator(".home-wallet-panel");
      const toggle = wallet.getByRole("checkbox", { name: "Hide assets under $1", exact: true });
      const symbols = () => wallet.locator("tbody .ticker-cell").allTextContents();
      requireCondition(await toggle.isChecked(), "fixture wallet filter is not default-on");
      requireCondition((await symbols()).join(",") === "NATIVE-ONE,NATIVE-UNPRICED,TOKEN-ONE", "strict raw $1 filter hid $1/unknown native or exposed $0.999/unpriced token");
      const total = await wallet.locator("tfoot").innerText();
      requireCondition(total.includes("US$3.01") && total.includes("฿108.32"), "wallet total omitted hidden priced dust");
      await toggle.uncheck();
      requireCondition((await symbols()).join(",") === [...browserFixture.wallet.nativeRows, ...browserFixture.wallet.tokenRows].map((row) => row.symbol).join(","), "wallet did not restore the full ordered fixture row set");
      for (const row of await wallet.locator('tr[data-wallet-priced="false"]').all()) {
        requireCondition(compactText(await row.locator("td").nth(3).innerText()) === "—" && compactText(await row.locator("td").nth(4).innerText()) === "—", "unpriced fixture quote/value invented a number");
      }
      requireCondition(await wallet.locator("tfoot").innerText() === total, "wallet uncheck changed full totals");
      await toggle.check();
      requireCondition((await symbols()).join(",") === "NATIVE-ONE,NATIVE-UNPRICED,TOKEN-ONE" && await wallet.locator("tfoot").innerText() === total, "wallet recheck changed default rows or full totals");
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
    await check(`${prefix} all-dust wallet explains filtered empty state through both toggles`, async () => {
      const wallet = page.locator(".home-wallet-panel");
      const total = await wallet.locator("tfoot").innerText();
      requireCondition((await wallet.locator(".home-wallet-filtered-empty").innerText()).includes("All 3 wallet assets are hidden under $1"), "all-dust fixture empty explanation is missing");
      await wallet.getByRole("checkbox").uncheck();
      requireCondition(await wallet.locator("tr[data-wallet-kind]").count() === 3 && await wallet.locator("tfoot").innerText() === total, "all-dust uncheck dropped rows or changed totals");
      await wallet.getByRole("checkbox").check();
      requireCondition(await wallet.locator(".home-wallet-filtered-empty").count() === 1 && await wallet.locator("tfoot").innerText() === total, "all-dust recheck lost the filtered state or changed totals");
    });
    await check(`${prefix} populated/empty/live/legacy interactions keep browser console clean`, async () => {
      requireCondition(browserErrors.length === 0, browserErrors.join(" | "));
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
      ? `H4 ${viewport.name} home wallet/history toggle paths keep the browser console clean`
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
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  for (const viewport of viewports) {
    for (const route of routes) {
      await auditRoute(browser, route, viewport);
    }
  }
  let fixtureServer;
  try {
    const started = await check("committed independent browser fixtures build and start locally", async () => {
      fixtureServer = await startUiFixtureServer();
      return "scripts/__fixtures__/pnl-browser.json + real app components; temporary assets and ephemeral localhost port";
    });
    if (started) {
      for (const viewport of viewports) await auditPopulatedFixtures(browser, fixtureServer.url, viewport);
    }
  } finally {
    await fixtureServer?.close();
  }
} finally {
  await browser.close();
}

const failures = results.filter((result) => !result.passed);
process.stdout.write(`\n${failures.length === 0 ? "PASS" : "FAIL"} | UI contract summary — ${results.length - failures.length}/${results.length} checks passed\n`);
if (failures.length > 0) process.exitCode = 1;
