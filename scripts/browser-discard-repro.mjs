import { chromium } from 'playwright';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:4173';
const seeds = Number(process.env.SEEDS ?? 100);
const families = ['blood', 'sand'];
const failures = [];

const browser = await chromium.launch({ headless: true });

try {
  for (const family of families) {
    for (let seed = 1; seed <= seeds; seed += 1) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const pageErrors = [];
      const consoleErrors = [];

      page.on('pageerror', (error) => {
        pageErrors.push({ message: error.message, stack: error.stack });
      });
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });

      // Keep the real ordering semantics but make AI waits short enough for a seed sweep.
      await page.addInitScript(() => {
        const nativeSetTimeout = window.setTimeout.bind(window);
        window.setTimeout = ((handler, timeout = 0, ...args) =>
          nativeSetTimeout(handler, Math.min(Number(timeout) || 0, 15), ...args));
      });

      try {
        await page.goto(`${baseUrl}/?seed=${seed}`, { waitUntil: 'networkidle', timeout: 15_000 });
        await page.getByRole('button', { name: 'Take a seat' }).click();
        await page.getByText('Your move', { exact: true }).waitFor({ state: 'visible', timeout: 10_000 });

        const discard = page.locator('.discard-button').nth(family === 'blood' ? 0 : 1);
        await discard.waitFor({ state: 'visible', timeout: 5_000 });
        if (await discard.isDisabled()) throw new Error(`${family} discard unexpectedly disabled`);

        const before = await page.locator('#root').innerText();
        await discard.click();
        await page.waitForTimeout(400);

        const root = page.locator('#root');
        const after = await root.innerText().catch(() => '');
        const body = await page.locator('body').innerText().catch(() => '');
        const incident = body.includes('ACTION BLOCKED');
        const malfunction = body.includes('TABLE MALFUNCTION');
        const blank = after.trim().length === 0;

        if (pageErrors.length || incident || malfunction || blank) {
          failures.push({
            family,
            seed,
            pageErrors,
            consoleErrors,
            incident,
            malfunction,
            blank,
            before: before.slice(0, 1500),
            after: after.slice(0, 1500),
            url: page.url(),
          });
          console.error(JSON.stringify(failures.at(-1), null, 2));
          throw new Error(`Browser discard failure for ${family}, seed ${seed}`);
        }
      } finally {
        await context.close();
      }
    }
    console.log(`${family}: ${seeds} browser discard actions passed`);
  }
} finally {
  await browser.close();
}

if (failures.length) process.exit(1);
console.log(`All ${seeds * families.length} browser discard actions passed.`);
