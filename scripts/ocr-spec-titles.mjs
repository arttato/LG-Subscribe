// OCR เฉพาะแถบหัวเรื่อง (บนสุด) ของสเปคการ์ดบางรูปที่รุ่นยังไม่ชัด
import fs from 'node:fs';
import path from 'node:path';
import { createWorker } from 'tesseract.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'สเปคการ์ด');
const targets = process.argv.slice(2);
if (!targets.length) {
  console.log('usage: node scripts/ocr-spec-titles.mjs <file...>');
  process.exit(1);
}
const worker = await createWorker('tha+eng', 1, {});

for (const file of targets) {
  const src = path.join(SRC, file);
  const img = await loadImage(src);
  // แถบหัวเรื่อง: 20% บนสุด (ชื่อรุ่น + หัวข้อ) — หลายการ์ดมีหัวเรื่องแถวบน
  for (const band of [0.14, 0.30]) {
    const h = Math.round(img.height * band);
    const scale = 3;
    const c = createCanvas(img.width * scale, h * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, img.width, h, 0, 0, img.width * scale, h * scale);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      const v = g < 128 ? Math.max(0, g - 40) : Math.min(255, g + 50);
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(d, 0, 0);
    const tmp = path.join(ROOT, 'scripts', '_ocr-title.png');
    fs.writeFileSync(tmp, c.toBuffer('image/png'));
    const { data } = await worker.recognize(tmp);
    fs.rmSync(tmp, { force: true });
    console.log(`===== ${file} [band ${band}] =====`);
    console.log((data.text.replace(/\s+/g, ' ') || '(none)').slice(0, 300));
  }
}
await worker.terminate();
