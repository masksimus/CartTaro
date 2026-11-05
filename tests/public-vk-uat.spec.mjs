import { test, expect } from '@playwright/test';

/* Read-only smoke of the real isolated Vercel test host.
 * No VK credentials or test PIN. No balance mutations.
 */
const BASE = 'https://tarot-vk-uat-public-git-742c15-maksimiirina1992-9738s-projects.vercel.app';

test('public VK UAT: live mobile UI, image, Bridge CDN, Neon health', async ({page,request}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(BASE+'/v2-pilot.html', {
    waitUntil:'domcontentloaded',timeout:25000
  });
  expect(response?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText('Путь Арканов');
  await expect(page.locator('#verifyPersistenceButton')).toHaveCount(1);
  await expect(page.locator('#authStatus')).toContainText('не подтверждён');
  await expect(page.locator('#claimButton')).toBeDisabled();
  await expect(page.locator('#drawButton')).toBeDisabled();
  await expect(page.locator('#spreadOneButton')).toBeDisabled();
  await expect(page.locator('#spreadThreeButton')).toBeDisabled();
  await expect(page.locator('#verifyPersistenceButton')).toBeHidden();

  const health = await request.get(BASE+'/api/v2/health',{timeout:20000});
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({
    service:'tarot-v2-postgres',ready:true,database:'connected',
    progressReadReady:true,rewardsEnabled:false
  });

  const status = await request.get(BASE+'/api/v2/status',{timeout:15000});
  expect(status.status()).toBe(200);
  expect(await status.json()).toMatchObject({
    service:'tarot-v2-postgres',appId:54582199,
    storageConfigured:true,rewardsEnabled:false,mode:'read_only'
  });

  // Actual historical JPEG, loaded by Chromium under CSP, not a mock image.
  const painting = await page.evaluate(async () => {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    img.src = 'https://masksimus.github.io/CartTaro/art-preview/classic/08_Strength.jpg';
    return Promise.race([
      new Promise(resolve => {
        img.onload = () => resolve({width:img.naturalWidth,height:img.naturalHeight});
        img.onerror = () => resolve({width:0,height:0});
      }),
      new Promise(resolve => setTimeout(() => resolve({width:0,height:0}),16000))
    ]);
  });
  expect(painting.width).toBeGreaterThan(200);
  expect(painting.height).toBeGreaterThan(200);

  await expect.poll(() => page.evaluate(
    () => Boolean(window.vkBridge && typeof window.vkBridge.send === 'function')
  ),{timeout:18000}).toBe(true);

  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(page.viewportSize().width + 2);
  expect(errors).toEqual([]);
});

test('VK personal progress must reject anonymous access (production secret required)', async ({request}) => {
  // This is intentionally a release gate. If it returns 503 auth_not_configured,
  // Preview lacks the protected VK key. Do not weaken auth or mark the UAT green.
  const response = await request.get(BASE+'/api/v2/progress',{timeout:15000});
  expect(response.status()).toBe(401);
  expect((await response.json()).error).toBe('unauthorized');
});
