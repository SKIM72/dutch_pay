const { test, expect } = require('@playwright/test');
const {
  firstVisibleExpenseName,
  installAppMocks
} = require('./helpers/app-mocks');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('preferredLang', 'ko');
  });
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

test('정산 확정 전에도 예상 송금 금액을 보여주고 송금 버튼은 숨긴다', async ({ page }) => {
  await expect(page.locator('#final-settlement-container')).toContainText('예상 정산');
  await expect(page.locator('#final-settlement-container')).toContainText('11,500 KRW');
  await expect(page.locator('#final-settlement-container .transfer-item.is-estimate')).toHaveCount(1);
  await expect(page.locator('#final-settlement-container .payment-action')).toHaveCount(0);
});

test('모바일 정산 확정 버튼은 요약 영역을 채우고 예상 내역과 간격을 둔다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#complete-settlement-btn').evaluate((button) => {
    button.classList.remove('hidden');
    button.textContent = '정산 확정하기';
  });

  const summaryRightBox = await page.locator('.summary-right').boundingBox();
  const transferBox = await page.locator('.transfer-item.is-estimate').last().boundingBox();
  const buttonBox = await page.locator('#complete-settlement-btn').boundingBox();

  expect(summaryRightBox).not.toBeNull();
  expect(transferBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(Math.abs(buttonBox.width - summaryRightBox.width)).toBeLessThanOrEqual(1);
  expect(buttonBox.y - (transferBox.y + transferBox.height)).toBeGreaterThanOrEqual(12);
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
