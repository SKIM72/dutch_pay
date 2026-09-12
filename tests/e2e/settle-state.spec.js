const { test, expect } = require('@playwright/test');
const { installAppMocks } = require('./helpers/app-mocks');
const USER = { id: '30000000-0000-4000-8000-00000000000d', email: 't@example.com', app_metadata: { providers: ['email'] } };
const S = {
  id: 99012, title: '토글', date: '2026-06-28', participants: ['가영','나영'],
  base_currency: 'KRW', is_settled: false, user_id: USER.id, invite_code: 'TGL001', deleted_at: null,
  expenses: [{ id: 601, name: '커피', original_amount: 8000, currency: 'KRW', amount: 8000, payer: '가영',
    split: 'equal', shares: { '가영': 4000, '나영': 4000 }, expense_date: '2026-06-28T10:00:00+09:00' }]
};
test('상태 저장이 실패하면 화면도 원래대로 돌아온다', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('preferredLang', 'ko'));
  await installAppMocks(page, S, { session: { user: USER }, authSettlements: [S] });
  await page.unroute('**/font-awesome/**');
  await page.goto(`/index.html?id=${S.id}`);
  await page.waitForTimeout(2500);

  const before = await page.locator('#complete-settlement-btn').textContent();
  // mock은 모든 update를 차단하므로 저장은 반드시 실패한다
  await page.locator('#complete-settlement-btn').click();
  await page.waitForTimeout(1200);
  const after = await page.locator('#complete-settlement-btn').textContent();
  const settled = await page.evaluate(() => !!document.querySelector('#expense-form-card.is-settled'));

  console.log('BUTTON_BEFORE:', before.trim(), '| AFTER:', after.trim(), '| LOCKED:', settled);
  expect(after.trim()).toBe(before.trim());
  expect(settled).toBe(false);
});
