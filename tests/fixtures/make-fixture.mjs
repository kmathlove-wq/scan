import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const W = 1200, H = 1600;

// 종이 정답 모서리 (기울어진 사다리꼴) — 종이가 들어가는 픽스처는 이 위치를 쓴다.
const corners = {
  topLeft:     { x: 210, y: 190 },
  topRight:    { x: 980, y: 250 },
  bottomRight: { x: 930, y: 1410 },
  bottomLeft:  { x: 170, y: 1330 },
};

const drawPaper = `
ctx.fillStyle = '#f7f5f0';
ctx.beginPath();
ctx.moveTo(k.topLeft.x, k.topLeft.y);
ctx.lineTo(k.topRight.x, k.topRight.y);
ctx.lineTo(k.bottomRight.x, k.bottomRight.y);
ctx.lineTo(k.bottomLeft.x, k.bottomLeft.y);
ctx.closePath(); ctx.fill();
ctx.strokeStyle = '#8892a0'; ctx.lineWidth = 6;
for (let y=340; y<1300; y+=70){ ctx.beginPath(); ctx.moveTo(280, y); ctx.lineTo(880 - (y*0.02), y); ctx.stroke(); }
`;

const noise = (n, alpha) => `
for (let i=0;i<${n};i++){
  ctx.fillStyle = 'rgba(0,0,0,'+(Math.random()*${alpha})+')';
  ctx.fillRect(Math.random()*${W}, Math.random()*${H}, 2, 2);
}`;

// 각 픽스처: canvas 를 그리는 <script> 조각.
const FIXTURES = {
  // 어두운 책상 위 흰 종이 — 검출돼야 정상.
  'paper-on-desk': `
    ctx.fillStyle = '#4a4038'; ctx.fillRect(0,0,${W},${H});
    ${noise(40000, 0.06)}
    ${drawPaper}
  `,
  // 종이보다 큰 어두운 "반사면"(모서리가 둥글어 4각형이 아님) + 반사 클러터.
  // → 4점 사각형이 아니라 후보 탈락, 종이가 선택돼야 정상.
  'paper-with-decoy': `
    ctx.fillStyle = '#4a4038'; ctx.fillRect(0,0,${W},${H});
    ${noise(20000, 0.05)}
    ctx.fillStyle = '#20202a';
    ctx.beginPath(); ctx.roundRect(80, 80, 1040, 1460, 140); ctx.fill();
    for (let i=0;i<500;i++){
      ctx.strokeStyle = 'rgba(200,210,230,'+(0.05+Math.random()*0.15)+')';
      ctx.lineWidth = 1 + Math.random()*3; ctx.beginPath();
      ctx.moveTo(120+Math.random()*960, 120+Math.random()*1380);
      ctx.lineTo(120+Math.random()*960, 120+Math.random()*1380); ctx.stroke();
    }
    ${drawPaper}
  `,
  // 테두리 없는 하얀 그림 (불규칙한 검은 형체) — 종이 없음(null)이어야 정상.
  'no-paper-drawing': `
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,${W},${H});
    ctx.fillStyle = '#111'; ctx.beginPath();
    const cx=600, cy=800; ctx.moveTo(cx+300, cy);
    for (let a=0;a<Math.PI*2;a+=0.15){ const r = 220 + Math.sin(a*5)*160 + Math.cos(a*3)*90;
      ctx.lineTo(cx+Math.cos(a)*r, cy+Math.sin(a)*r); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(520, 720, 40, 0, Math.PI*2); ctx.arc(690, 720, 40, 0, Math.PI*2); ctx.fill();
  `,
  // 화면 꽉 찬 스크린샷 흉내: 잔글씨·작은 상자만 빽빽, 큰 사각형 없음 — null 이어야 정상.
  'no-paper-fullframe': `
    ctx.fillStyle = '#e8e8ec'; ctx.fillRect(0,0,${W},${H});
    ctx.fillStyle = '#c8c8d0'; ctx.fillRect(0,0,${W},110);           // 상단바 (테두리 붙음)
    ctx.fillStyle = '#555';
    for (let y=170; y<${H}-40; y+=54){
      const wln = 300 + Math.random()*760;
      ctx.fillRect(60, y, wln, 14);
    }
    for (let i=0;i<40;i++){
      ctx.strokeStyle = '#aab'; ctx.lineWidth = 2;
      const x=60+Math.random()*1000, y=150+Math.random()*1380, w=40+Math.random()*120, h=30+Math.random()*80;
      ctx.strokeRect(x, y, w, h);
    }
  `,
};

const html = (body) => `<!doctype html><canvas id="c" width="${W}" height="${H}"></canvas><script>
const ctx = c.getContext('2d');
const k = ${JSON.stringify(corners)};
${body}
window.__png = c.toDataURL('image/jpeg', 0.92);
</script>`;

const browser = await chromium.launch();
for (const [name, body] of Object.entries(FIXTURES)) {
  const page = await browser.newPage();
  await page.setContent(html(body));
  await page.waitForFunction(() => typeof window.__png === 'string');
  const dataUrl = await page.evaluate(() => window.__png);
  await page.close();
  fs.writeFileSync(path.join(dir, `${name}.jpg`), Buffer.from(dataUrl.split(',')[1], 'base64'));
  fs.writeFileSync(
    path.join(dir, `${name}.json`),
    JSON.stringify({ width: W, height: H, corners }, null, 2),
  );
  console.log(`fixture written: ${name}.jpg`);
}
await browser.close();
