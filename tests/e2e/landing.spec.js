const { test, expect } = require('@playwright/test');
const { installAppMocks } = require('./helpers/app-mocks');

test.beforeEach(async ({ page }) => {
  await installAppMocks(page);
});

test('소개 화면에서 로그인 폼으로 자연스럽게 전환된다', async ({ page }) => {
  await page.goto('/login.html');

  await expect(page.locator('#landing-view')).toBeVisible();
  await expect(page.locator('#app-version-badge')).toHaveText('v2026.06.12.1');
  await expect(page.locator('.hero-section h1')).toBeVisible();

  await page.locator('#hero-start-btn').click();

  await expect(page.locator('#landing-view')).toBeHidden();
  await expect(page.locator('#auth-wrapper')).toBeVisible();
  await expect(page.locator('#login-view')).toBeVisible();
});

test('시스템 다크 모드가 소개 화면에 즉시 반영된다', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/login.html');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0b1120');
});

test('헤더에서 로고, 버전, 로그인 제어 영역이 겹치지 않는다', async ({ page }) => {
  await page.goto('/login.html');

  const brandBox = await page.locator('.landing-logo').boundingBox();
  const titleBox = await page.locator('.landing-logo h1').boundingBox();
  const badgeBox = await page.locator('.landing-logo .app-version-badge').boundingBox();
  const controlsBox = await page.locator('.top-right-controls').boundingBox();

  expect(brandBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  expect(badgeBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  expect(badgeBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height - 1);
  expect(brandBox.x + brandBox.width).toBeLessThanOrEqual(controlsBox.x);
});
