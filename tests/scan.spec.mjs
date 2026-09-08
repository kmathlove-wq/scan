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

test.describe('filters', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
  });

  test('모든 필터는 크기를 보존하고 예외를 던지지 않는다', async ({ page }) => {
    const res = await page.evaluate(() => {
      const src = document.createElement('canvas'); src.width = 200; src.height = 260;
      const ctx = src.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 200, 260);
      g.addColorStop(0, '#111'); g.addColorStop(1, '#eee');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 200, 260);
      return ['original', 'auto', 'bw', 'gray'].map(n => {
        const out = window.scanDebug.filters.applyFilter(src, n);
        return { n, w: out.width, h: out.height };
      });
    });
    for (const r of res) { expect(r.w).toBe(200); expect(r.h).toBe(260); }
  });

  test('bw는 거의 흑백 2값', async ({ page }) => {
    const ratio = await page.evaluate(() => {
      const src = document.createElement('canvas'); src.width = 100; src.height = 100;
      const ctx = src.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 100, 0);
      g.addColorStop(0, '#000'); g.addColorStop(1, '#fff');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 100, 100);
      const out = window.scanDebug.filters.applyFilter(src, 'bw');
      const d = out.getContext('2d').getImageData(0, 0, 100, 100).data;
      let extreme = 0, total = 0;
      for (let i = 0; i < d.length; i += 4) { total++; if (d[i] < 30 || d[i] > 225) extreme++; }
      return extreme / total;
    });
    expect(ratio).toBeGreaterThan(0.95);
  });

  test('gray는 R=G=B', async ({ page }) => {
    const ok = await page.evaluate(() => {
      const src = document.createElement('canvas'); src.width = 60; src.height = 60;
      src.getContext('2d').fillStyle = '#c04030'; src.getContext('2d').fillRect(0, 0, 60, 60);
      const d = window.scanDebug.filters.applyFilter(src, 'gray').getContext('2d').getImageData(0, 0, 60, 60).data;
      for (let i = 0; i < d.length; i += 4) if (!(d[i] === d[i + 1] && d[i + 1] === d[i + 2])) return false;
      return true;
    });
    expect(ok).toBe(true);
  });
});

test.describe('robustness', () => {
  test('카메라가 거부되면 안내 문구 + 파일 버튼으로 계속 사용 가능', async ({ page, context }) => {
    await context.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    });
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    await expect(page.locator('#cam-hint')).toContainText('사진 파일');
    await expect(page.locator('#cam-shoot')).toBeDisabled();
    await expect(page.locator('#cam-file-btn')).toHaveClass(/primary/);
    await page.setInputFiles('#cam-file', 'tests/fixtures/paper-on-desk.jpg');
    await page.waitForFunction(() => window.scanDebug.state.screen === 'adjust', null, { timeout: 10000 });
  });

  test('아주 큰 이미지도 검출 전 축소되어 처리된다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    const ok = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 6000; c.height = 8000;
      const x = c.getContext('2d'); x.fillStyle = '#777'; x.fillRect(0, 0, 6000, 8000);
      x.fillStyle = '#fff'; x.fillRect(600, 800, 4200, 6000);
      const t0 = performance.now();
      const r = window.scanDebug.detectCorners(c);
      return { ms: performance.now() - t0, found: !!r };
    });
    expect(ok.ms).toBeLessThan(8000);
    expect(ok.found).toBe(true); // 축소 후에도 큰 흰 사각형을 검출해야 한다
  });

  test('파일 선택 경로는 여전히 adjust 까지 도달한다 (revokeObjectURL 이 깨뜨리지 않음)', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    await page.setInputFiles('#cam-file', 'tests/fixtures/paper-on-desk.jpg');
    await page.waitForFunction(() => window.scanDebug.state.screen === 'adjust', null, { timeout: 10000 });
    const d = await page.evaluate(() => ({
      w: window.scanDebug.state.draft.canvas.width,
      h: window.scanDebug.state.draft.canvas.height,
    }));
    expect(d.w).toBe(1200);
    expect(d.h).toBe(1600);
  });

  test('페이지가 없으면 downloadImages / downloadPdf 는 아무 일도 안 하고 예외도 없다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    const r = await page.evaluate(async () => {
      window.scanDebug.state.pages = [];
      let threw = null;
      try {
        await window.scanDebug.downloadImages();
        await window.scanDebug.downloadPdf();
      } catch (e) { threw = String(e); }
      return { threw };
    });
    expect(r.threw).toBeNull();
  });

  test('videoDisplayRect: 레터박스(가로/세로 여백) 계산', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    const [pillar, letter, exact] = await page.evaluate(() => {
      const f = window.scanDebug.videoDisplayRect;
      return [
        f(1000, 1000, 400, 800),  // 세로 비디오 → 좌우 여백
        f(1000, 1000, 800, 400),  // 가로 비디오 → 상하 여백
        f(800, 600, 400, 300),    // 비율 동일 → 여백 없음
      ];
    });
    expect(pillar).toEqual({ x: 250, y: 0, width: 500, height: 1000 });
    expect(letter).toEqual({ x: 0, y: 250, width: 1000, height: 500 });
    expect(exact).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });
});

