import { test, expect } from '@playwright/test';
import { createHmac, randomInt } from 'node:crypto';

const BACKEND = 'http://127.0.0.1:8788';
const SECRET = 'TARO_E2E_FIXTURE_ONLY_NEVER_PRODUCTION';

function signedLaunch(userId) {
  const data = new URLSearchParams({
    vk_app_id:'54582199', vk_user_id:String(userId),
    vk_platform:'mobile_web',vk_ts:String(Math.floor(Date.now()/1000))
  });
  const sorted = [...data.entries()].sort(([a],[b]) => a.localeCompare(b));
  const signature = createHmac('sha256',SECRET)
    .update(new URLSearchParams(sorted).toString()).digest('base64url');
  data.set('sign',signature);
  return data.toString();
}
const newUser = () => String(randomInt(100000,900000000));

async function prepare(page,request) {
  const calls = [];
  await page.route('https://unpkg.com/**',route=>route.fulfill({
    status:200,contentType:'application/javascript',
    body:"const sid = Number(new URLSearchParams(location.search).get('vk_user_id')); window.vkBridge = {send: async function(m) {if(m==='VKWebAppInit')return {};if(m==='VKWebAppGetUserInfo')return {id:sid};throw Error('method');}};"
  }));
  await page.route('https://masksimus.github.io/CartTaro/art-preview/classic/**',route=>
    route.fulfill({status:200,contentType:'image/svg+xml',
      body:'<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1200"><rect width="720" height="1200"/></svg>'
    }));
  await page.route('**/api/v2/**',async route=>{
    const original = route.request();
    const pathname = new URL(original.url()).pathname;
    const headers = original.headers();
    const forwarded = await request.fetch(BACKEND+pathname,{
      method:original.method(),
      headers:{Authorization: headers.authorization||''},
      failOnStatusCode:false
    });
    calls.push({path:pathname,method:original.method(),status:forwarded.status()});
    await route.fulfill({status:forwarded.status(),contentType:'application/json',body:await forwarded.text()});
  });
  return calls;
}
async function open(page,launch) {
  await page.goto('/release/index.html'+(launch?'?'+launch:''),{waitUntil:'domcontentloaded'});
  await expect(page.locator('#status')).not.toHaveText('Проверяем параметры запуска…');
}
test('public game: real signed VK, claim and daily draw once, restore after relaunch',async({page,request})=>{
  const user = newUser(), token=signedLaunch(user),calls=await prepare(page,request);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await open(page,token);
  await expect(page.locator('#authStatus')).toContainText('подпись проверена');
  await expect(page.locator('#dailyActions')).toBeVisible();
  await expect(page.locator('#pilotPin')).toHaveCount(0);
  await expect(page.locator('#claimButton')).toBeEnabled();
  await expect(page.locator('#drawButton')).toBeEnabled();
  await page.locator('#claimButton').click();
  await expect(page.locator('#crystals')).toHaveText('10');
  await expect(page.locator('#streak')).toHaveText('1');
  await expect(page.locator('#claimButton')).toBeDisabled();
  await page.locator('#drawButton').click();
  await expect(page.locator('#unlocked')).toHaveText('1/22');
  const painting=await page.locator('#dailyCardDisplay img').getAttribute('src');
  expect(painting).toContain('masksimus.github.io/CartTaro/art-preview/classic/');
  await expect(page.locator('#drawButton')).toBeDisabled();
  const writesBefore = calls.filter(x=>x.method==='POST').length;
  await page.locator('#verifyPersistenceButton').click();
  await expect(page.locator('#persistenceStatus')).toContainText('Сохранение подтверждено сервером');
  expect(calls.filter(x=>x.method==='POST')).toHaveLength(writesBefore);
  const duplicate=await request.post(BACKEND+'/api/v2/daily/claim',{headers:{Authorization:'Bearer '+token}});
  expect(duplicate.status()).toBe(200);
  expect((await duplicate.json()).granted).toBe(false);

  await open(page,signedLaunch(user));
  await expect(page.locator('#crystals')).toHaveText('10');
  await expect(page.locator('#unlocked')).toHaveText('1/22');
  await expect(page.locator('#dailyCardDisplay img')).toHaveAttribute('src',painting);
  await expect(page.locator('#claimButton')).toBeDisabled();
  await expect(page.locator('#drawButton')).toBeDisabled();
  expect(new URL(page.url()).search).toBe('');
  expect(errors).toEqual([]);
});

test('public game: one and three card readings reveal original images and meanings',async({page,request})=>{
  await prepare(page,request);
  await open(page,signedLaunch(newUser()));
  await expect(page.locator('#spreadOneButton')).toBeEnabled();
  await page.locator('#spreadOneButton').click();
  await expect(page.locator('#readingDeck .reading-card-front img')).toHaveCount(1);
  await page.locator('#readingDeck .reading-card').click();
  await expect(page.locator('#readingInterpretations article')).toHaveCount(1);
  await page.locator('#spreadThreeButton').click();
  await expect(page.locator('#readingDeck .reading-card-front img')).toHaveCount(3);
  await page.locator('#readingDeck .reading-card').nth(0).click();
  await page.locator('#readingDeck .reading-card').nth(1).click();
  await page.locator('#readingDeck .reading-card').nth(2).click();
  await expect(page.locator('#readingInterpretations article')).toHaveCount(3);
});

test('public game: missing or forged launch cannot open user data or rewards',async({page,request})=>{
  await prepare(page,request);
  await open(page,'');
  await expect(page.locator('#authStatus')).toContainText('не подтверждён');
  await expect(page.locator('#dailyActions')).toBeHidden();

  const token = new URLSearchParams(signedLaunch(newUser()));
  token.set('vk_user_id',String(newUser()));
  await open(page,token.toString());
  await expect(page.locator('#authStatus')).toContainText('не подтверждён');
  await expect(page.locator('#dailyActions')).toBeHidden();

  const unsigned = await request.get(BACKEND+'/api/v2/progress');
  expect(unsigned.status()).toBe(401);
  for (const path of ['/api/v2/daily/claim','/api/v2/daily/draw']) {
    const res = await request.post(BACKEND+path);
    expect(res.status()).toBe(401);
  }
});
