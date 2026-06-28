const { test, expect } = require('@playwright/test');
const { installAppMocks } = require('./helpers/app-mocks');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('preferredLang', 'ko');
  });
  await installAppMocks(page);
});

test('소개 화면에서 로그인 폼으로 자연스럽게 전환된다', async ({ page }) => {
  await page.goto('/login.html');

  await expect(page.locator('#landing-view')).toBeVisible();
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
  );
  await expect(page.locator('#app-version-badge')).toHaveText('v2026.06.29.1');
  await expect(page.locator('.hero-section h1')).toBeVisible();

  await page.locator('#hero-start-btn').click();

  await expect(page.locator('#landing-view')).toBeHidden();
  await expect(page.locator('#auth-wrapper')).toBeVisible();
  await expect(page.locator('#login-view')).toBeVisible();
});

test('공유 기본 카드는 신뢰할 수 있는 정산 초대 문구와 서비스 화면 이미지를 사용한다', async ({ request }) => {
  const response = await request.get('/index.html');
  const html = await response.text();

  expect(html).toContain(
    '<meta property="og:title" content="Settle Up 정산 초대 | 여행 정산 내역 확인">'
  );
  expect(html).toContain(
    '<meta property="og:description" content="초대받은 여행 정산 내역을 로그인 없이 읽기 전용으로 안전하게 확인하세요.">'
  );
  expect(html).toContain(
    '<meta property="og:image" content="https://settleupweb.cloud/photo1.png">'
  );
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

test('빈 로그인 폼은 팝업 대신 입력 위치와 인라인 오류를 안내한다', async ({ page }) => {
  let dialogCount = 0;
  page.on('dialog', async dialog => {
    dialogCount += 1;
    await dialog.dismiss();
  });

  await page.goto('/login.html');
  await page.locator('#hero-start-btn').click();
  await page.locator('#submit-login-btn').click();

  await expect(page.locator('#login-feedback')).toBeVisible();
  await expect(page.locator('#login-feedback')).toContainText('이메일과 비밀번호');
  await expect(page.locator('#login-email')).toBeFocused();
  expect(dialogCount).toBe(0);

  const authCalls = await page.evaluate(() => (
    window.__SUPABASE_CALLS__.filter(call => call.type === 'auth')
  ));
  expect(authCalls).toHaveLength(0);
});

test('비밀번호 표시 버튼은 값은 유지하고 입력 형식과 접근성 문구를 전환한다', async ({ page }) => {
  await page.goto('/login.html');
  await page.locator('#hero-start-btn').click();
  await page.locator('#login-password').fill('secret12');

  const toggle = page.locator('[data-password-target="login-password"]');
  await expect(toggle).toHaveAttribute('aria-label', '비밀번호 표시');
  await toggle.click();

  await expect(page.locator('#login-password')).toHaveAttribute('type', 'text');
  await expect(page.locator('#login-password')).toHaveValue('secret12');
  await expect(toggle).toHaveAttribute('aria-label', '비밀번호 숨기기');

  await toggle.click();
  await expect(page.locator('#login-password')).toHaveAttribute('type', 'password');
});

test('로그인 연속 제출은 한 번만 전송되고 오류 후 버튼이 복구된다', async ({ page }) => {
  await page.goto('/login.html');
  await page.locator('#hero-start-btn').click();
  await page.locator('#login-email').fill('test@example.com');
  await page.locator('#login-password').fill('secret12');

  await page.locator('#submit-login-btn').dblclick();

  await expect(page.locator('#login-feedback')).toBeVisible();
  await expect(page.locator('#login-feedback')).toContainText('비밀번호');
  await expect(page.locator('#submit-login-btn')).toBeEnabled();
  await expect(page.locator('#submit-login-btn')).toHaveText('로그인');

  const authCalls = await page.evaluate(() => (
    window.__SUPABASE_CALLS__.filter(call => call.type === 'auth' && call.name === 'signInWithPassword')
  ));
  expect(authCalls).toHaveLength(1);
  expect(authCalls[0].args).toEqual({
    email: 'test@example.com',
    hasPassword: true
  });
});

test('회원가입 비밀번호 불일치는 서버 요청 없이 폼 안에서 안내한다', async ({ page }) => {
  await page.goto('/login.html');
  await page.locator('#hero-start-btn').click();
  await page.locator('#go-to-signup').click();
  await page.locator('#signup-email').fill('new@example.com');
  await page.locator('#signup-password').fill('secret12');
  await page.locator('#signup-password-confirm').fill('different12');
  await page.locator('#submit-signup-btn').click();

  await expect(page.locator('#signup-feedback')).toBeVisible();
  await expect(page.locator('#signup-feedback')).toContainText('일치하지 않습니다');
  await expect(page.locator('#signup-password-confirm')).toBeFocused();

  const signupCalls = await page.evaluate(() => (
    window.__SUPABASE_CALLS__.filter(call => call.type === 'auth' && call.name === 'signUp')
  ));
  expect(signupCalls).toHaveLength(0);
});
