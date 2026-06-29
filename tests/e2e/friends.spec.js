const { test, expect } = require('@playwright/test');
const { installAppMocks } = require('./helpers/app-mocks');

const USER = {
  id: '40000000-0000-4000-8000-000000000001',
  email: 'friends@example.com',
  nickname: '사랑',
  app_metadata: { providers: ['email'] }
};

const SETTLEMENT = {
  id: 99401,
  title: '친구 기능 테스트',
  date: '2026-06-29',
  participants: ['사랑', '경화'],
  base_currency: 'JPY',
  is_settled: false,
  user_id: USER.id,
  invite_code: 'FRIEND',
  deleted_at: null,
  expenses: []
};

const FRIEND_DASHBOARD = {
  friendCode: 'MYCODE2026',
  friends: [
    { userId: '40000000-0000-4000-8000-000000000002', nickname: '경화' },
    { userId: '40000000-0000-4000-8000-000000000003', nickname: '은찬' }
  ],
  incoming: [
    {
      requestId: 7101,
      userId: '40000000-0000-4000-8000-000000000004',
      nickname: '지석'
    }
  ],
  outgoing: []
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('preferredLang', 'ko');
  });
  await installAppMocks(page, SETTLEMENT, {
    session: { user: USER },
    authSettlements: [SETTLEMENT],
    friendDashboard: FRIEND_DASHBOARD
  });
  await page.goto(`/index.html?id=${SETTLEMENT.id}`);
});

test('마이페이지에서 친구 코드, 요청, 친구 목록을 관리한다', async ({ page }) => {
  await page.locator('#user-info-display').click();

  await expect(page.locator('#profile-modal')).toBeVisible();
  await expect(page.locator('#my-friend-code')).toHaveText('MYCODE2026');
  await expect(page.locator('#friend-list .friend-list-item')).toHaveCount(2);
  await expect(page.locator('#incoming-friend-requests')).toContainText('지석');

  await page.locator('#incoming-friend-requests .friend-accept-btn').click();
  await expect.poll(async () => {
    const calls = await page.evaluate(() => window.__SUPABASE_CALLS__);
    return calls.some((call) => (
      call.type === 'rpc'
      && call.name === 'respond_friend_request'
      && call.args?.p_request_id === 7101
      && call.args?.p_accept === true
    ));
  }).toBe(true);
});

test('새 정산에서 친구를 선택하면 참가자 수와 자동 초대 선택이 함께 갱신된다', async ({ page }) => {
  await page.locator('#add-settlement-fab').click();

  await expect(page.locator('#add-settlement-modal')).toBeVisible();
  await expect(page.locator('#create-friend-section')).toBeVisible();
  await expect(page.locator('#create-friend-list .create-friend-option')).toHaveCount(2);

  await page.locator('label[for="create-friend-0"]').click();
  await expect(page.locator('#selected-friend-count')).toHaveText('1명');
  await expect(page.locator('#participant-count-badge')).toHaveText('3명');
});
