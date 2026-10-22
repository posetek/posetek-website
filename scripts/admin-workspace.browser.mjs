// Synthetic, read-only admin chrome acceptance. Run a local Vite preview first:
// npm --prefix app run dev -- --host 127.0.0.1 --port 4194
// node scripts/admin-workspace.browser.mjs
// Every non-preview-origin request is blocked, including Firebase and font hosts.
import { chromium, webkit } from '../app/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = new URL(process.env.POSETEK_ADMIN_PREVIEW_URL || 'http://127.0.0.1:4194/');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('This acceptance harness only permits a local synthetic preview.');
const out = join(root, 'artifacts/admin-workspace-browser');
await mkdir(out, { recursive: true });
const results = [];
for (const [engine, name] of [[chromium, 'chromium'], [webkit, 'webkit']]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const width of [360, 390, 430, 768, 1440, 1920]) {
      const mobile = width <= 1050;
      const context = await browser.newContext({ viewport: { width, height: 960 }, deviceScaleFactor: 1, hasTouch: mobile });
      try {
        await context.route('**/*', route => new URL(route.request().url()).origin === base.origin ? route.continue() : route.abort());
        const page = await context.newPage(), errors = [], checks = [];
        const activate = locator => mobile ? locator.tap() : locator.click();
        page.on('pageerror', error => errors.push(error.message));
        const check = (value, message) => { if (!value) throw new Error(`${name} ${width}: ${message}`); checks.push(message); };
        await page.goto(new URL('/admin/device-performance?preview=1', base).href);
        const search = page.getByRole('combobox', { name: 'Find an admin tool' });
        await search.waitFor();
        await page.locator('.admin-workspace__mark').evaluate(image => image.decode());
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'workspace has no horizontal overflow');
        const targets = await page.locator('.admin-workspace__toolbar :is(button, a, summary, input), .admin-workspace__rail a').evaluateAll(elements => elements.filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden').map(element => ({ label: element.getAttribute('aria-label') || element.textContent.trim(), width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height })));
        check(targets.every(target => target.width >= 44 && target.height >= 44), `visible navigation targets are at least 44px (${targets.length})`);
        await page.screenshot({ path: join(out, `${name}-${width}-workspace.png`), fullPage: false });
        await search.fill('drill');
        await activate(page.getByRole('listbox', { name: 'Matching admin tools' }).getByRole('link', { name: /Drill library/ }));
        await page.waitForURL(/\/admin\/drills/);
        check(new URL(page.url()).searchParams.get('preview') === '1', 'pointer or touch tool result activates on its first attempt');
        await search.fill('account recovery');
        await page.keyboard.press('Enter');
        await page.waitForURL(/\/admin\/access/);
        check(new URL(page.url()).searchParams.get('preview') === '1', 'search navigates to the existing tool and preserves preview context');
        await activate(page.locator('summary[aria-label="Admin account menu"]'));
        await page.keyboard.press('Escape');
        check(await page.locator('.admin-workspace__account').evaluate(element => !element.open), 'Escape closes the account menu');
        if (mobile) {
          const open = page.getByRole('button', { name: 'Open admin navigation' });
          await activate(open);
          await page.getByRole('dialog', { name: 'Admin navigation' }).waitFor();
          check(await page.locator('#admin-main').evaluate(element => element.inert), 'drawer makes the background inert');
          await page.screenshot({ path: join(out, `${name}-${width}-drawer.png`), fullPage: false });
          await page.keyboard.press('Shift+Tab');
          check(await page.locator('#admin-navigation').evaluate(element => element.contains(document.activeElement)), 'drawer contains backward keyboard focus');
          await page.keyboard.press('Tab');
          check(await page.locator('#admin-navigation').evaluate(element => element.contains(document.activeElement)), 'drawer contains forward keyboard focus');
          await page.keyboard.press('Escape');
          check(await open.evaluate(element => element === document.activeElement), 'Escape restores the drawer opener');
          await activate(open);
          await activate(page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'App feedback', exact: true }));
          await page.waitForURL(/\/admin\/feedback/);
          check(await open.getAttribute('aria-expanded') === 'false', 'navigation closes the drawer');
          check(await page.locator('#admin-main').evaluate(element => !element.inert && element === document.activeElement), 'navigation restores and focuses main content');
          await activate(open);
          await page.setViewportSize({ width: 1440, height: 960 });
          await page.waitForFunction(() => !document.querySelector('#admin-main').inert);
          check(await page.locator('#admin-navigation').evaluate(element => !element.inert), 'resize restores desktop navigation');
          check(await page.locator('#admin-main').evaluate(element => !element.inert), 'resize restores content');
          await page.setViewportSize({ width, height: 960 });
        }
        await page.goto(new URL('/insights?preview=1', base).href);
        await page.getByLabel('Preview role').selectOption('admin');
        await page.getByRole('navigation', { name: 'Overview shortcuts' }).waitFor();
        await page.locator('.admin-workspace__welcome-mark').evaluate(image => image.decode());
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Overview has no horizontal overflow');
        await page.screenshot({ path: join(out, `${name}-${width}-overview.png`), fullPage: false });
        await page.getByLabel('Preview role').selectOption('manager');
        check(await page.locator('.admin-workspace').count() === 0, 'manager retains its existing shell');
        await page.getByLabel('Preview role').selectOption('coach');
        check(await page.locator('.admin-workspace').count() === 0, 'coach retains its existing shell');
        check(errors.length === 0, 'no page errors');
        results.push({ engine: name, width, passed: true, checks, pageErrors: errors });
        console.log(`${name} ${width}px: ${checks.length} checks passed`);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
await writeFile(join(out, 'results.json'), JSON.stringify({ mode: 'local synthetic; external requests blocked; no physical-device claim', results }, null, 2) + '\n');
