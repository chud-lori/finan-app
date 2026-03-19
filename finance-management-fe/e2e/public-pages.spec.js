// @ts-check
const { test, expect } = require('@playwright/test');

// ── Landing page ──────────────────────────────────────────────────────────────
test.describe('Landing page', () => {
  test('loads and shows hero headline', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Finan App/i);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('has Get Started / Sign In links', async ({ page }) => {
    await page.goto('/');
    // At least one visible link pointing to /register or /login
    // (nav links may be hidden in mobile hamburger — check any visible one)
    const links = page.locator('a[href="/register"], a[href="/login"]');
    const count = await links.count();
    let anyVisible = false;
    for (let i = 0; i < count; i++) {
      if (await links.nth(i).isVisible()) { anyVisible = true; break; }
    }
    expect(anyVisible).toBe(true);
  });

  test('footer links to Privacy Policy and Terms', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a[href="/privacy"]')).toBeVisible();
    await expect(page.locator('a[href="/terms"]')).toBeVisible();
  });

  test('is rendered in light mode (no dark class on html)', async ({ page }) => {
    await page.goto('/');
    const htmlClass = await page.locator('html').getAttribute('class');
    expect(htmlClass ?? '').not.toContain('dark');
  });
});

// ── Auth pages ────────────────────────────────────────────────────────────────
test.describe('Login page', () => {
  test('renders login form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[type="text"], input[name="identifier"], input[placeholder*="username" i], input[placeholder*="email" i]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /log in|sign in/i })).toBeVisible();
  });

  test('shows forgot password link', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('a[href="/forgot-password"]')).toBeVisible();
  });

  test('shows error on empty submit', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /log in|sign in/i }).click();
    // Either browser validation or an error message should appear
    const hasValidation =
      (await page.locator('input:invalid').count()) > 0 ||
      (await page.locator('text=/required|username|password/i').count()) > 0;
    expect(hasValidation).toBe(true);
  });
});

test.describe('Register page', () => {
  test('renders registration form', async ({ page }) => {
    await page.goto('/register');
    // Name field uses placeholder "Jajang Aja"
    await expect(page.locator('input[placeholder="Jajang Aja"]')).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /register|sign up|create/i })).toBeVisible();
  });
});

test.describe('Forgot password page', () => {
  test('renders email form', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /send|reset/i })).toBeVisible();
  });

  test('shows success message after submit (anti-enumeration)', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.locator('input[type="email"]').fill('nonexistent@example.com');
    await page.getByRole('button', { name: /send|reset/i }).click();
    // Should show a success/confirmation message regardless (even if API unreachable)
    await expect(page.locator('text=/inbox|registered|reset link/i').first()).toBeVisible({ timeout: 8000 });
  });
});

// ── Legal pages ───────────────────────────────────────────────────────────────
test.describe('Privacy Policy page', () => {
  test('loads with correct heading', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: /privacy/i }).first()).toBeVisible();
  });
});

test.describe('Terms of Service page', () => {
  test('loads with correct heading', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: /terms/i }).first()).toBeVisible();
  });
});

// ── Protected route redirect ──────────────────────────────────────────────────
test.describe('Auth guard', () => {
  test('dashboard redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('add page redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/add');
    await expect(page).toHaveURL(/\/login/);
  });

  test('analytics page redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/analytics');
    await expect(page).toHaveURL(/\/login/);
  });
});
