import { test, expect } from '@playwright/test';
import { createHmac, randomInt } from 'node:crypto';

const APP_ID = '54582199';
// Test-only fixture. It is NOT the secure key of any real VK application.
const TEST_KEY = 'TARO_E2E_FIXTURE_ONLY_NEVER_PRODUCTION';
const TEST_PIN = '0123456789abcdef0123456789abcdef';
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
  // The real, byte-verified public-domain scans are published separately on
  // GitHub Pages. An offline-capable image fixture keeps mobile CI deterministic;
  // the path and 22-card ID mapping are asserted below.
  await page.route('https://masksimus.github.io/CartTaro/art-preview/classic/**', route =>
    route.fulfill({status:200,contentType:'image/svg+xml',
      body:'<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1200"><rect width="720" height="1200" fill="#e8d7bd"/><circle cx="360" cy="440" r="220" fill="#b18563"/></svg>'
    }));
  await page.route('**/api/v2/**', async route => {
    const upstreamUrl = new URL(route.request().url());
    const authorization = route.request().headers()['authorization'];
    const testPin = route.request().headers()['x-taro-test-pin'];
    // Playwright routes the request to a REAL running local API, not a mock.
    const result = await request.fetch(backend + upstreamUrl.pathname, {
      method: route.request().method(),
      headers: { Authorization: authorization || '', ...(testPin ? { 'X-Taro-Test-Pin':testPin }: {}) },
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
  await expect(page.locator('#status')).toContainText('Вход подтверждён');
  await expect(page.locator('#pilotAccess')).toBeVisible();
  await expect(page.locator('#claimButton')).toBeDisabled();
  await expect(page.locator('#drawButton')).toBeDisabled();
  await page.locator('#pilotPin').fill(TEST_PIN);
  await page.locator('#pilotUnlockButton').click();
  await expect(page.locator('#status')).toContainText('Тестовый доступ подтверждён');
  await expect(page.locator('#pilotAccess')).toBeHidden();
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
  await expect(page.locator('#collection .arcana.open img')).toHaveCount(1);
  // Read-only UAT verification must not write another claim or draw.
  const writeCount = calls.filter(call => /\\/api\\/v2\\/daily\\/(?:claim|draw)$/.test(call.path)).length;
  await expect(page.locator('#verifyPersistenceButton')).toBeEnabled();
  await page.locator('#verifyPersistenceButton').click();
  await expect(page.locator('#persistenceStatus')).toContainText('Сохранение подтверждено сервером');
  expect(calls.filter(call => /\\/api\\/v2\\/daily\\/(?:claim|draw)$/.test(call.path))).toHaveLength(writeCount);
  await expect(page.locator('#dailyCardDisplay')).toBeVisible();
  await expect(page.locator('#dailyCardDisplay img')).toHaveCount(1);
  const mainPainting = await page.locator('#dailyCardDisplay img').getAttribute('src');
  expect(mainPainting).toContain('https://masksimus.github.io/CartTaro/art-preview/classic/');
  expect(mainPainting).toMatch(/\/\d\d_[A-Za-z_]+\.jpg$/);
  expect(await page.locator('#dailyCardDisplay img').getAttribute('referrerpolicy')).toBe('no-referrer');
  await expect(page.locator('#dailyCardDisplay img')).toHaveJSProperty('naturalWidth',720);
  await expect(page.locator('#collection .arcana:not(.open) img')).toHaveCount(0);

  await expect(page.locator('#achievements .achievement.done')).toHaveCount(1);
  await expect(page.locator('#missions .mission.done')).toHaveCount(2);

  const state = await request.get(backend + '/api/v2/progress', {
    headers: { Authorization: 'Bearer ' + token }
  });
  expect(state.status()).toBe(200);
  const json = await state.json();
  expect(json.crystals).toBe(10);
  expect(json.arcana).toHaveLength(1);
  expect(json.dailyCardId).toBe(json.arcana[0]);
  expect(mainPainting).toContain((await page.locator('#collection .arcana.open img').getAttribute('src')).split('/').at(-1));
  expect(json.claimedToday).toBe(true);
  const repeat = await request.post(backend + '/api/v2/daily/claim', {
    headers: { Authorization: 'Bearer ' + token, 'X-Taro-Test-Pin': TEST_PIN }
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
  await visit(page,launch(userId));
  await expect(page.locator('#crystals')).toHaveText('10');
  await expect(page.locator('#unlocked')).toHaveText('1/22');
  await expect(page.locator('#dailyCardDisplay img')).toHaveAttribute('src',mainPainting);
  await page.locator('#verifyPersistenceButton').click();
  await expect(page.locator('#persistenceStatus')).toContainText('Сохранение подтверждено сервером');
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


test('V2 database read-only mode renders real progress but keeps both reward actions disabled', async ({ page, request }) => {
  const userId = freshUserId();
  const calls = await prepare(page, request);
  await page.route('**/api/v2/status', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      service: 'tarot-v2-postgres',
      appId: 54582199,
      storageConfigured: true,
      rewardsEnabled: false,
      mode: 'read_only'
    })
  }));
  await visit(page, launch(userId));
  await expect(page.locator('#bridgeStatus')).toContainText('подключён');
  await expect(page.locator('#authStatus')).toContainText('подпись проверена');
  await expect(page.locator('#status')).toContainText('только для чтения');
  await expect(page.locator('#claimButton')).toBeDisabled();
  await expect(page.locator('#drawButton')).toBeDisabled();
  await expect(page.locator('#crystals')).toHaveText('0');
  await expect(page.locator('#unlocked')).toHaveText('0/22');
  expect(calls.filter(x => x.path.includes('/daily/'))).toHaveLength(0);
  const progress = await request.get(backend + '/api/v2/progress', {
    headers: { Authorization: 'Bearer ' + launch(userId) }
  });
  expect(progress.status()).toBe(200);
  expect((await progress.json()).crystals).toBe(0);
});


test('Neon unavailable produces visible message and disables both actions, not a forever-spinner', async ({ page, request }) => {
  const userId=freshUserId();
  await prepare(page,request);
  await page.route('**/api/v2/progress',route=>route.fulfill({
    status:503,contentType:'application/json',body:'{"error":"storage_unavailable"}'
  }));
  await visit(page, launch(userId));
  await expect(page.locator('#bridgeStatus')).toContainText('подключён');
  await expect(page.locator('#status')).toContainText('Тестовая база данных не подключена или временно недоступна');
  await expect(page.locator('#claimButton')).toBeDisabled();
  await expect(page.locator('#drawButton')).toBeDisabled();
  expect(new URL(page.url()).search).toBe('');
});

test('expired signed parameters show a recoverable sign-in failure, without user state mutation', async ({ page, request }) => {
  await prepare(page,request);
  await page.route('**/api/v2/progress',route=>route.fulfill({
    status:401,contentType:'application/json',body:'{"error":"unauthorized"}'
  }));
  await visit(page,launch(freshUserId()));
  await expect(page.locator('#status')).toContainText('Сессия ВК не подтверждена или истекла');
  await expect(page.locator('#claimButton')).toBeDisabled();
  await expect(page.locator('#drawButton')).toBeDisabled();
});


test('wrong tester PIN cannot enable rewards or add DB progress, correct PIN can', async ({page,request}) => {
  const id=freshUserId();
  const token=launch(id);
  const calls=await prepare(page,request);
  await visit(page,token);
  await expect(page.locator('#pilotAccess')).toBeVisible();
  await page.locator('#pilotPin').fill('f'.repeat(32));
  await page.locator('#pilotUnlockButton').click();
  await expect(page.locator('#status')).toContainText('Код тестировщика не принят');
  await expect(page.locator('#claimButton')).toBeDisabled();
  await expect(page.locator('#drawButton')).toBeDisabled();
  await expect(page.locator('#pilotAccess')).toBeVisible();
  expect(calls.some(x=>x.path.endsWith('/daily/claim') && x.status===200)).toBe(false);
  const state=await request.get(backend+'/api/v2/progress',{
    headers:{ Authorization:'Bearer '+token }
  });
  expect((await state.json()).crystals).toBe(0);
  await page.locator('#pilotPin').fill(TEST_PIN);
  await page.locator('#pilotUnlockButton').click();
  await expect(page.locator('#claimButton')).toBeEnabled();
  await expect(page.locator('#drawButton')).toBeEnabled();
  await page.reload();
  await expect(page.locator('#claimButton')).toBeDisabled();
});

test('developer PIN missing in server config prevents reward control display', async ({page,request}) => {
  await prepare(page,request);
  await page.route('**/api/v2/status',route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({
      service:'tarot-v2-postgres',appId:54582199,
      storageConfigured:true,rewardsEnabled:false,mode:'read_only'
    })
  }));
  await visit(page,launch(freshUserId()));
  await expect(page.locator('#status')).toContainText('только для чтения');
  await expect(page.locator('#pilotAccess')).toBeHidden();
  await expect(page.locator('#claimButton')).toBeDisabled();
});


