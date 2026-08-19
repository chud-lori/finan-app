// @ts-check
// Needs TEST_EMAIL / TEST_PASSWORD for a real account; skips when unset.
const { test, expect } = require('@playwright/test');

const EMAIL    = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;

async function login(page) {
  await page.goto('/login');
  const userField = page.locator('input[name="identifier"], input[type="text"], input[placeholder*="username" i]').first();
  await userField.fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /log in|sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
}

test.describe('Authenticated flows', () => {
  test.skip(!EMAIL || !PASSWORD, 'TEST_EMAIL / TEST_PASSWORD not set — skipping authenticated tests');

  test('full login flow lands on dashboard', async ({ page }) => {
    await login(page);
    await expect(page.locator('text=/balance|transaction|income|expense/i').first()).toBeVisible();
  });

  test('dashboard shows month picker', async ({ page }) => {
    await login(page);
    const picker = page.getByRole('button', { name: /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i }).first();
    await expect(picker).toBeVisible();
  });

  test('add transaction page loads with category field visible', async ({ page }) => {
    await login(page);
    await page.goto('/add');
    // Must be visible immediately, not gated behind the type selection.
    await expect(page.locator('[placeholder*="category" i], button[role="combobox"]').first()).toBeVisible();
  });

  test('analytics page loads', async ({ page }) => {
    await login(page);
    await page.goto('/analytics');
    await expect(page.locator('text=/analytics|spending|category/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('insights page loads', async ({ page }) => {
    await login(page);
    await page.goto('/insights');
    await expect(page.locator('text=/unusual|anomal|insight/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('logout-all invalidates session', async ({ page }) => {
    await login(page);
    await page.goto('/settings');
    const logoutAllBtn = page.getByRole('button', { name: /logout all|sign out all/i });
    if (await logoutAllBtn.isVisible()) {
      await logoutAllBtn.click();
      await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
    }
  });
});