test.describe('export', () => {
  async function buildPages(page, n) {
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    for (let i = 0; i < n; i++) {
      await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 400; c.height = 560;
        const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 400, 560);
        x.fillStyle = '#000'; for (let y = 40; y < 520; y += 40) x.fillRect(30, y, 300, 6);
        window.scanDebug.addPage({ sourceDataURL: c.toDataURL('image/jpeg'), corners: null, warpedCanvas: c });
      });
    }
    await page.evaluate(() => window.scanDebug.show('export'));
  }

  test('페이지 수만큼 썸네일이 보인다', async ({ page }) => {
    await buildPages(page, 3);
    await expect(page.locator('#exp-list .exp-item')).toHaveCount(3);
  });

  test('PDF 다운로드가 트리거되고 파일이 비어있지 않다', async ({ page }) => {
    await buildPages(page, 2);
    await page.selectOption('#exp-type', 'pdf');
    const dl = await Promise.all([
      page.waitForEvent('download'),
      page.click('#exp-download'),
    ]);
    const path = await dl[0].path();
    const fs = await import('node:fs');
    expect(fs.statSync(path).size).toBeGreaterThan(1000);
    expect(dl[0].suggestedFilename()).toBe('스캔.pdf');
  });

  test('1장 이미지 다운로드', async ({ page }) => {
    await buildPages(page, 1);
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#exp-download'),
    ]);
    expect(dl.suggestedFilename()).toMatch(/^스캔\.(png|jpg)$/);
  });

  test('필터 버튼을 누르면 그 페이지 filter가 바뀐다', async ({ page }) => {
    await buildPages(page, 1);
    await page.click('#exp-list .exp-item:first-child [data-filter="bw"]');
    const f = await page.evaluate(() => window.scanDebug.state.pages[0].filter);
    expect(f).toBe('bw');
  });
});

