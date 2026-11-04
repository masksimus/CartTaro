import { test, expect } from '@playwright/test';

const APP_ID = '54582199';
const signed = (userId = '12345') => new URLSearchParams({
  vk_app_id: APP_ID,
  vk_user_id: userId,
  vk_ts: String(Math.floor(Date.now() / 1000)),
  vk_platform: 'mobile_web',
  sign: 'X'.repeat(43)
}).toString();
const site = '/preview/vk-login.html';

async function stubBridge(page, userId = 12345) {
  await page.route('https://unpkg.com/**', route => route.fulfill({
    status: 200, contentType: 'application/javascript; charset=utf-8', body: ''
  }));
  await page.addInitScript(id => {
    window.__bridgeCalls = [];
    window.vkBridge = {
      send: async method => {
        window.__bridgeCalls.push(method);
        if (method === 'VKWebAppInit') return {};
        if (method === 'VKWebAppGetUserInfo') return { id };
        throw Error('not_allowed');
      }
    };
  }, userId);
}

test('real VK-like launch -> VK Bridge identity -> same-origin read-only HMAC API', async ({ page }) => {
  await stubBridge(page);
  const calls = [];
  await page.route('**/api/vk/verify', route => {
    calls.push({
      url: route.request().url(),
      method: route.request().method(),
      authorization: route.request().headers()['authorization'],
      body: route.request().postData()
    });
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ verified: true, appId: 54582199 })
    });
  });
  await page.goto(site + '?' + signed());
  await expect(page.locator('#state')).toContainText('Успех');
  await expect(page.locator('#bridge')).toContainText('подтверждён');
  await expect(page.locator('#signature')).toContainText('действительна');
  expect(new URL(page.url()).search).toBe('');
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe('http://127.0.0.1:8765/api/vk/verify');
  expect(calls[0].method).toBe('POST');
  expect(calls[0].body).toBeNull();
  expect(calls[0].authorization).toMatch(/^Bearer vk_app_id=54582199&vk_user_id=12345/);
  expect(await page.evaluate(() => window.__bridgeCalls))
    .toEqual(['VKWebAppInit', 'VKWebAppGetUserInfo']);
  expect(await page.locator('body').textContent()).not.toContain('12345');
  expect(await page.locator('body').textContent()).not.toContain('X'.repeat(43));
});

test('launch outside VK (no signed URL) fails closed without API or user requests', async ({ page }) => {
  await stubBridge(page);
  const calls = [];
  page.on('request', r => { if (r.url().includes('/api/vk/')) calls.push(r.url()); });
  await page.goto(site);
  await expect(page.locator('#state')).toContainText('из настроек разработчика');
  expect(calls).toEqual([]);
  expect(await page.evaluate(() => window.__bridgeCalls)).toEqual([]);
});

test('bridge identity mismatch fails closed before HTTP call', async ({ page }) => {
  await stubBridge(page, 77777);
  const calls = [];
  page.on('request', r => { if (r.url().includes('/api/vk/')) calls.push(r.url()); });
  await page.goto(site + '?' + signed());
  await expect(page.locator('#state')).toContainText('Не совпадает пользователь');
  expect(calls).toEqual([]);
});

test('forged/expired signature fails closed with 401', async ({ page }) => {
  await stubBridge(page);
  let requests = 0;
  await page.route('**/api/vk/verify', route => {
    requests += 1;
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"unauthorized"}' });
  });
  await page.goto(site + '?' + signed());
  await expect(page.locator('#state')).toContainText('Подпись запуска неверна или истекла');
  expect(requests).toBe(1);
  await expect(page.locator('#signature')).toContainText('не подтверждена');
});

test('server missing preview key fails closed with 503', async ({ page }) => {
  await stubBridge(page);
  await page.route('**/api/vk/verify', route => route.fulfill({
    status: 503, contentType: 'application/json', body: '{"error":"auth_not_configured"}'
  }));
  await page.goto(site + '?' + signed());
  await expect(page.locator('#state')).toContainText('не получил защищённый ключ Preview');
});

test('duplicate signed params fail closed before HTTP call', async ({ page }) => {
  await stubBridge(page);
  let requests = 0;
  page.on('request', r => { if (r.url().includes('/api/vk/')) requests += 1; });
  await page.goto(site + '?' + signed() + '&vk_user_id=12345');
  await expect(page.locator('#state')).toContainText('из настроек разработчика');
  expect(requests).toBe(0);
  expect(new URL(page.url()).search).toBe('');
});

test('malformed server success response fails closed', async ({ page }) => {
  await stubBridge(page);
  await page.route('**/api/vk/verify', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: '{"verified":true,"appId":54582199,"userId":"12345"}'
  }));
  await page.goto(site + '?' + signed());
  await expect(page.locator('#state')).toContainText('Не удалось проверить запуск');
  await expect(page.locator('#signature')).toContainText('не подтверждена');
});
