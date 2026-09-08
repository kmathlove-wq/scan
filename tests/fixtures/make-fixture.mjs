import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

// 정답 모서리 (기울어진 사다리꼴) — 두 픽스처가 같은 위치의 종이를 쓴다.
const corners = {
  topLeft:     { x: 210, y: 190 },
  topRight:    { x: 980, y: 250 },
  bottomRight: { x: 930, y: 1410 },
  bottomLeft:  { x: 170, y: 1330 },
};

const W = 1200, H = 1600;

// canvas 를 그리는 <script> 조각을 만든다. `extra` 는 종이 위에 덧그릴 코드.
function pageHtml(extra) {
  return `<!doctype html><canvas id="c" width="${W}" height="${H}"></canvas><script>
const ctx = c.getContext('2d');
const k = ${JSON.stringify(corners)};
// 배경: 회색 노이즈
ctx.fillStyle = '#7a6a55'; ctx.fillRect(0,0,${W},${H});
for (let i=0;i<40000;i++){
  ctx.fillStyle = 'rgba(0,0,0,'+(Math.random()*0.06)+')';
  ctx.fillRect(Math.random()*${W}, Math.random()*${H}, 2, 2);
}
${extra || ''}
// 종이: 흰 사각형
ctx.fillStyle = '#f7f5f0';
ctx.beginPath();
ctx.moveTo(k.topLeft.x, k.topLeft.y);
ctx.lineTo(k.topRight.x, k.topRight.y);
ctx.lineTo(k.bottomRight.x, k.bottomRight.y);
ctx.lineTo(k.bottomLeft.x, k.bottomLeft.y);
ctx.closePath(); ctx.fill();
// 가짜 글줄
ctx.strokeStyle = '#8892a0'; ctx.lineWidth = 6;
for (let y=340; y<1300; y+=70){
  ctx.beginPath(); ctx.moveTo(280, y); ctx.lineTo(880 - (y*0.02), y); ctx.stroke();
}
window.__png = c.toDataURL('image/jpeg', 0.92);
</script>`;
}

// 거울/반사 흉내: 종이보다 크고 어두운(반사된 액자·거울테두리 느낌) 사각형을
// 종이 아래에 먼저 깔고, 그 안을 잡다한 반사 클러터로 채운다. "가장 큰 사각형"
// 규칙만 쓰면 이걸 종이로 오인한다.
const decoyExtra = `
ctx.fillStyle = '#26262e';
ctx.fillRect(90, 90, 1020, 1440);
for (let i=0;i<600;i++){
  ctx.strokeStyle = 'rgba(200,210,230,'+(0.05+Math.random()*0.15)+')';
  ctx.lineWidth = 1 + Math.random()*3;
  ctx.beginPath();
  ctx.moveTo(120+Math.random()*960, 120+Math.random()*1380);
  ctx.lineTo(120+Math.random()*960, 120+Math.random()*1380);
  ctx.stroke();
}
`;

const browser = await chromium.launch();

async function render(extra) {
  const page = await browser.newPage();
  await page.setContent(pageHtml(extra));
  await page.waitForFunction(() => typeof window.__png === 'string');
  const out = await page.evaluate(() => window.__png);
  await page.close();
  return out;
}

for (const [name, extra] of [['paper-on-desk', null], ['paper-with-decoy', decoyExtra]]) {
  const dataUrl = await render(extra);
  const b64 = dataUrl.split(',')[1];
  fs.writeFileSync(path.join(dir, `${name}.jpg`), Buffer.from(b64, 'base64'));
  fs.writeFileSync(
    path.join(dir, `${name}.json`),
    JSON.stringify({ width: W, height: H, corners }, null, 2),
  );
  console.log(`fixture written: ${name}.jpg`);
}

await browser.close();