test.describe('회귀 (C1/C2/I6)', () => {
  test('C1: detectCorners 를 400회 반복해도 WASM 힙이 늘지 않는다', async ({ page }) => {
    test.setTimeout(120_000); // 노이즈 프레임 detectCorners 는 ~55ms/회 (findContours 비용)
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    const r = await page.evaluate(() => {
      const cv = window.cv;
      const heap = () => {
        if (cv.HEAP8 && cv.HEAP8.buffer) return cv.HEAP8.buffer.byteLength;
        if (typeof cv.wasmMemory !== 'undefined' && cv.wasmMemory.buffer) return cv.wasmMemory.buffer.byteLength;
        if (performance.memory) return performance.memory.usedJSHeapSize;
        return null;
      };
      const c = document.createElement('canvas'); c.width = 640; c.height = 480;
      const x = c.getContext('2d');
      x.fillStyle = '#777'; x.fillRect(0, 0, 640, 480);
      const im = x.getImageData(0, 0, 640, 480);
      for (let i = 0; i < im.data.length; i += 4) {
        const n = (Math.random() * 90) | 0;
        im.data[i] = 90 + n; im.data[i + 1] = 90 + n; im.data[i + 2] = 90 + n;
      }
      x.putImageData(im, 0, 0);
      x.fillStyle = '#efefef'; x.fillRect(110, 80, 420, 320); // 종이 비슷한 밝은 사각형
      for (let i = 0; i < 40; i++) window.scanDebug.detectCorners(c); // 워밍업
      const before = heap();
      for (let i = 0; i < 400; i++) window.scanDebug.detectCorners(c);
      const after = heap();
      return { before, after, mode: (cv.HEAP8 ? 'HEAP8' : cv.wasmMemory ? 'wasmMemory' : 'jsHeap') };
    });
    expect(r.before).not.toBeNull();
    // WASM 메모리는 한 번 커지면 줄지 않는다 — 컨투어 사본이 새면(누수분 ~0.25MB/회)
    // 400회 동안 최소 수십 MB 증가한다. 정상이면 정확히 그대로.
    expect(r.after).toBe(r.before);
  });

  test('C2: auto 필터가 2000x1500 에서 800ms 이내로 끝나고 색을 유지한다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    const r = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 2000; c.height = 1500;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 2000, 1500); // 조명 기울기(그림자)
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#7a7a7a');
      x.fillStyle = g; x.fillRect(0, 0, 2000, 1500);
      x.fillStyle = '#c62828'; x.fillRect(200, 200, 600, 400);   // 빨강 블록
      x.fillStyle = '#1565c0'; x.fillRect(1050, 800, 700, 500);  // 파랑 블록
      window.scanDebug.filters.applyFilter(c, 'auto'); // 워밍업(WASM JIT 1회 비용 제외)
      const t0 = performance.now();
      const out = window.scanDebug.filters.applyFilter(c, 'auto');
      const ms = performance.now() - t0;
      const d = out.getContext('2d').getImageData(0, 0, 2000, 1500).data;
      const at = (px, py) => { const i = (py * 2000 + px) * 4; return [d[i], d[i + 1], d[i + 2]]; };
      const red = at(500, 400), blue = at(1400, 1050);
      const colorful =
        (red[0] - red[2] > 25) && (blue[2] - blue[0] > 25); // 빨강은 R>B, 파랑은 B>R
      return { ms, colorful, red, blue };
    });
    expect(r.ms).toBeLessThan(800);
    expect(r.colorful).toBe(true);
  });

  test('I6: 담긴 페이지를 다시 보정하면 warpedCanvas 가 갱신되고 export 로 돌아온다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    await page.evaluate(() => { document.getElementById('cam-file').value = ''; });
    await page.setInputFiles('#cam-file', 'tests/fixtures/paper-on-desk.jpg');
    await page.waitForFunction(() => window.scanDebug.state.screen === 'adjust', null, { timeout: 10000 });
    await page.waitForFunction(() => document.querySelectorAll('#adj-handles .handle').length === 4, null, { timeout: 5000 });
    await page.evaluate(async () => {
      const truth = await (await fetch('/tests/fixtures/paper-on-desk.json')).json();
      window.scanDebug._setHandles(truth.corners);
    });
    await page.click('#adj-accept');
    await page.waitForFunction(() => window.scanDebug.state.screen === 'camera', null, { timeout: 10000 });
    await page.evaluate(() => window.scanDebug.show('export'));
    const before = await page.evaluate(() => {
      const p = window.scanDebug.state.pages[0];
      return { id: p.id, dim: p.warpedCanvas.width + 'x' + p.warpedCanvas.height };
    });
    await page.click('#exp-list .exp-item:first-child [data-act=edit]');
    await page.waitForFunction(() => window.scanDebug.state.screen === 'adjust', null, { timeout: 10000 });
    await page.waitForFunction(() => window.scanDebug.state.editingPageId !== null, null, { timeout: 5000 });
    await page.waitForFunction(() => document.querySelectorAll('#adj-handles .handle').length === 4, null, { timeout: 5000 });
    // 재편집 openAdjust 의 rAF 가 저장된 코너(≈truth)를 실제로 반영할 때까지 기다린다 —
    // 직전 보정 세션의 낡은 핸들 DOM 이 남아 있어 handle 개수만으로는 부족하다.
    await page.waitForFunction(() => {
      const h = window.scanDebug.readHandles();
      if (!h) return false;
      return Math.abs(h.topLeft.x - 210) < 8 && Math.abs(h.topLeft.y - 190) < 8
          && Math.abs(h.bottomRight.x - 930) < 8 && Math.abs(h.bottomRight.y - 1410) < 8;
    }, null, { timeout: 5000 });
    await page.evaluate(() => {
      window.scanDebug._setHandles({
        topLeft: { x: 300, y: 300 }, topRight: { x: 900, y: 300 },
        bottomRight: { x: 900, y: 1200 }, bottomLeft: { x: 300, y: 1200 },
      });
    });
    // _setHandles 가 반영되고, 디바운스 resize 가 끼어들어도 유지되는지 확정 전에 확인한다.
    await page.waitForFunction(() => {
      const h = window.scanDebug.readHandles();
      if (!h) return false;
      return Math.abs(h.topLeft.x - 300) < 6 && Math.abs(h.topLeft.y - 300) < 6
          && Math.abs(h.bottomRight.x - 900) < 6 && Math.abs(h.bottomRight.y - 1200) < 6;
    }, null, { timeout: 5000 });
    await page.click('#adj-accept');
    await page.waitForFunction(() => window.scanDebug.state.screen === 'export', null, { timeout: 10000 });
    const after = await page.evaluate(() => {
      const p = window.scanDebug.state.pages[0];
      return {
        id: p.id, dim: p.warpedCanvas.width + 'x' + p.warpedCanvas.height,
        editingPageId: window.scanDebug.state.editingPageId,
        n: window.scanDebug.state.pages.length,
      };
    });
    expect(after.editingPageId).toBeNull();
    expect(after.n).toBe(1);
    expect(after.id).toBe(before.id);
    expect(after.dim).not.toBe(before.dim);
  });
});

