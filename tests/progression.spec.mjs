import { test, expect } from '@playwright/test';

async function launchAndAccept(page) {
  await page.route('https://unpkg.com/**', route => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#splash')).toHaveCount(0, { timeout: 12000 });
  if (await page.locator('#consentScreen').isVisible()) {
    await page.locator('#agreeAge').check();
    await page.locator('#agreePolicy').check();
    await page.locator('button[onclick="acceptConsent()"]').click();
  }
  await expect(page.locator('#mainApp')).toBeVisible();
}

async function openProgress(page) {
  await page.locator('button[onclick="switchTab(\'progress\', this)"]').click();
  await expect(page.locator('#screen-progress')).toBeVisible();
  await expect(page.locator('#arcanaCollection .arcana-tile')).toHaveCount(22);
}

test('full user journey: daily missions, unlocked arcanum, achievements and persistence', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await launchAndAccept(page);
  await openProgress(page);

  await expect(page.locator('#arcanaCount')).toHaveText('0 / 22');
  await expect(page.locator('#arcanaMissionsDone')).toHaveText('0 / 3');
  await expect(page.locator('#arcanaAchievements .is-earned')).toHaveCount(0);

  await page.locator('.tab').first().click();
  await page.locator('#rewardClaimButton').click();
  await expect(page.locator('#rewardBalance')).toHaveText('10');
  await page.locator('#dailyCardFrame').click();
  await expect(page.locator('#cardMeaning')).toHaveClass(/show/);

  await openProgress(page);
  await expect(page.locator('#arcanaCount')).toHaveText('1 / 22');
  await expect(page.locator('#arcanaMissionsDone')).toHaveText('2 / 3');
  await expect(page.locator('#arcanaCollection .arcana-tile.is-open')).toHaveCount(1);
  await expect(page.locator('#arcanaAchievements .is-earned')).toHaveCount(1);

  await page.locator('.tab').nth(1).click();
  await page.locator('#screen-spreads .spread-card').first().click();
  await expect(page.locator('#modalPaywall')).toHaveClass(/show/);
  await page.locator('#paywallBtn').click();
  await expect(page.locator('#modalReveal')).toHaveClass(/show/, { timeout: 12000 });
  await page.locator('#modalReveal .modal-close').click();

  await openProgress(page);
  await expect(page.locator('#arcanaMissionsDone')).toHaveText('3 / 3');
  await expect(page.locator('#arcanaCollection .arcana-tile.is-open')).toHaveCount(4);
  await expect(page.locator('#arcanaCount')).toHaveText('4 / 22');

  const png = testInfo.outputPath('08-arcanum-progress.png');
  await page.screenshot({ path: png, fullPage: true, animations: 'disabled' });
  await testInfo.attach('Arcanum progress', { path: png, contentType: 'image/png' });

  const storage = await page.evaluate(() => Object.keys(sessionStorage));
  for (const key of ['taro_consent', 'taro_dailyCard', 'taro_history', 'taro_taro_engagement_v1', 'taro_taro_arcana_collection_v1']) {
    expect(storage).toContain(key);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#splash')).toHaveCount(0, { timeout: 12000 });
  await openProgress(page);
  await expect(page.locator('#arcanaCount')).toHaveText('4 / 22');
  await expect(page.locator('#arcanaMissionsDone')).toHaveText('3 / 3');

  const metrics = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    navTabs: document.querySelectorAll('.tab').length
  }));
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewport + 2);
  expect(metrics.navTabs).toBe(5);
  expect(errors).toEqual([]);
});

test('migration from historic readings survives 50-entry history truncation', async ({ page }) => {
  await launchAndAccept(page);
  const today = await page.evaluate(() => {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  });
  await page.evaluate((date) => {
    sessionStorage.setItem('taro_history', JSON.stringify([
      { type: 'daily', date, cardId: 0 },
      { type: 'spread', date, spreadKey: 'love', cards: [
        { pos: 'Вы', cardId: 1 },
        { pos: 'Ситуация', cardId: 2 },
        { pos: 'Итог', cardId: 3 }
      ] }
    ]));
  }, today);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#mainApp')).toBeVisible();
  await openProgress(page);
  await expect(page.locator('#arcanaCount')).toHaveText('4 / 22');
  await expect(page.locator('#arcanaMissionsDone')).toHaveText('2 / 3');

  // The collection key is independent from the original 50-item history.
  await page.evaluate(() => sessionStorage.setItem('taro_history', '[]'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#mainApp')).toBeVisible();
  await openProgress(page);
  await expect(page.locator('#arcanaCount')).toHaveText('4 / 22');
  await expect(page.locator('#arcanaMissionsDone')).toHaveText('0 / 3');
});

test('works without external scripts and does not disturb older tab ordering', async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await launchAndAccept(page);
  await openProgress(page);
  await expect(page.locator('#arcanaCollection .arcana-tile')).toHaveCount(22);
  await page.locator('.tab').nth(2).click();
  await expect(page.locator('#screen-history')).toBeVisible();
  await page.locator('.tab').nth(3).click();
  await expect(page.locator('#screen-settings')).toBeVisible();
  await page.locator('.tab').nth(1).click();
  await expect(page.locator('#screen-spreads .spread-card')).toHaveCount(5);
});
