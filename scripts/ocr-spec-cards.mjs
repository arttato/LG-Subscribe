// อ่านตัวหนังสือจากรูปสเปคการ์ดสินค้า (โฟลเดอร์ สเปคการ์ด/) เพื่อหารุ่นสินค้าของแต่ละรูป
import fs from 'node:fs';
import path from 'node:path';
import { createWorker } from 'tesseract.js';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'สเปคการ์ด');
const files = fs.readdirSync(SRC).filter((f) => /\.jpe?g$/i.test(f)).sort();

const worker = await createWorker('tha+eng', 1, {
  logger: (m) => { if (m.status === 'recognizing text') process.stdout.write(`\r${Math.round(m.progress * 100)}% `); },
});

const out = [];
for (const file of files) {
  const src = path.join(SRC, file);
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
  const tmp = path.join(ROOT, 'scripts', `_ocr-spec.png`);
  fs.writeFileSync(tmp, c.toBuffer('image/png'));
  const { data } = await worker.recognize(tmp);
  fs.rmSync(tmp, { force: true });
  const text = data.text.replace(/\s+/g, ' ').trim();
  out.push({ file, text });
  console.log(`\n===== ${file} =====`);
  console.log(text.slice(0, 600) || '(ไม่พบข้อความ)');
}
await worker.terminate();
fs.writeFileSync(path.join(ROOT, 'scripts', 'spec-card-ocr.json'), JSON.stringify(out, null, 2));
console.log(`\n\nOCR เสร็จ ${out.length} รูป → scripts/spec-card-ocr.json`);
