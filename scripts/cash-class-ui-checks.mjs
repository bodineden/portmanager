/** Independent known-money assertions with deliberately broken DOM negative controls. */
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const compact = (text) => text.replace(/\s+/g, " ").trim();
const expected = [
  ["t212", "Stocks Port", "US$49.22", "1.5% of portfolio", "Shares and ETFs on Trading 212"],
  ["crypto", "Crypto Port", "US$333.81", "10.2% of portfolio", "NFTs and crypto in your wallet"],
  ["cash", "Cash", "US$2,895.13", "88.3% of portfolio", "Broker cash, cash pot and stablecoins"],
];
async function assertClasses(page) {
  const tiles = page.locator(".pnl-class-values [data-value-class]");
  assert(await tiles.count() === 3, "missing or duplicate Cash/Stocks/Crypto tile");
  for (const [index, [key, label, usd, share, subtitle]] of expected.entries()) {
    const tile = tiles.nth(index);
    assert(await tile.getAttribute("data-value-class") === key, "class order/key differs");
    assert(await tile.locator("small").innerText() === label, "class label differs");
    assert(await tile.locator("strong").innerText() === usd, `wrong ${key} value: stablecoins must be Cash`);
    assert((await tile.innerText()).includes(share) && (await tile.innerText()).includes(subtitle), "share/subtitle differs");
    assert((await tile.locator(".pnl-class-secondary").innerText()).startsWith("฿"), "THB mirror missing");
  }
}
async function assertStablecoinNoPnl(page) {
  const rows = page.locator('[data-cash-token="true"]');
  assert(await rows.count() === 2, "priced USDC/USDG must stay displayed as value-only cash");
  for (const row of await rows.all()) {
    assert(await row.getAttribute("data-pnl-eligibility") === null, "stablecoin still enters recorded P&L");
    for (const name of ["basis", "pnl"]) assert(!/[\d$฿%]/.test(await row.locator(`[data-pnl-cell="${name}"]`).innerText()), "stablecoin has numeric basis/P&L");
    assert((await row.innerText()).includes("Stablecoin · value only · no P&L"), "cash treatment is not explained");
  }
}
async function rejects(operation, expectedError) {
  try { await operation(); } catch (error) { assert(expectedError.test(error.message), `unexpected negative-control error: ${error.message}`); return; }
  throw new Error("negative control was wrongly accepted");
}
export async function auditCashClassFixtures(browser, url, viewport, check) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  const prefix = `${viewport.name} Cash class`;
  try {
    await page.goto(`${url}/?scenario=cash-class-home`);
    await page.locator('[data-value-class="cash"]').waitFor();
    await check(`${prefix} positive control: three classes reconcile to pinned $3278.16`, async () => {
      await assertClasses(page);
      const solanaUsdc = await page.evaluate(() => window.__cashFixturePortfolio.wallet.tokens.find((row) => row.chainId === "solana" && row.symbol === "EPjF…Dt1v"));
      assert(solanaUsdc?.contract === "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        && solanaUsdc.name === "SPL token " + solanaUsdc.contract && solanaUsdc.priced === true, "Solana fixture no longer mirrors real mint-label output");
      assert(await page.locator(".pnl-hero-value").innerText() === "US$3,278.16", "grand total changed");
      const labels = await page.locator(".pnl-allocation-item > div:first-child > span").allTextContents();
      assert(JSON.stringify(labels.map(compact)) === JSON.stringify(expected.map((row) => row[1])), "allocation panel lost class order");
      assert((await page.locator(".pnl-allocation-item").nth(2).innerText()).includes("Value only · no P&L"), "Cash allocation fabricates P&L");
      await assertStablecoinNoPnl(page);
      return "Stocks 49.22 + Crypto 333.81 + Cash 2895.13 = 3278.16; stablecoin P&L absent";
    });
    await check(`${prefix} negative control: a vanished Cash tile must fail`, async () => {
      const html = await page.locator(".pnl-class-values").innerHTML();
      await page.locator('[data-value-class="cash"]').evaluate((node) => node.remove());
      try { await rejects(() => assertClasses(page), /missing or duplicate/); }
      finally { await page.locator(".pnl-class-values").evaluate((node, html) => { node.innerHTML = html; }, html); }
      await assertClasses(page);
    });
    await check(`${prefix} negative control: stablecoins counted in Crypto must fail`, async () => {
      const number = page.locator('[data-value-class="crypto"] strong'); const text = await number.innerText();
      await number.evaluate((node) => { node.textContent = "US$425.42"; });
      try { await rejects(() => assertClasses(page), /wrong crypto value/); }
      finally { await number.evaluate((node, text) => { node.textContent = text; }, text); }
      await assertClasses(page);
    });
    await check(`${prefix} negative control: unknown Solana contract must fail stablecoin Cash checks`, async () => {
      try {
        await page.goto(`${url}/?scenario=cash-class-unknown-contract-home`);
        await page.locator('[data-value-class="cash"]').waitFor();
        const row = await page.evaluate(() => window.__cashFixturePortfolio.wallet.tokens.find((row) => row.chainId === "solana" && row.symbol === "EPjF…Dt1v"));
        assert(row?.contract === "unknown-mint" && row.priced === true && Number.isFinite(row.valueUsd), "unknown-contract variant did not reach the real join");
        assert(await page.locator(".pnl-hero-value").innerText() === "US$3,278.16", "negative control changed the book instead of classification");
        await rejects(() => assertClasses(page), /wrong crypto value: stablecoins must be Cash/);
        await rejects(() => assertStablecoinNoPnl(page), /priced USDC\/USDG must stay displayed/);
      } finally {
        await page.goto(`${url}/?scenario=cash-class-home`);
        await page.locator('[data-value-class="cash"]').waitFor();
      }
      await assertClasses(page);
      await assertStablecoinNoPnl(page);
      return "unknown mint rejected by real allocation and value-only row checks; canonical mint restored";
    });
    await check(`${prefix} negative control: a stablecoin numeric P&L must fail`, async () => {
      const cell = page.locator('[data-cash-token="true"] [data-pnl-cell="pnl"]').first(); const html = await cell.innerHTML();
      await cell.evaluate((node) => { node.textContent = "US$0.71"; });
      try { await rejects(() => assertStablecoinNoPnl(page), /numeric basis\/P&L/); }
      finally { await cell.evaluate((node, html) => { node.innerHTML = html; }, html); }
      await assertStablecoinNoPnl(page);
    });
    await check(`${prefix} headline hierarchy, panel inventory, plain copy and comparison`, async () => {
      const hero = page.locator(".pnl-value-hero");
      assert(!/joined|coverage|eligible|basis|unreconciled|recorded subset/i.test(await hero.innerText()), "hero contains technical jargon");
      assert((await page.locator("[data-capital-comparison]").innerText()) === "You put in ฿120,000.00. The book is worth ฿108,431.52 today.", "capital comparison differs from recorded values");
      for (const selector of [".pnl-metric-strip", ".pnl-performance", ".pnl-allocation", ".pnl-calendar", ".pnl-assets", ".pnl-source-strip", ".home-wallet-table"]) assert(await page.locator(selector).count() === 1, `panel missing: ${selector}`);
      const sizes = await page.locator('.pnl-hero-value, [data-value-class] strong, [data-value-class] .pnl-class-secondary').evaluateAll((nodes) => nodes.map((node) => ({ size: parseFloat(getComputedStyle(node).fontSize), primary: node.matches(".pnl-hero-value"), tile: node.matches("strong"), rect: node.getBoundingClientRect().toJSON() })));
      const total = sizes.find((r) => r.primary); const tiles = sizes.filter((r) => r.tile && !r.primary);
      assert(tiles.every((r) => r.size >= 35 && r.size < total.size), "headline tiles lack a clear large-number hierarchy");
      if (viewport.width < 720) assert(tiles[0].rect.y < tiles[1].rect.y && tiles[1].rect.y < tiles[2].rect.y, "mobile tiles do not stack");
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "horizontal viewport overflow");
      assert(await page.locator('form:not([action="/api/auth/logout"]), input, select, [contenteditable="true"]').count() === 0, "mutation shape added");
    });
    for (const missing of ["no-capital", "no-value"]) {
      await page.goto(`${url}/?scenario=cash-class-${missing}-home`);
      await page.locator("[data-capital-comparison]").waitFor();
      await check(`${prefix} ${missing} comparison fails closed`, async () => {
        assert(await page.locator("[data-capital-comparison]").innerText() === "Not enough live data to compare with what you put in.", "missing comparison invents a partial/zero value");
      });
    }
    await page.goto(`${url}/?scenario=cash-class-usd-floor-registry`);
    await page.locator(".asset-nft-table").waitFor();
    await check(`${prefix} registry retains four cards, full Cash and honest NFT quote`, async () => {
      assert(await page.locator(".asset-registry-kpi").count() === 4, "registry card inventory changed");
      assert(compact(await page.locator(".asset-registry-kpi").nth(1).textContent()).includes("02 / CashUS$2,895.13"), "registry Cash card is not the full class");
      const table = page.locator(".asset-nft-table");
      assert((await table.locator("thead th").allTextContents()).includes("Floor"), "NFT quote header assumes ETH");
      const row = table.locator("tbody tr").filter({ hasText: "prspct" });
      assert((await row.innerText()).includes("0.4 USDG") && (await row.innerText()).includes("US$1.20"), "USDG quote mis-scaled as ETH");
      assert((await table.locator("tbody tr").filter({ hasText: "itsriggles" }).innerText()).includes("0.0305 ETH"), "ETH quote changed");
      assert(errors.length === 0, errors.join(" | "));
    });
  } finally { await page.close(); }
}
