import { existsSync } from "node:fs";
import { chromium } from "playwright";

const baseUrl = process.env.UI_BASE_URL ?? "http://127.0.0.1:8125";
const configuredBrowser = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browserCandidates = [configuredBrowser, chromium.executablePath(), "/usr/bin/chromium-browser", "/usr/bin/chromium", "/snap/bin/chromium"].filter(Boolean);
const executablePath = browserCandidates.find((candidate) => existsSync(candidate));
const results = [];

function record(label, passed, detail = "") {
  results.push({ label, passed, detail });
  const suffix = detail ? ` — ${detail}` : "";
  process.stdout.write(`${passed ? "PASS" : "FAIL"} | ${label}${suffix}\n`);
}

async function check(label, operation) {
  try {
    const detail = await operation();
    record(label, true, typeof detail === "string" ? detail : "");
  } catch (error) {
    record(label, false, error instanceof Error ? error.message : String(error));
  }
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({
  headless: true,
  executablePath,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const browserErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => browserErrors.push(`page: ${error.message}`));

try {
  const assetResponse = await page.goto(`${baseUrl}/asset-list`, { waitUntil: "networkidle" });
  await check("asset-list responds successfully", async () => {
    requireCondition(assetResponse?.ok(), `HTTP ${assetResponse?.status() ?? "no response"}`);
  });

  const priceInputs = page.locator('input[name="currentPrice"][aria-label$=" price"]');
  const priceInputCount = await priceInputs.count();
  await check("asset-list exposes at least one price-update form", async () => {
    requireCondition(priceInputCount > 0, "no cron price inputs rendered; verify DATABASE_URL and seeded assets");
    return `${priceInputCount} asset forms`;
  });

  for (let index = 0; index < priceInputCount; index += 1) {
    const input = priceInputs.nth(index);
    const ariaLabel = await input.getAttribute("aria-label");
    const ticker = ariaLabel?.replace(/ price$/, "") ?? `asset ${index + 1}`;
    await check(`asset price form / ${ticker}`, async () => {
      requireCondition(ariaLabel === `${ticker} price`, `unexpected aria-label ${JSON.stringify(ariaLabel)}`);
      const form = input.locator("xpath=ancestor::form[1]");
      requireCondition(await form.count() === 1, "price input is not inside a form");
      const id = form.locator('input[type="hidden"][name="id"]');
      requireCondition(await id.count() === 1, "missing hidden id");
      requireCondition(Boolean(await id.inputValue()), "hidden id is empty");
      const submit = form.getByRole("button", { name: "Save", exact: true });
      requireCondition(await submit.count() === 1, "missing visible Save button in the same form");
      requireCondition(await submit.getAttribute("type") === "submit", "Save is not an explicit submit button");
    });
  }

  await check("asset-list add/edit asset contract", async () => {
    const form = page.getByRole("button", { name: "Save Asset", exact: true }).locator("xpath=ancestor::form[1]");
    requireCondition(await form.count() === 1, "Save Asset form not found");
    const ticker = form.locator('input[name="ticker"]');
    const fullName = form.locator('input[name="fullName"]');
    const sourceLink = form.locator('input[name="sourceLink"]');
    const currencyCode = form.locator('select[name="currencyCode"]');
    const currentPrice = form.locator('input[name="currentPrice"]');
    requireCondition(await ticker.count() === 1 && await ticker.getAttribute("required") !== null, "required ticker input missing");
    requireCondition((await ticker.evaluate((element) => getComputedStyle(element).textTransform)) === "uppercase", "ticker input is not uppercase");
    requireCondition(await fullName.count() === 1 && await fullName.getAttribute("required") !== null, "required fullName input missing");
    requireCondition(await sourceLink.count() === 1, "sourceLink input missing");
    requireCondition(await currencyCode.count() === 1, "currencyCode select missing");
    requireCondition(await currentPrice.count() === 1 && await currentPrice.getAttribute("required") !== null, "required currentPrice input missing");
    requireCondition(await currentPrice.getAttribute("inputmode") === "decimal", "currentPrice inputMode is not decimal");
    const submit = form.getByRole("button", { name: "Save Asset", exact: true });
    requireCondition(await submit.getAttribute("type") === "submit", "Save Asset is not an explicit submit button");
    requireCondition(await form.locator('a[href="/asset-list"]', { hasText: "Cancel" }).count() === 1, "Cancel link missing");
  });

  const removeButtons = page.locator('button[aria-label^="Remove "]');
  const removeCount = await removeButtons.count();
  await check("asset-list exposes registry remove controls", async () => {
    requireCondition(removeCount > 0, "no remove-asset buttons rendered");
    return `${removeCount} remove forms`;
  });

  for (let index = 0; index < removeCount; index += 1) {
    const button = removeButtons.nth(index);
    const ariaLabel = await button.getAttribute("aria-label");
    await check(`asset remove form / ${ariaLabel?.replace(/^Remove /, "") ?? index + 1}`, async () => {
      requireCondition(/^Remove .+/.test(ariaLabel ?? ""), "remove aria-label is invalid");
      requireCondition((await button.textContent())?.trim() === "x", "remove button text is not x");
      requireCondition(await button.getAttribute("type") === "submit", "remove control is not an explicit submit button");
      const form = button.locator("xpath=ancestor::form[1]");
      requireCondition(await form.locator('input[type="hidden"][name="id"]').count() === 1, "missing hidden id");
      requireCondition(await form.locator('input[type="hidden"][name="confirmRemove"][value="yes"]').count() === 1, "missing confirmRemove=yes");
    });
  }

  const exchangeResponse = await page.goto(`${baseUrl}/exchange-rate`, { waitUntil: "networkidle" });
  await check("exchange-rate responds successfully", async () => {
    requireCondition(exchangeResponse?.ok(), `HTTP ${exchangeResponse?.status() ?? "no response"}`);
  });

  await check("exchange-rate save form contract", async () => {
    const form = page.getByRole("button", { name: "Save Rate", exact: true }).locator("xpath=ancestor::form[1]");
    requireCondition(await form.count() === 1, "Save Rate form not found");
    requireCondition(await form.locator('select[name="fromCurrency"]').count() === 1, "fromCurrency select missing");
    requireCondition(await form.locator('select[name="toCurrency"]').count() === 1, "toCurrency select missing");
    const rate = form.locator('input[name="rate"]');
    requireCondition(await rate.count() === 1, "rate input missing");
    requireCondition(await rate.getAttribute("placeholder") === "36.50", "rate placeholder is not 36.50");
    requireCondition(await rate.getAttribute("inputmode") === "decimal", "rate inputMode is not decimal");
    requireCondition(await rate.getAttribute("required") !== null, "rate input is not required");
    const submit = form.getByRole("button", { name: "Save Rate", exact: true });
    requireCondition(await submit.getAttribute("type") === "submit", "Save Rate is not an explicit submit button");
  });

  await check("browser console remains error-free", async () => {
    requireCondition(browserErrors.length === 0, browserErrors.join(" | "));
  });
} finally {
  await browser.close();
}

const failures = results.filter((result) => !result.passed);
process.stdout.write(`\n${failures.length === 0 ? "PASS" : "FAIL"} | UI contract summary — ${results.length - failures.length}/${results.length} checks passed\n`);
if (failures.length > 0) process.exitCode = 1;
