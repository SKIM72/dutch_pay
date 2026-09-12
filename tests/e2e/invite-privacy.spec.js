const { test, expect } = require('@playwright/test');
const { installAppMocks, PUBLIC_SETTLEMENT } = require('./helpers/app-mocks');
test('초대 링크는 색인을 막고 소개 페이지는 색인을 허용한다', async ({ page }) => {
  await installAppMocks(page, PUBLIC_SETTLEMENT);
  await page.goto('/index.html?code=TEST01');
  await page.waitForTimeout(1500);
  const withCode = await page.locator('meta[name="robots"]').getAttribute('content');
  console.log('WITH_CODE:', withCode);
  expect(withCode).toContain('noindex');

  await page.goto('/index.html');
  await page.waitForTimeout(1000);
  const plain = await page.locator('meta[name="robots"]').count();
  console.log('PLAIN_ROBOTS_META_COUNT:', plain);
  expect(plain).toBe(0);
});
