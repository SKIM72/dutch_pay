const { test, expect } = require('@playwright/test');
const {
  firstVisibleExpenseName,
  installAppMocks
} = require('./helpers/app-mocks');

test.beforeEach(async ({ page }) => {
  await installAppMocks(page);
  await page.goto('/index.html?code=TEST01');
  await expect(page.locator('#settlement-display')).toHaveText('자동 테스트 여행');
});

test('비로그인 초대 미리보기는 읽기 전용 화면만 보여준다', async ({ page }) => {
  await expect(page.locator('#public-preview-banner')).toBeVisible();
  await expect(page.locator('#left-pane')).toBeHidden();
  await expect(page.locator('#expense-form-card')).toBeHidden();
  await expect(page.locator('#public-preview-save-btn')).toBeVisible();
  await expect(page.locator('#expense-sort-select')).toBeVisible();

  const calls = await page.evaluate(() => window.__SUPABASE_CALLS__);
  expect(calls.filter((call) => call.type === 'mutation')).toEqual([]);
  expect(calls.some((call) => call.name === 'get_public_settlement_by_invite_code')).toBe(true);
});

test('지출은 기본 최신순이며 날짜와 금액 기준으로 다시 정렬할 수 있다', async ({ page }) => {
  await expect(page.locator('#expense-sort-select')).toHaveValue('date-desc');
  expect((await firstVisibleExpenseName(page)).trim()).toBe('공항철도');

  await page.locator('#expense-sort-select').selectOption('date-asc');
  expect((await firstVisibleExpenseName(page)).trim()).toBe('첫날 점심');

  await page.locator('#expense-sort-select').selectOption('amount-desc');
  expect((await firstVisibleExpenseName(page)).trim()).toBe('첫날 점심');

  await page.locator('#expense-sort-select').selectOption('amount-asc');
  expect((await firstVisibleExpenseName(page)).trim()).toBe('카페');
});

test('내 목록에 저장 CTA는 로그인 확인만 띄우고 DB를 변경하지 않는다', async ({ page }) => {
  await page.locator('#public-preview-save-btn').click();

  await expect(page.locator('#custom-confirm-modal')).toBeVisible();
  await expect(page.locator('#confirm-message')).not.toBeEmpty();
  await page.locator('#confirm-no-btn').click();
  await expect(page.locator('#custom-confirm-modal')).toBeHidden();

  const calls = await page.evaluate(() => window.__SUPABASE_CALLS__);
  expect(calls.filter((call) => call.type === 'mutation')).toEqual([]);
  expect(calls.some((call) => call.name === 'join_settlement_by_invite_code')).toBe(false);
});
