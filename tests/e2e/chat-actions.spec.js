const { test, expect } = require('@playwright/test');
const { installChatMocks } = require('./helpers/app-mocks');

async function sendMessage(page, content) {
  await page.locator('#chat-input').fill(content);
  await page.locator('#send-chat-btn').click();

  const message = page.locator('.chat-msg-wrapper.mine').filter({ hasText: content }).last();
  await expect(message).toBeVisible();
  await expect(message).toHaveAttribute(
    'data-id',
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/
  );
  const messageId = await message.getAttribute('data-id');
  const persistedMessage = page.locator(`.chat-msg-wrapper[data-id="${messageId}"]`);
  await expect(persistedMessage.locator('.msg-options-btn')).toBeVisible();
  await expect(persistedMessage).toHaveCount(1);
  return persistedMessage;
}

test.beforeEach(async ({ page }) => {
  await installChatMocks(page);
  await page.goto('/chat.html?id=99001');
  await expect(page.locator('#chat-input')).toBeVisible();
});

test('새 메시지는 재입장 없이 즉시 수정하고 삭제할 수 있다', async ({ page }) => {
  const editableMessage = await sendMessage(page, '바로 수정할 메시지');
  await editableMessage.locator('.msg-options-btn').click();
  await editableMessage.locator('.edit-msg-btn').click();
  await page.locator('#edit-modal-textarea').fill('수정 완료');
  await page.locator('#submit-edit-modal-btn').click();

  await expect(editableMessage.locator('.chat-bubble')).toContainText('수정 완료');
  await expect(editableMessage.locator('.chat-bubble')).toContainText('(수정됨)');

  const deletableMessage = await sendMessage(page, '바로 삭제할 메시지');
  await deletableMessage.locator('.msg-options-btn').click();
  await deletableMessage.locator('.delete-msg-btn').click();
  await page.locator('#submit-delete-modal-btn').click();

  await expect(deletableMessage.locator('.chat-bubble')).toContainText('삭제된 메시지');

  const updates = await page.evaluate(() =>
    window.__CHAT_MUTATIONS__.filter((item) => item.operation === 'update')
  );
  expect(updates).toHaveLength(2);
  expect(updates.every((item) => !String(item.filters.id).startsWith('temp-'))).toBe(true);
  expect(updates[0].values).toMatchObject({ content: '수정 완료', is_edited: true });
  expect(updates[1].values).toMatchObject({ is_deleted: true });
});

test('새 메시지는 재입장 없이 강제숨김할 수 있고 확인 문구가 정상 표시된다', async ({ page }) => {
  const message = await sendMessage(page, '바로 숨길 메시지');
  const messageId = await message.getAttribute('data-id');

  await message.locator('.msg-options-btn').click();
  await message.locator('.admin-hide-msg-btn').click();

  await expect(page.locator('#admin-confirm-msg-desc')).toHaveText(
    '이 메시지를 화면에서 완전히 삭제하시겠습니까?'
  );
  await expect(page.locator('#admin-confirm-msg-note')).toHaveText(
    '(데이터베이스에는 기록이 보존됩니다.)'
  );
  await expect(page.locator('#admin-confirm-msg-desc')).not.toContainText('<br>');

  await page.locator('#submit-admin-confirm-btn').click();
  await expect(page.locator(`.chat-msg-wrapper[data-id="${messageId}"]`)).toHaveCount(0);

  const hideUpdate = await page.evaluate(() =>
    window.__CHAT_MUTATIONS__.find((item) => item.values?.is_hidden_admin === true)
  );
  expect(hideUpdate.filters.id).toBe(messageId);
  expect(hideUpdate.filters.id.startsWith('temp-')).toBe(false);
});