test('transient PostgreSQL unavailability shows retry and recovers without another VK launch', async ({ page, request }) => {
  const id=freshUserId();
  await prepare(page,request);
  let requests=0;
  await page.route('**/api/v2/progress', async route => {
    requests++;
    if(requests <= 2) {
      return route.fulfill({status:503,contentType:'application/json',
        body:'{"error":"storage_unavailable"}'});
    }
    await route.fallback();
  });
  await visit(page,launch(id));
  await expect(page.locator('#retryProgressButton')).toBeVisible();
  await expect(page.locator('#status')).toContainText('Повторить соединение');
  await expect(page.locator('#claimButton')).toBeDisabled();
  await expect(page.locator('#drawButton')).toBeDisabled();
  expect(requests).toBe(2);
  await page.locator('#retryProgressButton').click();
  await expect(page.locator('#authStatus')).toContainText('подпись проверена');
  await expect(page.locator('#retryProgressButton')).toBeHidden();
  await expect(page.locator('#pilotAccess')).toBeVisible();
  await expect(page.locator('#claimButton')).toBeDisabled();
  expect(requests).toBe(3);
  expect(new URL(page.url()).search).toBe('');
});


test('READ-ONLY one card: real signed VK server, flip animation and interpretation without crystals',async({page,request},info)=>{
  const id=freshUserId();
  const token=launch(id);
  const calls=await prepare(page,request);
  await visit(page,token);
  await expect(page.locator('#spreadOneButton')).toBeEnabled();
  await page.locator('#spreadOneButton').click();
  await expect(page.locator('#readingDeck .reading-card')).toHaveCount(1);
  await expect(page.locator('#readingDeck .reading-card-front img')).toHaveCount(1);
  expect(await page.locator('#readingDeck .reading-card-front img').getAttribute('src'))
    .toMatch(/masksimus\.github\.io\/CartTaro\/art-preview\/classic\/\d\d_.*\.jpg$/);

  await expect(page.locator('#readingStatus')).toContainText('Нажмите на рубашку');
  await expect(page.locator('#readingInterpretations article')).toHaveCount(0);
  await page.locator('#readingDeck .reading-card').click();
  await expect(page.locator('#readingDeck .reading-card.revealed')).toHaveCount(1);
  await expect(page.locator('#readingInterpretations article')).toHaveCount(1);
  await expect(page.locator('#readingInterpretations .reading-summary')).toHaveCount(1);
  await expect(page.locator('#readingDeck .reading-card')).toBeDisabled();
  await expect(page.locator('#crystals')).toHaveText('0');
  await expect(page.locator('#unlocked')).toHaveText('0/22');
  expect(calls.filter(c=>c.path.includes('/daily/'))).toHaveLength(0);
  const state=await request.get(backend+'/api/v2/progress',{headers:{Authorization:'Bearer '+token}});
  expect(state.status()).toBe(200);
  expect((await state.json()).crystals).toBe(0);
  const width=await page.evaluate(()=>document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize().width+2);
  expect(new URL(page.url()).search).toBe('');
  await info.attach('One-card spread after reveal',{
    body:await page.screenshot({fullPage:true,animations:'disabled'}),contentType:'image/png'
  });
});

