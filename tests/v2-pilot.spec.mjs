import { test, expect } from '@playwright/test';
import { createHmac, randomInt } from 'node:crypto';

const APP_ID = '54582199';
// Test-only fixture. It is NOT the secure key of any real VK application.
const TEST_KEY = 'TARO_E2E_FIXTURE_ONLY_NEVER_PRODUCTION';
const backend = 'http://127.0.0.1:8788';

function launch(userId) {
  const p = new URLSearchParams({
    vk_app_id: APP_ID,
    vk_user_id: String(userId),
    vk_platform: 'mobile_web',
    vk_ts: String(Math.floor(Date.now() / 1000))
  });
  const sorted = [...p.entries()].sort(([a], [b]) => a.localeCompare(b));
  const sign = createHmac('sha256', TEST_KEY).update(
    new URLSearchParams(sorted).toString()
  ).digest('base64url');
  p.set('sign', sign);
  return p.toString();
}

function freshUserId() {
  return String(randomInt(100000, 900000000));
}

async function prepare(page, request, { bridgeId = 'launch', sdk = 'ok' } = {}) {
  const proxied = [];
  await page.route('https://unpkg.com/**', async route => {
    if (sdk === 'fail') return route.abort();
    const script = bridgeId === 'launch'
      ? `const __signedUser = Number(new URLSearchParams(location.search).get('vk_user_id'));
        window.vkBridge = { send: async function(method) {
          if (method === 'VKWebAppInit') return {};
          if (method === 'VKWebAppGetUserInfo') return {
            id: __signedUser, first_name: 'Тест'
          };
          throw Error('Unsupported bridge method');
        } };`
      : `window.vkBridge = {send: async function(method) {
          if (method === 'VKWebAppInit') return {};
          if (method === 'VKWebAppGetUserInfo') return {id: ${JSON.stringify(Number(bridgeId))}};
          throw Error('Unsupported bridge method');
        }};`;
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: script });
  });
  await page.route('**/api/v2/**', async route => {
    const upstreamUrl = new URL(route.request().url());
    const authorization = route.request().headers()['authorization'];
    // Playwright routes the request to a REAL running local API, not a mock.
    const result = await request.fetch(backend + upstreamUrl.pathname, {
      method: route.request().method(),
      headers: { Authorization: authorization || '' },
      failOnStatusCode: false
    });
    proxied.push({ path: upstreamUrl.pathname, status: result.status() });
    await route.fulfill({ status: result.status(), contentType: 'application/json', body: await result.text() });
  });
  return proxied;
}

async function visit(page, token) {
  await page.goto('/preview/v2-pilot.html' + (token ? '?' + token : ''), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#status')).not.toHaveText('Проверяем параметры запуска…', { timeout: 12000 });
}

test('REAL POSTGRES local API: verified VK launch, single reward, server daily card, collection and reload denial', async ({ page, request }, info) => {
  const userId = freshUserId();
  const token = launch(userId);
  const calls = await prepare(page, request);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await visit(page, token);

  await expect(page.locator('#bridgeStatus')).toContainText('подключён');
  await expect(page.locator('#authStatus')).toContainText('подпись проверена');
  await expect(page.locator('#status')).toContainText('успешна');
  await expect(page.locator('#claimButton')).toBeEnabled();
  await expect(page.locator('#drawButton')).toBeEnabled();
  await expect(page.locator('#collection .arcana')).toHaveCount(22);
  expect(new URL(page.url()).search).toBe('');

  await page.locator('#claimButton').click();
  await expect(page.locator('#crystals')).toHaveText('10');
  await expect(page.locator('#streak')).toHaveText('1');
  await expect(page.locator('#claimButton')).toBeDisabled();
  await page.locator('#drawButton').click();
  await expect(page.locator('#drawResult')).toContainText('карта сохранена');
  await expect(page.locator('#unlocked')).toHaveText('1/22');
  await expect(page.locator('#drawButton')).toBeDisabled();
  await expect(page.locator('#collection .arcana.open')).toHaveCount(1);
  await expect(page.locator('#achievements .achievement.done')).toHaveCount(1);
  await expect(page.locator('#missions .mission.done')).toHaveCount(2);

  const state = await request.get(backend + '/api/v2/progress', {
    headers: { Authorization: 'Bearer ' + token }
  });
  expect(state.status()).toBe(200);
  const json = await state.json();
  expect(json.crystals).toBe(10);
  expect(json.arcana).toHaveLength(1);
  expect(json.claimedToday).toBe(true);
  const repeat = await request.post(backend + '/api/v2/daily/claim', {
    headers: { Authorization: 'Bearer ' + token }
  });
  expect((await repeat.json()).granted).toBe(false);

  const shot = info.outputPath('pilot-verified.png');
  await page.screenshot({ path: shot, animations: 'disabled', fullPage: true });
  await info.attach('Pilot verified', { path: shot, contentType: 'image/png' });
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize().width + 2);
  expect(calls.some(x => x.path === '/api/v2/daily/claim' && x.status === 200)).toBe(true);
  expect(errors).toEqual([]);

  // After removing signed parameters, a raw refresh cannot silently log in.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#claimButton')).toBeDisabled();
  await expect(page.locator('#drawButton')).toBeDisabled();
});

test('forged signed user is refused by server even when mocked VK Bridge claims same user', async ({ page, request }) => {
  const token = new URLSearchParams(launch(freshUserId()));
  token.set('vk_user_id', '999999001');
  const calls = await prepare(page, request);
  await visit(page, token.toString());
  await expect(page.locator('#authStatus')).toContainText('не подтверждён');
  await expect(page.locator('#claimButton')).toBeDisabled();
  await expect(page.locator('#drawButton')).toBeDisabled();
  expect(calls.some(x => x.status === 401)).toBe(true);
});

test('Bridge user mismatch refuses API without sending any server request', async ({ page, request }) => {
  const calls = await prepare(page, request, { bridgeId: '33' });
  await visit(page, launch(freshUserId()));
  await expect(page.locator('#bridgeStatus')).toContainText('ошибка');
  await expect(page.locator('#claimButton')).toBeDisabled();
  expect(calls).toHaveLength(0);
});

test('no VK launch parameters and failed bridge both fail closed without changing data', async ({ page, request }) => {
  const calls = await prepare(page, request, { sdk: 'fail' });
  await visit(page, '');
  await expect(page.locator('#claimButton')).toBeDisabled();
  await expect(page.locator('#drawButton')).toBeDisabled();
  expect(calls).toHaveLength(0);
  await visit(page, launch(freshUserId()));
  await expect(page.locator('#bridgeStatus')).toContainText('недоступен');
  await expect(page.locator('#claimButton')).toBeDisabled();
  expect(calls).toHaveLength(0);
});

test('expired signed launch is rejected by server, never falls back to local balance', async ({ page, request }) => {
  const token = new URLSearchParams(launch(freshUserId()));
  token.set('vk_ts', String(Math.floor(Date.now() / 1000) - 3600));
  const sorted = [...token.entries()].filter(([k])=>k.startsWith('vk_')).sort(([a],[b])=>a.localeCompare(b));
  token.set('sign', createHmac('sha256', TEST_KEY).update(new URLSearchParams(sorted).toString()).digest('base64url'));
  const calls = await prepare(page, request);
  await visit(page, token.toString());
  await expect(page.locator('#authStatus')).toContainText('не подтверждён');
  await expect(page.locator('#claimButton')).toBeDisabled();
  expect(calls.some(x => x.status === 401)).toBe(true);
});
