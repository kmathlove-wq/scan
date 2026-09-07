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

test.describe('camera', () => {
  test('카메라가 시작되고 프레임을 캡처한다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    await page.evaluate(() => window.scanDebug.startCamera());
    await page.waitForFunction(() => {
      const v = document.getElementById('cam-video');
      return v && v.videoWidth > 0;
    }, null, { timeout: 10000 });
    const size = await page.evaluate(() => {
      const c = window.scanDebug.grabFrame();
      return { w: c.width, h: c.height };
    });
    expect(size.w).toBeGreaterThan(0);
    expect(size.h).toBeGreaterThan(0);
  });

  test('파일 선택 경로: 이미지가 캔버스로 들어온다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    await page.setInputFiles('#cam-file', 'tests/fixtures/paper-on-desk.jpg');
    await page.waitForFunction(() => window.scanDebug.state.draft !== null, null, { timeout: 10000 });
    const d = await page.evaluate(() => ({
      w: window.scanDebug.state.draft.canvas.width,
      h: window.scanDebug.state.draft.canvas.height,
    }));
    expect(d.w).toBe(1200);
    expect(d.h).toBe(1600);
  });

  test('downscaleCanvas: 긴 변 상한 적용', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    const r = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 6000; c.height = 3000;
      c.getContext('2d').fillRect(0, 0, 10, 10);
      const out = window.scanDebug.downscaleCanvas(c, 3000);
      return { w: out.width, h: out.height };
    });
    expect(r).toEqual({ w: 3000, h: 1500 });
  });
});

test.describe('detect', () => {
  test('합성 사진에서 종이 네 모서리를 찾는다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    const { got, truth } = await page.evaluate(async () => {
      const res = await fetch('/tests/fixtures/paper-on-desk.jpg');
      const blob = await res.blob();
      const bmp = await createImageBitmap(blob);
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      const truth = await (await fetch('/tests/fixtures/paper-on-desk.json')).json();
      return { got: window.scanDebug.detectCorners(c), truth: truth.corners };
    });
    expect(got).not.toBeNull();
    for (const k of ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']) {
      expect(Math.hypot(got[k].x - truth[k].x, got[k].y - truth[k].y)).toBeLessThan(80);
    }
  });

  test('종이 없는 사진이면 null', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    const got = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 400; c.height = 400;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#777'; ctx.fillRect(0, 0, 400, 400);
      return window.scanDebug.detectCorners(c);
    });
    expect(got).toBeNull();
  });
});
