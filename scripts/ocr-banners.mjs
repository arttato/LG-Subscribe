// อ่านตัวหนังสือจาก banner โปรโมชัน (ใช้เมื่อเดือนหน้า LG เปลี่ยนสไลด์ใหม่ — สไลด์ใหม่ใน
// src/data/banners.json จะมี title ว่าง ให้รันสคริปต์นี้เพื่ออ่านข้อความ แล้วเอาไปใส่ title)
import fs from 'node:fs';
import path from 'node:path';
import { createWorker } from 'tesseract.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BANNERS = path.join(ROOT, 'public', 'img', 'banners');
const files = fs.readdirSync(BANNERS).filter((f) => /^banner-\d+\.jpg$/.test(f)).sort();

if (!files.length) {
  console.log('ไม่พบ banner ใน public/img/banners/ — รัน npm run banners ก่อน');
  process.exit(0);
}

const worker = await createWorker('tha+eng', 1, {
  logger: (m) => { if (m.status === 'recognizing text') process.stdout.write(`\r${Math.round(m.progress * 100)}%`); },
});

for (const file of files) {
  const src = path.join(BANNERS, file);
  const img = await loadImage(src);
  const scale = 2;
  const c = createCanvas(img.width * scale, img.height * scale);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, img.width * scale, img.height * scale);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const v = g < 128 ? Math.max(0, g - 30) : Math.min(255, g + 40);
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(d, 0, 0);
  const tmp = path.join(ROOT, 'scripts', `_ocr-${file.replace(/\.jpg$/, '')}.png`);
  fs.writeFileSync(tmp, c.toBuffer('image/png'));
  const { data } = await worker.recognize(tmp);
  console.log(`\n\n===== ${file} =====`);
  console.log(data.text.trim().replace(/\n{2,}/g, '\n') || '(ไม่พบข้อความ)');
  fs.rmSync(tmp, { force: true });
}
await worker.terminate();
console.log('\n\nเอาเฉพาะบรรทัดที่เป็นหัวข้อโปรโมชันไปใส่ title ใน src/data/banners.json');