test('READ-ONLY three cards: distinct randomized arcana, three semantic positions, keyboard-accessible flip',async({page,request})=>{
  await prepare(page,request);
  await visit(page,launch(freshUserId()));
  await page.locator('#spreadThreeButton').click();
  const cards=page.locator('#readingDeck .reading-card');
  await expect(cards).toHaveCount(3);
  await expect(page.locator('#readingDeck .reading-card-front img')).toHaveCount(3);
  const illustrationURLs = await page.locator('#readingDeck .reading-card-front img').evaluateAll(imgs=>imgs.map(img=>img.src));
  expect(new Set(illustrationURLs).size).toBe(3);
  expect(illustrationURLs.every(url=>url.startsWith('https://masksimus.github.io/CartTaro/art-preview/classic/'))).toBe(true);

  await expect(page.locator('#readingDeck .reading-position')).toHaveText([
    'Что было','Что происходит','Куда направить внимание'
  ]);
  expect(await cards.evaluateAll(nodes=>nodes.every(n=>n.getAttribute('aria-label').startsWith('Перевернуть')))).toBe(true);
  await cards.nth(0).focus();
  await page.keyboard.press('Enter');
  await expect(cards.nth(0)).toHaveClass(/revealed/);
  await cards.nth(1).click();
  await cards.nth(2).click();
  await expect(page.locator('#readingInterpretations article')).toHaveCount(3);
  await expect(page.locator('#readingInterpretations .reading-summary')).toHaveCount(1);
  await expect(page.locator('#readingStatus')).toContainText('Расклад открыт');
  await expect(page.locator('#claimButton')).toBeDisabled(); // PIN gate remains unaffected by free readings
  const width=await page.evaluate(()=>document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize().width+2);
});

