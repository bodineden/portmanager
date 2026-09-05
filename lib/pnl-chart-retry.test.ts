import { existsSync } from "node:fs";
import { chromium, type Browser } from "playwright";
import { expect, it } from "vitest";
import { browserFixture, startUiFixtureServer } from "../scripts/ui-fixture-server.mjs";
import type { PortfolioSnapshot } from "./pnl-history";

it("redraws after a chart draw failure when retrying the SAME selected period with unchanged observations", async () => {
  const fixture = await startUiFixtureServer();
  let browser: Browser | undefined;
  try {
    const executablePath = [
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      chromium.executablePath(),
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      "/snap/bin/chromium",
    ].find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
    browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const replaceChildren = Element.prototype.replaceChildren;
      let attempts = 0;
      // Fail inside the real drawing effect, retaining React's actual state/effect lifecycle.
      Element.prototype.replaceChildren = function (this: Element, ...nodes: (Node | string)[]) {
        if (this.matches(".pnl-chart-host")) {
          document.documentElement.dataset.chartDrawAttempts = String(++attempts);
          if (attempts === 1) throw new Error("Injected one-time chart draw failure");
          Element.prototype.replaceChildren = replaceChildren;
        }
        return replaceChildren.apply(this, nodes);
      };
    });
    await page.goto(`${fixture.url}/?scenario=recent`);
    await page.waitForSelector(".pnl-performance .pnl-history-empty h3");
    expect(await page.locator(".pnl-performance .pnl-history-empty h3").textContent()).toBe("Chart unavailable");
    expect(await page.locator(".pnl-chart-host").count()).toBe(0);
    const all = page.getByRole("button", { name: "All", exact: true });
    expect(await all.getAttribute("aria-pressed")).toBe("true");
    expect(await all.isEnabled()).toBe(true);
    const snapshots: PortfolioSnapshot[] = browserFixture.snapshots;
    const count = String(snapshots.length);
    expect(await page.locator(".pnl-performance").getAttribute("data-period-count")).toBe(count);
    const observations = await page.locator(".pnl-history-details tbody").textContent();

    await all.click();

    await page.waitForSelector('.pnl-chart-host[data-chart-ready="true"] svg', { timeout: 5_000 });
    const expectedDots = snapshots.reduce((sum, row) => sum + Number(row.totalValueUsd !== null) + Number(row.costBasisUsd !== null), 0);
    await page.waitForFunction((count) => document.querySelectorAll(".pnl-chart-host .scatter-plot .symbol").length === count, expectedDots);
    expect(await page.locator("html").getAttribute("data-chart-draw-attempts")).toBe("2");
    expect(await page.locator(".pnl-chart-host .axis").count()).toBe(2);
    expect(await page.locator(".pnl-chart-host .scatter-plot .symbol").count()).toBe(expectedDots);
    expect(await page.locator(".pnl-performance .pnl-history-empty").count()).toBe(0);
    expect(await all.getAttribute("aria-pressed")).toBe("true");
    expect(await page.locator(".pnl-performance").getAttribute("data-period-count")).toBe(count);
    expect(await page.locator(".pnl-history-details tbody").textContent()).toBe(observations);
    expect(errors).toEqual([]);
  } finally {
    await browser?.close();
    await fixture.close();
  }
}, 60_000);
