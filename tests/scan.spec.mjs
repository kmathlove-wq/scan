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

test.describe('livepreview', () => {
  test('라이브 루프가 시작/정지되고 오버레이에 그린다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    await page.evaluate(() => window.scanDebug.startCamera());
    await page.waitForFunction(() => document.getElementById('cam-video').videoWidth > 0, null, { timeout: 10000 });
    await page.evaluate(() => window.scanDebug.startLiveLoop());
    await page.waitForTimeout(1200);
    const running = await page.evaluate(() => window.scanDebug._liveRunning());
    expect(running).toBe(true);
    await page.evaluate(() => window.scanDebug.stopLiveLoop());
    const stopped = await page.evaluate(() => window.scanDebug._liveRunning());
    expect(stopped).toBe(false);
  });

  test('촬영하면 draft에 캔버스+코너가 담기고 adjust로 이동', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    await page.evaluate(() => window.scanDebug.startCamera());
    await page.waitForFunction(() => document.getElementById('cam-video').videoWidth > 0, null, { timeout: 10000 });
    await page.click('#cam-shoot');
    await page.waitForFunction(() => window.scanDebug.state.screen === 'adjust', null, { timeout: 5000 });
    const d = await page.evaluate(() => ({
      hasCanvas: !!window.scanDebug.state.draft.canvas,
      hasCorners: !!window.scanDebug.state.draft.corners,
    }));
    expect(d.hasCanvas).toBe(true);
    expect(d.hasCorners).toBe(true); // 검출 실패해도 defaultCorners로 채움
  });
});

test.describe('adjust', () => {
  async function toAdjust(page) {
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    await page.setInputFiles('#cam-file', 'tests/fixtures/paper-on-desk.jpg');
    await page.waitForFunction(() => window.scanDebug.state.screen === 'adjust', null, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll('#adj-handles .handle').length === 4, null, { timeout: 5000 });
  }

  test('네 개의 핸들이 표시된다', async ({ page }) => {
    await toAdjust(page);
    await expect(page.locator('#adj-handles .handle')).toHaveCount(4);
  });

  test('핸들을 드래그하면 readHandles 결과가 바뀐다', async ({ page }) => {
    await toAdjust(page);
    const before = await page.evaluate(() => window.scanDebug.readHandles());
    const h = page.locator('#adj-handles .handle').first();
    const box = await h.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 5 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.scanDebug.readHandles());
    expect(JSON.stringify(after)).not.toBe(JSON.stringify(before));
  });

  test('오목한 사각형으로 확정하면 막고 토스트', async ({ page }) => {
    await toAdjust(page);
    await page.evaluate(() => {
      // 한 점(500,700)이 나머지 세 점이 이루는 삼각형 안쪽 → orderCorners 로도
      // 볼록으로 못 편다.
      window.scanDebug._setHandles({
        topLeft: { x: 10, y: 10 }, topRight: { x: 1190, y: 10 },
        bottomRight: { x: 500, y: 700 }, bottomLeft: { x: 10, y: 1590 },
      });
    });
    await page.click('#adj-accept');
    await expect(page.locator('#toast')).toHaveClass(/show/);
    expect(await page.evaluate(() => window.scanDebug.state.screen)).toBe('adjust');
  });
});

test.describe('warp + pages', () => {
  // fresh=false 로 두 번째 촬영: page.goto 는 상태를 초기화하므로, 한 세션에서
  // 여러 장을 담으려면 첫 호출만 페이지를 새로 연다.
  async function shootFromFixture(page, { fresh = true } = {}) {
    if (fresh) {
      await page.goto('/');
      await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    }
    // 같은 파일을 두 번 고르면 Chromium 이 change 이벤트를 다시 쏘지 않는다 — 먼저 비운다.
    await page.evaluate(() => { document.getElementById('cam-file').value = ''; });
    await page.setInputFiles('#cam-file', 'tests/fixtures/paper-on-desk.jpg');
    await page.waitForFunction(() => window.scanDebug.state.screen === 'adjust', null, { timeout: 10000 });
    // _adjRects 는 openAdjust 의 requestAnimationFrame 안에서 세팅된다 — 핸들 4개가
    // 붙을 때까지 기다린 뒤에야 _setHandles 가 안전하다.
    await page.waitForFunction(() => document.querySelectorAll('#adj-handles .handle').length === 4, null, { timeout: 5000 });
    await page.evaluate(async () => {
      const truth = await (await fetch('/tests/fixtures/paper-on-desk.json')).json();
      window.scanDebug._setHandles(truth.corners);
    });
    await page.click('#adj-accept');
    await page.waitForFunction(() => window.scanDebug.state.screen === 'camera', null, { timeout: 10000 });
  }

  test('담기 → pages에 1장, 편 캔버스는 비어있지 않다', async ({ page }) => {
    await shootFromFixture(page);
    const info = await page.evaluate(() => {
      const p = window.scanDebug.state.pages[0];
      const cx = p.warpedCanvas.getContext('2d');
      const d = cx.getImageData(0, 0, p.warpedCanvas.width, p.warpedCanvas.height).data;
      let min = 255, max = 0;
      for (let i = 0; i < d.length; i += 4 * 97) { min = Math.min(min, d[i]); max = Math.max(max, d[i]); }
      return { n: window.scanDebug.state.pages.length, w: p.warpedCanvas.width, h: p.warpedCanvas.height, spread: max - min };
    });
    expect(info.n).toBe(1);
    expect(info.w).toBeGreaterThan(200);
    expect(info.h).toBeGreaterThan(info.w); // 세로 문서
    expect(info.spread).toBeGreaterThan(20); // 글줄 때문에 명암차 존재
  });

  test('removePage / movePage', async ({ page }) => {
    await shootFromFixture(page);
    await shootFromFixture(page, { fresh: false });
    const ids = await page.evaluate(() => window.scanDebug.state.pages.map(p => p.id));
    await page.evaluate((id) => window.scanDebug.movePage(id, 1), ids[0]);
    const reordered = await page.evaluate(() => window.scanDebug.state.pages.map(p => p.id));
    expect(reordered[0]).toBe(ids[1]);
    await page.evaluate((id) => window.scanDebug.removePage(id), ids[0]);
    const left = await page.evaluate(() => window.scanDebug.state.pages.map(p => p.id));
    expect(left).toEqual([ids[1]]);
  });
});