test('spread API 503 shows a visible recoverable error without enabling reward buttons',async({page,request})=>{
  await prepare(page,request);
  await page.route('**/api/v2/spreads/three',route=>route.fulfill({
    status:503,contentType:'application/json',body:'{"error":"spread_unavailable"}'
  }));
  await visit(page,launch(freshUserId()));
  await page.locator('#spreadThreeButton').click();
  await expect(page.locator('#readingStatus')).toContainText('временно не отвечает');
  await expect(page.locator('#readingDeck .reading-card')).toHaveCount(0);
  await expect(page.locator('#spreadThreeButton')).toBeEnabled();
  await expect(page.locator('#claimButton')).toBeDisabled();
  await expect(page.locator('#drawButton')).toBeDisabled();
});

test('unverified VK launch has neither playable spreads nor rewards',async({page,request})=>{
  const calls=await prepare(page,request,{bridgeId:'123'});
  await visit(page,launch(freshUserId()));
  await expect(page.locator('#spreadOneButton')).toBeDisabled();
  await expect(page.locator('#spreadThreeButton')).toBeDisabled();
  expect(calls).toHaveLength(0);
});

test('read-only server verification fails visibly but preserves previously loaded data', async ({ page, request }) => {
  await prepare(page, request);
  await visit(page, launch(freshUserId()));
  await expect(page.locator('#verifyPersistenceButton')).toBeEnabled();
  await expect(page.locator('#crystals')).toHaveText('0');
  await page.route('**/api/v2/progress', route => route.fulfill({
    status: 503, contentType: 'application/json',
    body: '{"error":"storage_unavailable"}'
  }));
  await page.locator('#verifyPersistenceButton').click();
  await expect(page.locator('#persistenceStatus')).toContainText('Не удалось проверить сохранение');
  await expect(page.locator('#crystals')).toHaveText('0');
  await expect(page.locator('#verifyPersistenceButton')).toBeEnabled();
  await expect(page.locator('#claimButton')).toBeDisabled();
});
