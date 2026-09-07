import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

// 정답 모서리 (기울어진 사다리꼴)
const corners = {
  topLeft:     { x: 210, y: 190 },
  topRight:    { x: 980, y: 250 },
  bottomRight: { x: 930, y: 1410 },
  bottomLeft:  { x: 170, y: 1330 },
};

const html = `<!doctype html><canvas id="c" width="1200" height="1600"></canvas><script>
const ctx = c.getContext('2d');
// 배경: 회색 노이즈
ctx.fillStyle = '#7a6a55'; ctx.fillRect(0,0,1200,1600);
for (let i=0;i<40000;i++){
  ctx.fillStyle = 'rgba(0,0,0,'+(Math.random()*0.06)+')';
  ctx.fillRect(Math.random()*1200, Math.random()*1600, 2, 2);
}
// 종이: 흰 사각형
const k = ${JSON.stringify(corners)};
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

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html);
const dataUrl = await page.evaluate(() => window.__png);
await browser.close();

const b64 = dataUrl.split(',')[1];
fs.writeFileSync(path.join(dir, 'paper-on-desk.jpg'), Buffer.from(b64, 'base64'));
fs.writeFileSync(path.join(dir, 'paper-on-desk.json'), JSON.stringify({ width: 1200, height: 1600, corners }, null, 2));
console.log('fixture written');
