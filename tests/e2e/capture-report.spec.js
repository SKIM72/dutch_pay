const { test, expect } = require('@playwright/test');
const { installAppMocks } = require('./helpers/app-mocks');

const USER = {
  id: '30000000-0000-4000-8000-000000000003',
  email: 'capture@example.com',
  app_metadata: { providers: ['email'] }
};

const PARTICIPANTS = ['사랑', '용민', '주선', '준성', '찬영', '은채', '민준', '하나'];

const SETTLEMENT = {
  id: 99003,
  title: '참여자가 많은 목포여행',
  date: '2026-06-28',
  participants: PARTICIPANTS,
  base_currency: 'KRW',
  is_settled: false,
  user_id: USER.id,
  invite_code: 'CAPTURE',
  deleted_at: null,
  expenses: [
    {
      id: 201,
      name: '에어비앤비 숙박',
      original_amount: 320000,
      currency: 'KRW',
      amount: 320000,
      payer: '사랑',
      split: 'equal',
      shares: Object.fromEntries(PARTICIPANTS.map((name) => [name, 40000])),
      expense_date: '2026-06-28T23:01:00+09:00'
    },
    {
      id: 202,
      name: '목포역 저녁 식사',
      original_amount: 168000,
      currency: 'KRW',
      amount: 168000,
      payer: '용민',
      split: 'equal',
      shares: Object.fromEntries(PARTICIPANTS.map((name) => [name, 21000])),
      expense_date: '2026-06-28T20:30:00+09:00'
    }
  ]
};

test('참여자가 많아도 저장 이미지는 고정 폭 리포트와 줄바꿈 분담 그리드를 사용한다', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('preferredLang', 'ko');
  });
  await installAppMocks(page, SETTLEMENT, {
    session: { user: USER },
    authSettlements: [SETTLEMENT]
  });
  await page.goto(`/index.html?id=${SETTLEMENT.id}`);

  await expect(page.locator('#save-image-btn')).toBeVisible();
  await page.locator('#save-image-btn').click();
  await expect.poll(() => page.evaluate(() => window.__CAPTURE_CALLS__.length)).toBe(1);

  const [capture] = await page.evaluate(() => window.__CAPTURE_CALLS__);
  expect(capture.className).toBe('settlement-capture-report');
  expect(capture.stageClassName).toBe('settlement-capture-stage');
  expect(capture.bounds.left).toBe(0);
  expect(capture.bounds.top).toBe(0);
  expect(capture.width).toBe(1120);
  expect(capture.tableCount).toBe(0);
  expect(capture.expenseCount).toBe(2);
  expect(capture.shareCount).toBe(PARTICIPANTS.length * SETTLEMENT.expenses.length);
  expect(capture.pixelRatio).toBeGreaterThanOrEqual(1);
  expect(capture.pixelRatio).toBeLessThanOrEqual(2);
});

test('지출이 매우 많아도 모바일 캔버스 한도를 넘지 않도록 출력 배율을 낮춘다', async ({ page }) => {
  const manyExpenses = Array.from({ length: 130 }, (_, index) => ({
    ...SETTLEMENT.expenses[index % SETTLEMENT.expenses.length],
    id: 1000 + index,
    name: `장기 여행 지출 ${index + 1}`,
    expense_date: `2026-06-${String((index % 28) + 1).padStart(2, '0')}T12:00:00+09:00`
  }));
  const largeSettlement = { ...SETTLEMENT, id: 99004, expenses: manyExpenses };
  await page.addInitScript(() => {
    localStorage.setItem('preferredLang', 'ko');
  });
  await installAppMocks(page, largeSettlement, {
    session: { user: USER },
    authSettlements: [largeSettlement]
  });
  await page.goto(`/index.html?id=${largeSettlement.id}`);

  await page.locator('#save-image-btn').click();
  await expect.poll(() => page.evaluate(() => window.__CAPTURE_CALLS__.length)).toBe(1);

  const [capture] = await page.evaluate(() => window.__CAPTURE_CALLS__);
  expect(capture.expenseCount).toBe(130);
  expect(capture.pixelRatio).toBeLessThan(1);
  expect(capture.width * capture.height * capture.pixelRatio * capture.pixelRatio)
    .toBeLessThanOrEqual(12_000_001);
  expect(capture.height * capture.pixelRatio).toBeLessThanOrEqual(14_001);
});
