import { test, expect } from '@playwright/test';

test('페이지가 열리고 cv 준비 후 카메라 화면으로 전환된다', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#screen-loading')).toBeVisible();
  await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
  await expect(page.locator('#screen-camera')).toBeVisible();
  await expect(page.locator('#screen-loading')).toBeHidden();
});

test('show()는 한 화면만 보이게 한다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
  await page.evaluate(() => window.scanDebug.show('export'));
  await expect(page.locator('#screen-export')).toBeVisible();
  for (const s of ['loading', 'camera', 'adjust']) {
    await expect(page.locator(`#screen-${s}`)).toBeHidden();
  }
});