test.describe('파비콘 + 감지 강화', () => {
  test('파비콘이 심겨 있고 favicon.ico 요청이 없다', async ({ page }) => {
    let askedIco = false;
    page.on('request', (r) => { if (r.url().endsWith('/favicon.ico')) askedIco = true; });
    await page.goto('/');
    const href = await page.getAttribute('link[rel="icon"]', 'href');
    expect(href).toContain('data:image/svg+xml');
    const apple = await page.getAttribute('link[rel="apple-touch-icon"]', 'href');
    expect(apple).toContain('data:image/svg+xml');
    await page.waitForTimeout(600);
    expect(askedIco).toBe(false);
  });

  test('큰 어두운 사각형(거울 반사 흉내)이 있어도 종이를 고른다', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => window.scanDebug?.state?.cvReady === true, null, { timeout: 40000 });
    const { got, truth } = await page.evaluate(async () => {
      const bmp = await createImageBitmap(await (await fetch('/tests/fixtures/paper-with-decoy.jpg')).blob());
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      const truth = await (await fetch('/tests/fixtures/paper-with-decoy.json')).json();
      return { got: window.scanDebug.detectCorners(c), truth: truth.corners };
    });
    expect(got).not.toBeNull();
    for (const k of ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']) {
      expect(Math.hypot(got[k].x - truth[k].x, got[k].y - truth[k].y)).toBeLessThan(120);
    }
  });
});
