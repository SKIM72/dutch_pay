const { test, expect } = require('@playwright/test');
const { installAppMocks } = require('./helpers/app-mocks');
const USER = { id: '30000000-0000-4000-8000-00000000000c', email: 'g@example.com', app_metadata: { providers: ['email'] } };
// 이름 변경이 중간에 끊긴 상태: 명단은 '가영'인데 지출은 옛 이름 '가영이'를 참조
const S = {
  id: 99011, title: '이름 어긋남', date: '2026-06-28', participants: ['가영', '나영'],
  base_currency: 'KRW', is_settled: false, user_id: USER.id, invite_code: 'ORPHAN', deleted_at: null,
  expenses: [
    { id: 501, name: '택시', original_amount: 9000, currency: 'KRW', amount: 9000, payer: '가영이',
      split: 'equal', shares: { '가영이': 4500, '나영': 4500 }, expense_date: '2026-06-28T19:00:00+09:00' }
  ]
};
test('참여자 명단에 없는 결제자가 있어도 금액이 깨지지 않고 경고를 띄운다', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('preferredLang', 'ko'));
  await installAppMocks(page, S, { session: { user: USER }, authSettlements: [S] });
  await page.unroute('**/font-awesome/**');
  await page.goto(`/index.html?id=${S.id}`);
  await page.waitForTimeout(2500);
  await page.evaluate(() => { document.querySelectorAll('.toast,#toast').forEach(t=>t.remove()); document.querySelectorAll('details').forEach(d=>d.open=true); });

  const body = await page.locator('#calculator').innerText();
  expect(body).not.toContain('NaN');

  // 명단 밖 결제자의 금액도 총액과 송금에 그대로 반영되어야 한다
  await expect(page.locator('#summary-total-value')).toHaveText('9,000');
  await expect(page.locator('.transfer-amount')).toHaveText(['4,500 KRW']);

  const notice = page.locator('#orphan-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('가영이');
});
