import { test, expect } from '@playwright/test';

async function capture(page, testInfo, label) {
  const path = testInfo.outputPath(label + '.png');
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach(label, { path, contentType: 'image/png' });
}

async function launch(page) {
  // This is an independent browser smoke test, not a genuine VK WebView session.
  // Force the app's documented non-VK fallback so no fake VK successes are asserted.
  await page.route('https://unpkg.com/**', route => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#splash')).toHaveCount(0, { timeout: 12000 });
}

test('first launch, mobile visuals, daily card, rewards, spreads and navigation', async ({ page }, testInfo) => {
  const exceptions = [];
  page.on('pageerror', e => exceptions.push(e.message));

  await launch(page);
  await expect(page.locator('#consentScreen')).toBeVisible();
  await capture(page, testInfo, '01-consent');

  await page.locator('#agreeAge').check();
  await page.locator('#agreePolicy').check();
  await page.locator('button[onclick="acceptConsent()"]').click();
  await expect(page.locator('#mainApp')).toBeVisible();
  await expect(page.locator('#screen-home')).toBeVisible();
  await expect(page.locator('#rewardClaimButton')).toBeEnabled();
  await capture(page, testInfo, '02-home');

  const viewport = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    tabWidth: document.querySelector('.tab-bar').getBoundingClientRect().width
  }));
  expect(viewport.documentWidth).toBeLessThanOrEqual(viewport.viewportWidth + 2);
  expect(viewport.tabWidth).toBeLessThanOrEqual(viewport.viewportWidth + 2);

  await page.locator('#rewardClaimButton').click();
  await expect(page.locator('#rewardBalance')).toHaveText('10');
  await expect(page.locator('#rewardClaimButton')).toBeDisabled();
  await expect(page.locator('#rewardStreak')).toHaveText('1');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#splash')).toHaveCount(0, { timeout: 12000 });
  await expect(page.locator('#mainApp')).toBeVisible();
  await expect(page.locator('#rewardBalance')).toHaveText('10');
  await expect(page.locator('#rewardClaimButton')).toBeDisabled();

  await page.locator('#dailyCardFrame').click();
  await expect(page.locator('#dailyCardFrame')).toHaveClass(/flipped/);
  await expect(page.locator('#cardMeaning')).toHaveClass(/show/, { timeout: 12000 });
  await capture(page, testInfo, '03-card-revealed');

  await page.locator('.tab').nth(2).click();
  await expect(page.locator('#screen-history')).toBeVisible();
  await expect(page.locator('#historyList .history-item')).toHaveCount(1);
  await capture(page, testInfo, '04-history');

  await page.locator('.tab').nth(1).click();
  await expect(page.locator('#screen-spreads')).toBeVisible();
  await expect(page.locator('#screen-spreads .spread-card')).toHaveCount(5);
  await capture(page, testInfo, '05-spreads');

  await page.locator('#screen-spreads .spread-card').first().click();
  await expect(page.locator('#modalPaywall')).toHaveClass(/show/);
  await page.locator('#paywallBtn').click();
  await expect(page.locator('#modalReveal')).toHaveClass(/show/, { timeout: 12000 });
  await expect(page.locator('#spreadCardsRow .spread-card-mini')).toHaveCount(3);
  await capture(page, testInfo, '06-spread-result');

  await page.locator('#modalReveal .modal-close').click();
  await page.locator('.tab').nth(3).click();
  await expect(page.locator('#screen-settings')).toBeVisible();
  await capture(page, testInfo, '07-settings');

  expect(exceptions, 'Unhandled JavaScript exceptions').toEqual([]);
});

test('existing card and reward persistence keys stay distinct', async ({ page }) => {
  await launch(page);
  await page.locator('#agreeAge').check();
  await page.locator('#agreePolicy').check();
  await page.locator('button[onclick="acceptConsent()"]').click();
  await expect(page.locator('#rewardClaimButton')).toBeEnabled();
  await page.locator('#rewardClaimButton').click();
  await page.locator('#dailyCardFrame').click();
  await expect(page.locator('#cardMeaning')).toHaveClass(/show/);
  const entries = await page.evaluate(() => Object.keys(sessionStorage).sort());
  expect(entries).toContain('taro_consent');
  expect(entries).toContain('taro_dailyCard');
  expect(entries).toContain('taro_history');
  expect(entries).toContain('taro_taro_engagement_v1');
  expect(new Set(entries).size).toBe(entries.length);
});

test('no CDN scripts or images: interface still works with fallbacks', async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await launch(page);
  await page.locator('#agreeAge').check();
  await page.locator('#agreePolicy').check();
  await page.locator('button[onclick="acceptConsent()"]').click();
  await expect(page.locator('#mainApp')).toBeVisible();
  await page.locator('#dailyCardFrame').click();
  await expect(page.locator('#cardMeaning')).toHaveClass(/show/, { timeout: 12000 });
  await expect(page.locator('#cardName')).not.toHaveText('—');
  await expect(page.locator('#rewardClaimButton')).toBeEnabled();
});
