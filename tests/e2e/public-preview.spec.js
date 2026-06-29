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

test('PC 정산 확정 버튼은 예상 정산 금액과 충분한 간격을 둔다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#complete-settlement-btn').evaluate((button) => {
    button.classList.remove('hidden');
    button.textContent = '정산 확정하기';
  });

  const transferBox = await page.locator('.transfer-item.is-estimate').last().boundingBox();
  const buttonBox = await page.locator('#complete-settlement-btn').boundingBox();

  expect(transferBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(buttonBox.y - (transferBox.y + transferBox.height)).toBeGreaterThanOrEqual(14);
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

test('영수증 사진은 OCR 분석 후 검토를 거쳐 기존 지출 입력칸에 적용된다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#expense-form-card').evaluate((card) => card.classList.remove('hidden'));
  await page.locator('#open-receipt-scan-btn').click();

  await expect(page.locator('#receipt-scan-modal')).toBeVisible();
  await expect(page.locator('#receipt-source-step')).toBeVisible();
  await expect(page.locator('.receipt-privacy-note')).toContainText('DB나 Storage에는 저장되지 않습니다');

  const onePixelPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  );
  await page.locator('#receipt-gallery-input').setInputFiles({
    name: 'korean-receipt.png',
    mimeType: 'image/png',
    buffer: onePixelPng
  });

  await expect(page.locator('#receipt-analysis-step')).toBeVisible();
  await expect(page.locator('#receipt-review-step')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#receipt-result-currency')).toHaveValue('KRW');
  await expect(page.locator('#receipt-result-amount')).toHaveValue('32,800');
  await expect(page.locator('#receipt-result-name')).toHaveValue('서울역 식당');
  await expect(page.locator('#receipt-result-date')).toHaveValue('2026-06-11T18:30');
  await expect(page.locator('#receipt-confidence')).toContainText('94%');
  await expect(page.locator('#receipt-processing-badge')).toContainText('이미지 자동 최적화');

  await page.locator('#receipt-result-amount').focus();
  await page.locator('#apply-receipt-result-btn').evaluate((button) => button.click());

  await expect(page.locator('#receipt-scan-modal')).toBeHidden();
  await expect(page.locator('#item-currency')).toHaveValue('KRW');
  await expect(page.locator('#item-amount')).toHaveValue('32,800');
  await expect(page.locator('#item-name')).toHaveValue('서울역 식당');
  await expect(page.locator('#item-date')).toHaveValue('2026-06-11T18:30');
  await expect(page.locator('.toast-success')).toContainText('영수증 내용을 입력했어요');
  expect(await page.evaluate(() => document.activeElement?.id || '')).not.toBe('item-amount');

  const toastBox = await page.locator('.toast-success').boundingBox();
  expect(toastBox).not.toBeNull();
  expect(toastBox.x).toBeGreaterThanOrEqual(15);
  expect(toastBox.x + toastBox.width).toBeLessThanOrEqual(307);

  const calls = await page.evaluate(() => window.__SUPABASE_CALLS__);
  expect(calls.filter((call) => call.type === 'mutation')).toEqual([]);
  expect(calls.some((call) => (
    call.type === 'function'
    && call.name === 'scan-receipt'
    && call.body.hasImage
    && call.body.mimeType === 'image/jpeg'
    && call.body.imageProcessing?.autoCropped === false
  ))).toBe(true);
});

