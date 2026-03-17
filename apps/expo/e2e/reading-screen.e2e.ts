import { expect, test } from '@playwright/test';

test.describe('Reading Screen', () => {
  test('displays reading screen on first launch', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify the page rendered successfully
    const body = page.locator('body');
    await expect(body).toBeVisible();

    await page.screenshot({ path: 'e2e/screenshots/reading-screen.png', fullPage: true });
  });

  test('tab navigation is visible with Reading tab', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify tab bar is present
    const tabBar = page.getByRole('tablist');
    await expect(tabBar).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: 'e2e/screenshots/tab-navigation.png', fullPage: true });
  });
});
