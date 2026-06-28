const { test, expect } = require('@playwright/test');
const { PUBLIC_SETTLEMENT, installAppMocks } = require('./helpers/app-mocks');

const USER = {
  id: '20000000-0000-4000-8000-000000000002',
  email: 'member@example.com',
  app_metadata: { providers: ['email', 'google'] }
};

const JOINED_SETTLEMENT = {
  ...PUBLIC_SETTLEMENT,
  id: 99002,
  title: '다른 기기에서도 보이는 여행',
  user_id: '10000000-0000-0000-0000-000000000001',
  invite_code: 'SYNC02'
};

async function installAuthenticatedFixture(page) {
  await page.addInitScript(() => {
    localStorage.setItem('preferredLang', 'ko');
  });
  await installAppMocks(page, PUBLIC_SETTLEMENT, {
    session: { user: USER },
    membershipRows: [{ settlement_id: JOINED_SETTLEMENT.id }],
    authSettlements: [JOINED_SETTLEMENT]
  });
}

test('참여 정산은 새 기기의 빈 localStorage에서도 서버 멤버십으로 복원된다', async ({ page }) => {
  await installAuthenticatedFixture(page);
  await page.goto('/index.html');

  await expect(page.locator(`.settlement-item[data-id="${JOINED_SETTLEMENT.id}"]`)).toContainText(
    JOINED_SETTLEMENT.title
  );

  const joinedRooms = await page.evaluate((userId) => (
    JSON.parse(localStorage.getItem(`joinedRooms_${userId}`) || '[]')
  ), USER.id);
  expect(joinedRooms).toContain(JOINED_SETTLEMENT.id);
});

test('모바일 정산 목록은 본문 위에 그림자와 배경을 둔 드로어로 열린다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installAuthenticatedFixture(page);
  await page.goto('/index.html');

  const sidebar = page.locator('#left-pane');
  const backdrop = page.locator('#sidebar-backdrop');
  const rightPane = page.locator('#right-pane');

  await expect(sidebar).not.toHaveClass(/collapsed/);
  await expect(backdrop).toHaveClass(/is-visible/);
  await expect(page.locator('#mobile-menu-btn')).toHaveAttribute('aria-expanded', 'true');

  const openRightPaneBox = await rightPane.boundingBox();
  const sidebarStyle = await sidebar.evaluate((element) => ({
    position: getComputedStyle(element).position,
    shadow: getComputedStyle(element).boxShadow
  }));
  expect(sidebarStyle.position).toBe('absolute');
  expect(sidebarStyle.shadow).not.toBe('none');

  const backdropBox = await backdrop.boundingBox();
  expect(backdropBox).not.toBeNull();
  await page.mouse.click(backdropBox.x + backdropBox.width - 8, backdropBox.y + backdropBox.height / 2);
  await expect(sidebar).toHaveClass(/collapsed/);
  await expect(backdrop).not.toHaveClass(/is-visible/);
  await expect(page.locator('#mobile-menu-btn')).toHaveAttribute('aria-expanded', 'false');

  const closedRightPaneBox = await rightPane.boundingBox();
  expect(closedRightPaneBox).not.toBeNull();
  expect(openRightPaneBox).not.toBeNull();
  expect(Math.abs(closedRightPaneBox.width - openRightPaneBox.width)).toBeLessThanOrEqual(1);
});

test('사이드바가 열린 중간 너비에서도 정산 버튼은 요약 카드 안에 머문다', async ({ page }) => {
  await page.setViewportSize({ width: 1050, height: 900 });
  await page.addInitScript(({ userId, roomId }) => {
    localStorage.setItem('preferredLang', 'ko');
    localStorage.setItem(`joinedRooms_${userId}`, JSON.stringify([roomId]));
  }, { userId: USER.id, roomId: JOINED_SETTLEMENT.id });
  await installAppMocks(page, PUBLIC_SETTLEMENT, {
    session: { user: USER },
    membershipRows: [{ settlement_id: JOINED_SETTLEMENT.id }],
    authSettlements: [JOINED_SETTLEMENT]
  });
  await page.goto(`/index.html?id=${JOINED_SETTLEMENT.id}`);

  await page.locator('#mobile-menu-btn').click();
  await expect(page.locator('#left-pane')).not.toHaveClass(/collapsed/);
  await expect(page.locator('#complete-settlement-btn')).toBeVisible();
  await expect.poll(() => page.locator('#complete-settlement-btn').evaluate(
    (button) => button.getBoundingClientRect().width
  )).toBeGreaterThan(600);

  const cardBox = await page.locator('#summary-card').boundingBox();
  const buttonBox = await page.locator('#complete-settlement-btn').boundingBox();
  const summaryRightBox = await page.locator('.summary-right').boundingBox();

  expect(cardBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(summaryRightBox).not.toBeNull();
  expect(buttonBox.x).toBeGreaterThanOrEqual(cardBox.x);
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
  expect(buttonBox.width).toBeGreaterThan(cardBox.width * 0.7);
});