test('자동 모서리 감지 실패 시 수동 영역 선택 후 다시 분석한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#expense-form-card').evaluate((card) => card.classList.remove('hidden'));
  await page.locator('#open-receipt-scan-btn').click();

  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1000;
    const context = canvas.getContext('2d');
    context.fillStyle = '#1f2937';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    const file = new File([blob], 'edge-detection-fallback.jpg', { type: 'image/jpeg' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const input = document.getElementById('receipt-gallery-input');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await expect(page.locator('#receipt-crop-step')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#receipt-crop-selection')).toBeVisible();
  await expect(page.locator('#receipt-review-step')).toBeHidden();

  const callsBeforeManualCrop = await page.evaluate(() => window.__SUPABASE_CALLS__);
  expect(callsBeforeManualCrop.some((call) => (
    call.type === 'function' && call.name === 'scan-receipt'
  ))).toBe(false);

  await page.locator('#analyze-receipt-crop-btn').click();
  await expect(page.locator('#receipt-review-step')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#receipt-processing-badge')).toContainText('선택 영역 보정');

  const calls = await page.evaluate(() => window.__SUPABASE_CALLS__);
  expect(calls.some((call) => (
    call.type === 'function'
    && call.name === 'scan-receipt'
    && call.body.imageProcessing?.manuallyCropped === true
  ))).toBe(true);
});

test('공유 모달은 정산 요약을 보여주고 방 정보가 포함된 초대문구를 복사한다', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__COPIED_INVITE__ = text;
        }
      }
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (payload) => {
        window.__SHARED_INVITE__ = payload;
      }
    });
  });
  await page.locator('#open-share-modal-btn').evaluate((button) => {
    button.classList.remove('hidden');
    button.click();
  });

  await expect(page.locator('#share-modal')).toBeVisible();
  await expect(page.locator('#share-room-title')).toHaveText('자동 테스트 여행 정산 내역');
  await expect(page.locator('#share-room-meta')).toHaveText('47,000 KRW · 2명 · 3건');

  await page.locator('#copy-share-link-btn').click();
  const copiedInvite = await page.evaluate(() => window.__COPIED_INVITE__);
  expect(copiedInvite).toContain('자동 테스트 여행 정산 내역');
  expect(copiedInvite).toContain('총 지출 47,000 KRW');
  expect(copiedInvite).toContain('읽기 전용');
  expect(copiedInvite).toContain('index.html?code=TEST01');

  await page.locator('#share-native-btn').click();
  const sharedInvite = await page.evaluate(() => window.__SHARED_INVITE__);
  expect(sharedInvite.title).toBe('자동 테스트 여행 정산 내역');
  expect(sharedInvite.text).toContain('총 지출 47,000 KRW');
  expect(sharedInvite.url).toContain('index.html?code=TEST01');
});

test('배경이 포함된 영수증 사진은 자동으로 모서리를 찾아 원근 보정한다', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 1800;
    const context = canvas.getContext('2d');
    context.fillStyle = '#263449';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#f8f5e9';
    context.beginPath();
    context.moveTo(310, 120);
    context.lineTo(940, 210);
    context.lineTo(850, 1660);
    context.lineTo(220, 1550);
    context.closePath();
    context.fill();
    context.save();
    context.translate(360, 280);
    context.rotate(0.055);
    context.fillStyle = '#172033';
    context.font = 'bold 42px sans-serif';
    context.fillText('TOKYO RECEIPT', 0, 0);
    context.font = '30px sans-serif';
    for (let line = 1; line <= 18; line += 1) {
      context.fillText(`ITEM ${line}                 ${line * 310}`, 0, line * 58);
    }
    context.font = 'bold 52px sans-serif';
    context.fillText('TOTAL 12,480', 0, 1180);
    context.restore();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    const file = new File([blob], 'synthetic-receipt.jpg', { type: 'image/jpeg' });
    const prepared = await window.SettleUpReceiptImage.prepare(file);
    return {
      autoCropped: prepared.autoCropped,
      width: prepared.width,
      height: prepared.height,
      bytes: prepared.blob.size
    };
  });

  expect(result.autoCropped).toBe(true);
  expect(result.width).toBeLessThan(result.height);
  expect(result.width).toBeLessThanOrEqual(1800);
  expect(result.height).toBeLessThanOrEqual(1800);
  expect(result.bytes).toBeLessThanOrEqual(2.5 * 1024 * 1024);
});

test('모바일 입력 확대를 막고 직접 분담 안내가 다크 테마를 따른다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#expense-form-card').evaluate((card) => card.classList.remove('hidden'));
  await page.locator('#expense-form-card input, #expense-form-card select').evaluateAll((controls) => {
    controls.forEach((control) => {
      control.disabled = false;
    });
  });

  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
  );

  await page.locator('#split-method').selectOption('amount');
  const addManualSplitHelper = page.locator('#split-amount-inputs .manual-split-helper');
  await expect(addManualSplitHelper).toBeVisible();
  const mobileControlFontSizes = await page.evaluate(() => ({
    search: getComputedStyle(document.querySelector('#settlement-search-input')).fontSize,
    splitAmount: getComputedStyle(document.querySelector('.dynamic-split-item input')).fontSize
  }));
  expect(mobileControlFontSizes).toEqual({ search: '16px', splitAmount: '16px' });

  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  const helperColors = await addManualSplitHelper.evaluate((helper) => ({
    background: getComputedStyle(helper).backgroundColor,
    color: getComputedStyle(helper).color
  }));
  expect(helperColors.background).not.toBe('rgb(238, 242, 255)');
  expect(helperColors.color).toBe('rgb(229, 231, 235)');
});
