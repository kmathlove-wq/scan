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

test.describe('geometry', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
  });

  test('orderCorners는 무순서 4점을 코너로 정렬한다', async ({ page }) => {
    const r = await page.evaluate(() => window.scanDebug.geometry.orderCorners([
      { x: 100, y: 400 }, { x: 90, y: 20 }, { x: 500, y: 30 }, { x: 480, y: 410 },
    ]));
    expect(r.topLeft).toEqual({ x: 90, y: 20 });
    expect(r.topRight).toEqual({ x: 500, y: 30 });
    expect(r.bottomRight).toEqual({ x: 480, y: 410 });
    expect(r.bottomLeft).toEqual({ x: 100, y: 400 });
  });

  test('isConvexQuad: 정상 사각형 true, 꼬인 사각형 false', async ({ page }) => {
    const [ok, bad] = await page.evaluate(() => {
      const g = window.scanDebug.geometry;
      const good = g.orderCorners([{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}]);
      const twisted = { topLeft:{x:0,y:0}, topRight:{x:100,y:100}, bottomRight:{x:100,y:0}, bottomLeft:{x:0,y:100} };
      return [g.isConvexQuad(good), g.isConvexQuad(twisted)];
    });
    expect(ok).toBe(true);
    expect(bad).toBe(false);
  });

  test('outputSize: 변 길이로 크기 산출, 2000px 상한', async ({ page }) => {
    const [a, b] = await page.evaluate(() => {
      const g = window.scanDebug.geometry;
      const s1 = g.outputSize({ topLeft:{x:0,y:0}, topRight:{x:800,y:0}, bottomRight:{x:800,y:1000}, bottomLeft:{x:0,y:1000} });
      const s2 = g.outputSize({ topLeft:{x:0,y:0}, topRight:{x:4000,y:0}, bottomRight:{x:4000,y:2000}, bottomLeft:{x:0,y:2000} });
      return [s1, s2];
    });
    expect(a).toEqual({ w: 800, h: 1000 });
    expect(Math.max(b.w, b.h)).toBe(2000);
    expect(b).toEqual({ w: 2000, h: 1000 });
  });

  test('mapPoint: 좌표계 변환', async ({ page }) => {
    const r = await page.evaluate(() => window.scanDebug.geometry.mapPoint(
      { x: 50, y: 50 },
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 0, y: 0, width: 1000, height: 1000 },
    ));
    expect(r).toEqual({ x: 500, y: 500 });
  });
});
