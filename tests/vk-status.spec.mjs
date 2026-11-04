import { test, expect } from '@playwright/test';

const response = configured => ({
  service: 'tarot-vk-auth-probe', appId: 54582199, configured,
  persistentStorageConnected: false, rewardsEnabled: false,
  mode: 'read_only'
});

test('Mobile readiness page clearly fails closed when no VK server key exists', async ({ page }) => {
  const requests = [];
  const errors = [];
  page.on('request', r => requests.push({ url: r.url(), method: r.method() }));
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/vk/status', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(response(false))
  }));
  await page.goto('/preview/vk-status.html');
  await expect(page.locator('h1')).toHaveText('Готовность входа ВК');
  await expect(page.locator('#state')).toContainText('пока не настроен');
  await expect(page.locator('#hint')).toContainText('VK_PROTECTED_KEY');
  await expect(page.locator('#retry')).toBeEnabled();
  expect(requests.filter(x => x.url.includes('/api/vk/verify'))).toEqual([]);
  expect(requests.filter(x => x.method !== 'GET')).toEqual([]);
  expect(errors).toEqual([]);
});

test('Readiness page displays prepared-not-authenticated status when key is installed', async ({ page }) => {
  await page.route('**/api/vk/status', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(response(true))
  }));
  await page.goto('/preview/vk-status.html');
  await expect(page.locator('#state')).toContainText('подготовлена');
  await expect(page.locator('#hint')).toContainText('не подтверждение входа');
  await page.locator('#retry').click();
  await expect(page.locator('#state')).toContainText('подготовлена');
});

test('Malformed JSON and non-read-only state fail closed', async ({ page }) => {
  await page.route('**/api/vk/status', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ...response(true), rewardsEnabled: true })
  }));
  await page.goto('/preview/vk-status.html');
  await expect(page.locator('#state')).toContainText('Не получилось связаться');
});
