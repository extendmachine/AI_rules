import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const version = readFileSync(join(root, 'VERSION'), 'utf8').trim();
const output = join(root, '.cache', 'screenshots');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    for (const name of ['index', 'api-interfaces', 'references']) {
      await page.goto(pathToFileURL(resolve(root, 'docs', `${name}.html`)).href);
      const footer = page.locator('footer');
      assert.equal(await footer.textContent(), `版本 ${version}`);
      await footer.scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const box = await footer.boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0);
      assert.ok(box.x + box.width <= viewport.width + 1);
      assert.ok(box.y + box.height <= viewport.height + 1);
      assert.ok(await footer.isVisible());
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${name}: page overflow`);
      await page.screenshot({ path: join(output, `${name}-${viewport.width}.png`) });
      console.log(`PASS ${name} ${viewport.width}x${viewport.height}: footer ${version}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
