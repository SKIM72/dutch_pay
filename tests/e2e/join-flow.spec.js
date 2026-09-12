const { test, expect } = require('@playwright/test');
const { installAppMocks, PUBLIC_SETTLEMENT } = require('./helpers/app-mocks');

const USER = {
  id: '30000000-0000-4000-8000-0000000000aa',
  email: 'outsider@example.com',
  app_metadata: { providers: ['email'] }
};

test('멤버가 아닌 방의 ?id= 링크는 참가를 시도하거나 내 목록에 저장하지 않는다', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('preferredLang', 'ko'));
  // 로그인했지만 이 방에 접근할 수 없다 (조회 결과 없음)
  await installAppMocks(page, PUBLIC_SETTLEMENT, { session: { user: USER }, authSettlements: [] });

  await page.goto('/index.html?id=424242');
  await page.waitForTimeout(1500);

  const savedRooms = await page.evaluate(() => Object.keys(localStorage)
    .filter((key) => key.startsWith('joinedRooms'))
    .flatMap((key) => JSON.parse(localStorage.getItem(key) || '[]')));
  const memberWrites = await page.evaluate(() => (window.__SUPABASE_CALLS__ || [])
    .filter((call) => call.table === 'settlement_members' && call.type === 'mutation'));

  expect(savedRooms).not.toContain(424242);
  expect(memberWrites).toHaveLength(0);
});
