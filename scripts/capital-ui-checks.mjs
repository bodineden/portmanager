/** Additional fixture-only browser assertions. Existing UI contracts remain intact. */
export async function auditCapitalFixtures(browser, url, viewport, check) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  const prefix = `${viewport.name} capital fixture`;
  try {
    await page.goto(`${url}/?scenario=capital-book`);
    await page.locator("[data-book-pnl]").waitFor();
    await check(`${prefix} full book capital metric renders exact opening THB basis`, async () => {
      const metric = page.locator("[data-book-pnl]");
      assert(await metric.getAttribute("data-book-pnl") === "available", "book P&L unavailable with recorded capital");
      const text = await metric.innerText();
      assert(text.includes("Contributed capital ฿120,000.00") && text.includes("Book P&L"), "capital basis or book label is missing");
      assert(text.includes("-US$") && text.includes("฿-") && text.includes("%"), "book P&L is missing USD/THB/percentage or explicit loss sign");
      assert(!text.includes("No recorded cost basis"), "eligible-subset empty copy is the headline");
      const hero = await page.locator(".pnl-hero-value").innerText();
      const expected = new Intl.NumberFormat("en-GB", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((2000 + 9.62) * 44.6154 / 33.003871);
      assert(hero === expected, `full book hero ${hero} differs from ${expected}`);
      assert(await page.locator(".pnl-class-values [data-value-class]").count() === 2, "allocation must contain exactly two grouped classes");
      assert(await page.locator('[data-value-class="t212"] strong').innerText() === expected, "Stocks Port omits or double counts broker/manual cash");
      assert(await page.locator('[data-value-class="cash"]').count() === 0, "cash must be included in Stocks Port, not a separate class");
      assert(await page.locator('[data-value-class="crypto"] small').innerText() === "Crypto Port", "Crypto Port class missing");
      return "THB 120000 opening basis · full GBP 2000 pot included · book USD/THB/%";
    });
    await check(`${prefix} manual cash is value-only with no fabricated basis or P&L`, async () => {
      const row = page.locator('[data-manual-cash="true"]');
      assert(await row.count() === 1, "cash pot missing or duplicated");
      const text = await row.innerText();
      assert(text.includes("T212 cash pot") && text.includes("manual-cash") && text.includes("Manually reported · value only · no P&L"), "manual cash provenance missing");
      assert((await row.locator('[data-pnl-cell="value"]').innerText()).includes("฿89,230.80"), "cash pot THB value is wrong");
      for (const name of ["basis", "pnl"]) {
        const cell = await row.locator(`[data-pnl-cell="${name}"]`).innerText();
        assert(cell.includes("—") && !/[\d$฿%]/.test(cell), `${name} invents manual cash basis or P&L`);
      }
      assert(await row.getAttribute("data-pnl-eligibility") === null, "manual cash enters asset eligibility buckets");
      return "one manual-cash row · value USD/THB · basis/P&L — · excluded from asset buckets";
    });
    await check(`${prefix} Day column and adjusted day change use signs plus direction`, async () => {
      const up = page.locator('[data-pnl-cell="day"][data-day-direction="up"]');
      const down = page.locator('[data-pnl-cell="day"][data-day-direction="down"]');
      assert(await up.count() === 1 && await down.count() === 1, "missing up/down Day rows");
      assert((await up.innerText()).includes("↑ +US$10.00") && (await down.innerText()).includes("↓ -US$1.00"), "Day signs or arrows incorrect");
      assert((await up.innerText()).includes("%") && (await down.innerText()).includes("%"), "Day percentages missing");
      const day = page.locator("[data-daily-change]");
      assert(await day.getAttribute("data-daily-change") === "available", "adjusted daily comparison missing");
      assert((await day.innerText()).includes("↑ +US$9.00") && (await day.innerText()).includes("deposits and withdrawals excluded"), "adjusted value or explanation wrong");
      return "up +USD/+% and down -USD/-% · adjusted book day +USD9";
    });
    await page.goto(`${url}/?scenario=capital-flat`);
    await page.locator("[data-book-pnl]").waitFor();
    await check(`${prefix} exactly zero adjusted change is neutral rather than a gain`, async () => {
      const value = page.locator("[data-daily-change] .pnl-metric-line strong");
      assert((await value.innerText()).includes("→ US$0.00"), "zero change lacks flat arrow/value");
      assert(await value.getAttribute("class") === "muted is-flat", "zero change is assigned an up/down gain/loss class");
      return "zero adjusted change · neutral is-flat class and → arrow";
    });
    await page.goto(`${url}/?scenario=capital-empty`);
    await page.locator("[data-book-pnl]").waitFor();
    await check(`${prefix} empty capital stays unavailable and read-only at both viewports`, async () => {
      const metric = page.locator("[data-book-pnl]");
      const text = await metric.innerText();
      assert(await metric.getAttribute("data-book-pnl") === "unavailable", "empty capital invents P&L");
      assert(text.includes("Contributed capital not recorded — book P&L unavailable") && !/[\d$฿%]/.test(text), "missing capital renders an invented zero/basis");
      // The pre-existing Google sign-out POST is frozen, not a portfolio mutation.
      assert(await page.locator('form:not([action="/api/auth/logout"]), button[type="submit"]:not(.sidebar-logout)').count() === 0, "mutation form or submit button exists");
      for (const button of await page.getByRole("button").all()) assert(!/add|edit|save|update|delete|remove|recover|override/i.test(await button.getAttribute("aria-label") || await button.innerText()), "mutation control exists");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert(overflow <= 1, `viewport overflow ${overflow}`);
      assert(errors.length === 0, errors.join(" | "));
      return "capital — not zero · no mutation controls · no overflow or browser errors";
    });
  } finally { await page.close(); }
}
