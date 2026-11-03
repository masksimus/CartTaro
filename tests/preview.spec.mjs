import { test, expect } from '@playwright/test';

test('visual review works without VK, API or browser storage', async ({ page }, testInfo) => {
  const errors = [];
  const externalRequests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:8765/')) externalRequests.push(request.url());
  });
  await page.goto('/preview/index.html');
  await expect(page).toHaveTitle(/визуальное HTTPS-демо/);
  await expect(page.locator('h1')).toHaveText('Путь Арканов');
  await expect(page.locator('#collection .arcana')).toHaveCount(22);
  await expect(page.locator('#achievements .achievement')).toHaveCount(6);
  await expect(page.locator('#unlocked')).toHaveText('3/22');
  await expect(page.locator('#claimButton')).toBeEnabled();
  await expect(page.locator('#drawButton')).toBeEnabled();
  await expect(page.locator('#bridgeStatus')).toContainText('выключен');
  await expect(page.locator('#authStatus')).toContainText('выключен');

  await page.locator('#claimButton').click();
  await expect(page.locator('#crystals')).toHaveText('35');
  await expect(page.locator('#claimButton')).toBeDisabled();
  await expect(page.locator('#status')).toContainText('На сервер ничего не отправлено');
  await page.locator('#drawButton').click();
  await expect(page.locator('#unlocked')).toHaveText('4/22');
  await expect(page.locator('#drawButton')).toBeDisabled();
  await expect(page.locator('#drawResult')).toContainText('Луна');
  const params = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    storage: localStorage.length + sessionStorage.length,
    ct: performance.getEntriesByType('resource').length
  }));
  expect(params.width).toBeLessThanOrEqual(params.viewport + 2);
  expect(params.storage).toBe(0);
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);

  const image = testInfo.outputPath('preview-mobile.png');
  await page.screenshot({path:image,fullPage:true,animations:'disabled'});
  await testInfo.attach('visual-review', {path:image,contentType:'image/png'});

  await page.reload();
  await expect(page.locator('#unlocked')).toHaveText('3/22');
  await expect(page.locator('#crystals')).toHaveText('25');
});

test('blocked or missing VK is never presented as real sign-in', async ({ page }) => {
  await page.goto('/preview/index.html?vk_user_id=123&sign=FAKE');
  await expect(page.locator('#authStatus')).toContainText('выключен');
  await expect(page.locator('header')).toContainText('Визуальное демо');
  await expect(page.locator('footer')).toContainText('только просмотр дизайна');
  const requests = await page.evaluate(() => performance.getEntriesByType('resource').map(r => r.name));
  expect(requests.every(uri => !uri.includes('/api/v1/') && !uri.includes('unpkg.com'))).toBe(true);
});
