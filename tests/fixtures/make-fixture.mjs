import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const W = 1200, H = 1600;

// 반듯한 종이 정답 모서리 (기울어진 사다리꼴).
const corners = {
  topLeft:     { x: 210, y: 190 },
  topRight:    { x: 980, y: 250 },
  bottomRight: { x: 930, y: 1410 },
  bottomLeft:  { x: 170, y: 1330 },
};

// 어려운 실제 사진 흉내용 종이 모서리 (더 크게 회전 + 원근).
const hardCorners = {
  topLeft:     { x: 380, y: 210 },
  topRight:    { x: 760, y: 300 },
  bottomRight: { x: 690, y: 1330 },
  bottomLeft:  { x: 250, y: 1180 },
};

const noise = (n, alpha) => `
for (let i=0;i<${n};i++){
  ctx.fillStyle = 'rgba(0,0,0,'+(Math.random()*${alpha})+')';
  ctx.fillRect(Math.random()*${W}, Math.random()*${H}, 2, 2);
}`;

const drawPaper = (k) => `
ctx.fillStyle = '#f7f5f0';
ctx.beginPath();
ctx.moveTo(${k.topLeft.x}, ${k.topLeft.y});
ctx.lineTo(${k.topRight.x}, ${k.topRight.y});
ctx.lineTo(${k.bottomRight.x}, ${k.bottomRight.y});
ctx.lineTo(${k.bottomLeft.x}, ${k.bottomLeft.y});
ctx.closePath(); ctx.fill();
ctx.strokeStyle = '#8892a0'; ctx.lineWidth = 6;
for (let y=340; y<1300; y+=70){ ctx.beginPath(); ctx.moveTo(280, y); ctx.lineTo(880 - (y*0.02), y); ctx.stroke(); }
`;

