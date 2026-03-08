import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.join(__dirname, '..', 'screenshots');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function waitForApp(page) {
  await page.waitForSelector('header', { timeout: 15000 });
  await page.waitForTimeout(2000);
}

function setTheme(page, theme) {
  return page.evaluate((t) => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(t);
    document.documentElement.style.colorScheme = t;
  }, theme);
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  // ── 1. Light mode — full dashboard ────────────
  console.log('📸 Light mode dashboard...');
  await page.goto(`${BASE_URL}?demo=true`);
  await waitForApp(page);
  await setTheme(page, 'light');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(screenshotsDir, 'lightmode.png') });

  // ── 2. Dark mode — full dashboard ─────────────
  console.log('📸 Dark mode dashboard...');
  await setTheme(page, 'dark');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(screenshotsDir, 'darkmode.png') });

  // Switch back to light for feature screenshots
  await setTheme(page, 'light');
  await page.waitForTimeout(300);

  // ── 3. TODO list panel (with inline editing) ──
  console.log('📸 TODO list (inline edit)...');
  const todoPanel = page.locator('.group\\/card').nth(1);
  // Double-click the first unchecked todo to trigger inline edit
  const firstTodo = todoPanel.locator('li').first().locator('span[title="Double-click to edit"]');
  if (await firstTodo.count() > 0) {
    await firstTodo.dblclick();
    await page.waitForTimeout(300);
  }
  await todoPanel.screenshot({ path: path.join(screenshotsDir, 'todos.png') });

  // ── 4. AI-suggested TODOs ─────────────────────
  console.log('📸 AI-suggested TODOs...');
  const suggestBtn = page.locator('button:has-text("Suggest")');
  if (await suggestBtn.count() > 0) {
    await suggestBtn.first().click();
    await page.waitForTimeout(2000);
  }
  await todoPanel.screenshot({ path: path.join(screenshotsDir, 'ai-todos.png') });

  // ── 5. Summary modal ─────────────────────────
  console.log('📸 Summary modal...');
  const summaryBtn = page.locator('button[aria-label="Summarize"]');
  if (await summaryBtn.count() > 0) {
    await summaryBtn.first().click();
    await page.waitForTimeout(500);
  }
  const summaryModal = page.locator('.fixed.inset-0');
  if (await summaryModal.count() > 0) {
    await summaryModal.first().screenshot({ path: path.join(screenshotsDir, 'summary.png') });
  }

  // ── 6. Summary with generated result ──────────
  console.log('📸 Summary with result...');
  const generateBtn = page.locator('button:has-text("Generate")');
  if (await generateBtn.count() > 0) {
    await generateBtn.first().click();
    await page.waitForTimeout(2500);
  }
  if (await summaryModal.count() > 0) {
    await summaryModal.first().screenshot({ path: path.join(screenshotsDir, 'summary-result.png') });
  }

  // Close modal
  const closeBtn = page.locator('button[aria-label="Close"]');
  if (await closeBtn.count() > 0) {
    await closeBtn.first().click();
    await page.waitForTimeout(300);
  }

  // ── 7. Calendar picker ────────────────────────
  console.log('📸 Calendar picker...');
  const dateBtn = page.locator('header button').filter({ hasText: /\d{4}/ });
  if (await dateBtn.count() > 0) {
    await dateBtn.first().click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: path.join(screenshotsDir, 'calendar.png') });

  // Close calendar
  await page.locator('header').click({ position: { x: 10, y: 10 } });
  await page.waitForTimeout(300);

  // ── 8. Column layout ─────────────────────────
  console.log('📸 Column layout...');
  const layoutBtn = page.locator('button[aria-label="Toggle layout"]');
  if (await layoutBtn.count() > 0) {
    await layoutBtn.first().click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: path.join(screenshotsDir, 'column-layout.png') });

  await browser.close();
  console.log('✅ All screenshots saved to screenshots/');
}

main().catch((err) => {
  console.error('Screenshot script failed:', err);
  process.exit(1);
});
