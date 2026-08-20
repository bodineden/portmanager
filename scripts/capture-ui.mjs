import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.UI_BASE_URL ?? "http://127.0.0.1:8125";
const outputDirectory = resolve("ui-screenshots");
const configuredBrowser = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browserCandidates = [configuredBrowser, chromium.executablePath(), "/usr/bin/chromium-browser", "/usr/bin/chromium", "/snap/bin/chromium"].filter(Boolean);
const executablePath = browserCandidates.find((candidate) => existsSync(candidate));
const routes = [
  ["home", "/"],
  ["asset-list", "/asset-list"],
  ["portfolio", "/portfolio"],
  ["holder-list", "/holder-list"],
  ["exchange-rate", "/exchange-rate"],
  ["asset-master", "/asset-master"],
];

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const failures = [];
let activeRoute = "startup";

page.on("console", (message) => {
  if (message.type() === "error") failures.push(`${activeRoute}: console error: ${message.text()}`);
});
page.on("pageerror", (error) => failures.push(`${activeRoute}: page error: ${error.message}`));

for (const [name, route] of routes) {
  activeRoute = name;
  const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
  if (!response?.ok()) failures.push(`${name}: HTTP ${response?.status() ?? "no response"}`);

  if (name === "portfolio") {
    await page.locator('.range-selector button:has-text("ALL")').click();
    await page.locator('.portfolio-chart-host[data-chart-ready="true"]').waitFor({ state: "visible", timeout: 15000 }).catch(() => {
      failures.push("portfolio: Plottable host did not become ready");
    });
    const svgCount = await page.locator(".portfolio-chart-host svg").count();
    const axisCount = await page.locator(".portfolio-chart-host .axis").count();
    const dashedCount = await page.locator('.portfolio-chart-host [stroke-dasharray="7 5"]').count();
    if (svgCount === 0) failures.push("portfolio: Plottable SVG missing");
    if (axisCount < 2) failures.push(`portfolio: expected two axes, found ${axisCount}`);
    if (dashedCount === 0) failures.push("portfolio: dashed monthly-average line missing");

    const dots = page.locator(".portfolio-chart-host .scatter-plot path");
    const dotCount = await dots.count();
    if (dotCount === 0) {
      failures.push("portfolio: daily-series interaction points missing");
    } else {
      await dots.nth(Math.floor(dotCount / 2)).hover();
      const tooltip = page.locator(".portfolio-chart-tooltip.is-visible");
      await tooltip.waitFor({ state: "visible", timeout: 5000 }).catch(() => {
        failures.push("portfolio: formatted point tooltip did not appear");
      });
      if (await tooltip.count() > 0 && !/THB\s*[\d,.]+/.test((await tooltip.textContent()) ?? "")) {
        failures.push("portfolio: point tooltip is not formatted as THB");
      }
    }

    for (const option of ["1M", "3M", "6M", "ALL"]) {
      await page.locator(`.range-selector button:has-text("${option}")`).click();
      const selected = await page.locator(`.range-selector button:has-text("${option}")`).getAttribute("aria-pressed");
      if (selected !== "true") failures.push(`portfolio: ${option} range did not activate`);
      await page.waitForTimeout(100);
    }
    await page.locator('.portfolio-chart-host[data-chart-ready="true"]').waitFor({ state: "visible", timeout: 15000 }).catch(() => {
      failures.push("portfolio: chart did not re-render after range changes");
    });
  }

  const audit = await page.evaluate(() => {
    const root = document.documentElement;
    const bodyText = document.body.innerText;
    const numeric = document.querySelector(".numeric, .metric-value, input[inputmode='decimal']");
    const numericStyle = numeric ? getComputedStyle(numeric) : null;
    return {
      rootDark: root.classList.contains("bp6-dark") && document.body.classList.contains("bp6-dark"),
      horizontalOverflow: root.scrollWidth > window.innerWidth + 1,
      forbiddenValue: bodyText.match(/\b(?:undefined|null|NaN)\b/)?.[0] ?? "",
      numericStyled: !numericStyle || numericStyle.fontVariantNumeric.includes("tabular-nums") || numericStyle.fontFamily.includes("mono"),
    };
  });

  if (!audit.rootDark) failures.push(`${name}: bp6-dark missing from root/body`);
  if (audit.horizontalOverflow) failures.push(`${name}: body has horizontal overflow`);
  if (audit.forbiddenValue) failures.push(`${name}: rendered ${audit.forbiddenValue}`);
  if (!audit.numericStyled) failures.push(`${name}: sampled numeric text is not tabular/monospace`);

  const path = resolve(outputDirectory, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  process.stdout.write(`CAPTURED | ${name} | ${path} | ${page.url()}\n`);
}

await browser.close();
if (failures.length > 0) {
  failures.forEach((failure) => process.stdout.write(`FAIL | ${failure}\n`));
  process.exitCode = 1;
} else {
  process.stdout.write(`PASS | Visual automation checks passed for ${routes.length} pages\n`);
}