// name -> { body, corners|null }
const FIXTURES = {
  'paper-on-desk': { corners, body: `
    ctx.fillStyle = '#4a4038'; ctx.fillRect(0,0,${W},${H});
    ${noise(40000, 0.06)}
    ${drawPaper(corners)}
  ` },

  'paper-with-decoy': { corners, body: `
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
    ${drawPaper(corners)}
  ` },

  // 어려운 실제 사진 흉내: 어두운 배경 / ~13° 회전+원근 / 위아래 봉이 옆으로 삐져나옴 /
  // 굵은 붓글씨가 종이 가장자리까지 닿음 / 오른쪽 위에 어두운 그릇. minAreaRect 대체로 잡혀야.
  'paper-hard': { corners: hardCorners, body: `
    const k = ${JSON.stringify(hardCorners)};
    ctx.fillStyle = '#1b1f33'; ctx.fillRect(0,0,${W},${H});
    ${noise(30000, 0.05)}
    ctx.fillStyle = '#c33'; ctx.beginPath(); ctx.arc(120, 900, 8, 0, 7); ctx.fill();  // 책상 위 빨간 점
    // 종이
    ctx.fillStyle = '#f2efe6';
    ctx.beginPath();
    ctx.moveTo(k.topLeft.x, k.topLeft.y); ctx.lineTo(k.topRight.x, k.topRight.y);
    ctx.lineTo(k.bottomRight.x, k.bottomRight.y); ctx.lineTo(k.bottomLeft.x, k.bottomLeft.y);
    ctx.closePath(); ctx.fill();
    // 위/아래 금속 봉 (종이보다 옆으로 ~55px 삐져나옴)
    const roller = (x1,y1,x2,y2) => {
      const dx=x2-x1, dy=y2-y1, L=Math.hypot(dx,dy), ux=dx/L, uy=dy/L, nx=-uy, ny=ux;
      const ex1=x1-ux*55, ey1=y1-uy*55, ex2=x2+ux*55, ey2=y2+uy*55, t=17;
      ctx.fillStyle='#b9bcc4'; ctx.beginPath();
      ctx.moveTo(ex1-nx*t, ey1-ny*t); ctx.lineTo(ex2-nx*t, ey2-ny*t);
      ctx.lineTo(ex2+nx*t, ey2+ny*t); ctx.lineTo(ex1+nx*t, ey1+ny*t); ctx.closePath(); ctx.fill();
    };
    roller(k.topLeft.x, k.topLeft.y, k.topRight.x, k.topRight.y);
    roller(k.bottomLeft.x, k.bottomLeft.y, k.bottomRight.x, k.bottomRight.y);
    // 굵은 붓글씨 (종이 안쪽으로 클립, 일부는 가장자리에 닿게)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(k.topLeft.x, k.topLeft.y); ctx.lineTo(k.topRight.x, k.topRight.y);
    ctx.lineTo(k.bottomRight.x, k.bottomRight.y); ctx.lineTo(k.bottomLeft.x, k.bottomLeft.y);
    ctx.closePath(); ctx.clip();
    ctx.strokeStyle='#14161f'; ctx.lineCap='round';
    for (let i=0;i<26;i++){
      ctx.lineWidth = 14 + Math.random()*34;
      ctx.beginPath();
      ctx.moveTo(230+Math.random()*560, 240+Math.random()*1050);
      ctx.lineTo(230+Math.random()*560, 240+Math.random()*1050);
      ctx.stroke();
    }
    ctx.restore();
    // 오른쪽 위 어두운 그릇 (종이 밖, 실제 사진처럼 살짝 떨어져 있음)
    ctx.fillStyle='#10121c'; ctx.beginPath(); ctx.ellipse(950, 210, 120, 90, 0.2, 0, 7); ctx.fill();
    ctx.strokeStyle='#dfe2ea'; ctx.lineWidth=6; ctx.stroke();
  ` },

  'no-paper-drawing': { corners: null, body: `
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,${W},${H});
    ctx.fillStyle = '#111'; ctx.beginPath();
    const cx=600, cy=800; ctx.moveTo(cx+300, cy);
    for (let a=0;a<Math.PI*2;a+=0.15){ const r = 220 + Math.sin(a*5)*160 + Math.cos(a*3)*90;
      ctx.lineTo(cx+Math.cos(a)*r, cy+Math.sin(a)*r); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(520, 720, 40, 0, 7); ctx.arc(690, 720, 40, 0, 7); ctx.fill();
  ` },

  'no-paper-fullframe': { corners: null, body: `
    ctx.fillStyle = '#e8e8ec'; ctx.fillRect(0,0,${W},${H});
    ctx.fillStyle = '#c8c8d0'; ctx.fillRect(0,0,${W},110);
    ctx.fillStyle = '#555';
    for (let y=170; y<${H}-40; y+=54){ ctx.fillRect(60, y, 300 + Math.random()*760, 14); }
    for (let i=0;i<40;i++){
      ctx.strokeStyle = '#aab'; ctx.lineWidth = 2;
      ctx.strokeRect(60+Math.random()*1000, 150+Math.random()*1380, 40+Math.random()*120, 30+Math.random()*80);
    }
  ` },
};

const html = (body) => `<!doctype html><canvas id="c" width="${W}" height="${H}"></canvas><script>
const ctx = c.getContext('2d');
${body}
window.__png = c.toDataURL('image/jpeg', 0.92);
</script>`;

const browser = await chromium.launch();
for (const [name, { body, corners: k }] of Object.entries(FIXTURES)) {
  const page = await browser.newPage();
  await page.setContent(html(body));
  await page.waitForFunction(() => typeof window.__png === 'string');
  const dataUrl = await page.evaluate(() => window.__png);
  await page.close();
  fs.writeFileSync(path.join(dir, `${name}.jpg`), Buffer.from(dataUrl.split(',')[1], 'base64'));
  fs.writeFileSync(
    path.join(dir, `${name}.json`),
    JSON.stringify({ width: W, height: H, corners: k }, null, 2),
  );
  console.log(`fixture written: ${name}.jpg`);
}
await browser.close();
