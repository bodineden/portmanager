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
  { name: "holder-list", path: "/holder-list", finalPaths: ["/holder-list"] },
  { name: "exchange-rate", path: "/exchange-rate", finalPaths: ["/exchange-rate"] },
  // This compatibility route intentionally redirects to the live registry.
  { name: "asset-master", path: "/asset-master", finalPaths: ["/asset-master", "/asset-list"] },
];

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
];

const retiredInvestorNames = ["Alice Johnson", "Bob Smith", "Carol Williams", "David Brown"];

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

  await check(`${routeName} names only the live owners`, async () => {
    for (const owner of ["Bodin", "PP", "Sonya"]) {
      requireCondition(new RegExp(`\\b${owner}\\b`).test(text), `${owner} is missing`);
    }
    for (const retiredName of retiredInvestorNames) {
      requireCondition(!text.includes(retiredName), `retired demo investor ${retiredName} is rendered`);
    }
    requireCondition(!/\b(?:pending\s+migration|migration|demo(?:nstration)?)\b/i.test(text), "migration/demo wording is rendered");
  });
}

async function checkHomeContract(page) {
  await checkOwnershipLanguage(page, "home");
  await check("home renders the Bodin / PP / Sonya split", async () => {
    const ownership = page.locator('[aria-label="Beneficial ownership"]');
    requireCondition(await ownership.count() === 1, "beneficial ownership region is missing or duplicated");
    const text = compactText((await ownership.textContent()) ?? "");
    requireCondition(/Bodin\s*\(A\)\s*50%/i.test(text), "Bodin (A) 50% is missing");
    requireCondition(/PP\s*\(B\)\s*50%/i.test(text), "PP (B) 50% is missing");
    requireCondition(/Sonya\s*\(C\)\s*0%/i.test(text), "Sonya (C) 0% is missing");
  });
}

async function checkHolderContract(page) {
  await checkOwnershipLanguage(page, "holder-list");
  await check("holder-list renders exactly the configured live owners", async () => {
    const panels = page.locator(".holder-investor-panel");
    requireCondition(await panels.count() === 3, `expected 3 owner panels, found ${await panels.count()}`);
    const expected = [
      { code: "A", name: "Bodin", share: "50%" },
      { code: "B", name: "PP", share: "50%" },
      { code: "C", name: "Sonya", share: "0%" },
    ];

    for (let index = 0; index < expected.length; index += 1) {
      const owner = expected[index];
      const text = compactText((await panels.nth(index).textContent()) ?? "");
      requireCondition(text.includes(`${owner.code} / ${owner.name}`), `${owner.code} / ${owner.name} panel is missing`);
      requireCondition(new RegExp(`RETURNED SHARE\\s*${owner.share}`, "i").test(text), `${owner.name} ${owner.share} share is missing`);
    }
  });
}

async function checkReadonlyLivePage(page, routeName) {
  const text = await renderedText(page);

  await check(`${routeName} is labelled live and read-only`, async () => {
    requireCondition(/\blive\b/i.test(text), "live label is missing");
    requireCondition(/\bread[\s-]*only\b/i.test(text), "read-only label is missing");
  });

  await check(`${routeName} exposes no mutation forms or controls`, async () => {
    const forms = await page.locator("form").count();
    requireCondition(forms === 0, `${forms} form${forms === 1 ? "" : "s"} rendered`);

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
    requireCondition(await legacyMutationFields.count() === 0, "a retired mutation field/control is rendered");

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

    if (viewport.name === "desktop") {
      if (route.name === "home") await checkHomeContract(page);
      if (route.name === "holder-list") await checkHolderContract(page);
      if (route.name === "asset-list" || route.name === "exchange-rate") {
        await checkReadonlyLivePage(page, route.name);
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
