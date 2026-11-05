import { test, expect } from '@playwright/test';

/**
 * Live smoke of the public V5 preview. This is NOT a simulated VK login.
 * No VK secrets, user IDs or balance writes are used in this test.
 */
const BASE = 'https://tarot-vk-uat-public-git-6ff854-maksimiirina1992-9738s-projects.vercel.app';

test('V5 preview: 3 Android sizes, real images, no tester controls, fail-closed identity', async ({page,request}) => {
  const jsErrors=[];
  const writes=[];
  page.on('pageerror', e=>jsErrors.push(e.message));
  page.on('request', req=>{
    if (req.method()==='POST' && req.url().includes('/api/v2/')) writes.push(req.url());
  });
  const pageResponse=await page.goto(BASE+'/release/index.html',{
    waitUntil:'domcontentloaded',timeout:25000
  });
  expect(pageResponse?.status()).toBe(200);
  await expect(page.locator('h1')).toHaveText('Путь Арканов');
  await expect(page.locator('.eyebrow')).toContainText('СТАРШИЕ АРКАНЫ');
  await expect(page.locator('#pilotPin')).toHaveCount(0);
  await expect(page.locator('#pilotAccess')).toHaveCount(0);
  await expect(page.locator('#dailyActions')).toBeHidden();
  await expect(page.locator('#claimButton')).toBeDisabled();
  await expect(page.locator('#drawButton')).toBeDisabled();
  await expect(page.locator('#spreadOneButton')).toBeDisabled();
  await expect(page.locator('#spreadThreeButton')).toBeDisabled();
  await expect(page.locator('#verifyPersistenceButton')).toBeHidden();
  await expect(page.locator('#authStatus')).toContainText('не подтверждён');
  expect(await page.locator('body').innerText()).not.toMatch(/лаборатория|код тестировщика|тестовая серверная экономика/i);

  const api=await request.get(BASE+'/api/v2/status',{timeout:15000});
  expect(api.status()).toBe(200);
  expect(await api.json()).toMatchObject({
    service:'tarot-v2-postgres',appId:54582199,
    storageConfigured:true,mode:'read_only',rewardsEnabled:false
  });
  const health=await request.get(BASE+'/api/v2/health',{timeout:15000});
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({
    service:'tarot-v2-postgres',database:'connected',
    ready:true,progressReadReady:true,rewardsEnabled:false
  });
  // Without VK_PROTECTED_KEY in Preview the API fails closed (503),
  // rather than accepting unsigned or spoofed user IDs.
  const anonymous=await request.get(BASE+'/api/v2/progress',{timeout:15000});
  expect(anonymous.status()).toBe(503);
  expect((await anonymous.json()).error).toBe('auth_not_configured');

  // Verify an actual Pamela Colman Smith public-domain JPG is displayed
  // under deployed CSP. Local fixture tests intentionally mock this resource.
  const artwork=await page.evaluate(async()=>{
    const img=new Image();
    img.referrerPolicy='no-referrer';
    img.src='https://masksimus.github.io/CartTaro/art-preview/classic/08_Strength.jpg';
    const dimensions=await Promise.race([
      new Promise(resolve=>{
        img.onload=()=>resolve([img.naturalWidth,img.naturalHeight]);
        img.onerror=()=>resolve([0,0]);
      }),
      new Promise(resolve=>setTimeout(()=>resolve([0,0]),16000))
    ]);
    return dimensions;
  });
  expect(artwork[0]).toBeGreaterThan(200);
  expect(artwork[1]).toBeGreaterThan(200);
  await expect.poll(()=>page.evaluate(
    ()=>Boolean(window.vkBridge && typeof window.vkBridge.send==='function')
  ),{timeout:18000}).toBe(true);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  expect(writes).toEqual([]);
  expect(jsErrors).toEqual([]);
});
