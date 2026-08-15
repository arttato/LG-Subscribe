// ดึงรูปสินค้าจาก PDF ต้นฉบับ → public/img/products/{slug}.jpg
// วิธี: อ่าน operator list ของแต่ละหน้า (ไม่ต้องเรนเดอร์ทั้งหน้า) ติดตาม CTM หา bounding box ของรูป
//       แล้วจับคู่กับแถบ y ของสินค้า (จาก products.json) ที่ทับซ้อนกันมากที่สุด
// ต้องรัน AFTER `npm run extract` (products.json มี srcPage/y/y2)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTS_JSON = path.join(ROOT, 'src', 'data', 'products.json');
const OUT_DIR = path.join(ROOT, 'public', 'img', 'products');
const OPS = pdfjs.OPS;

const MIN_PX = 70; // รูปเล็กกว่านี้ (พิกเซล) ไม่พอใช้
const MAX_X_FRACTION = 0.78; // ต้องอยู่ไม่เกิน 78% ของความกว้างหน้า (กันแบนเนอร์ขวา)
const OVERLAP_MIN = 5; // ต้องทับซ้อนกับแถบสินค้าอย่างน้อย 5pt

const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

// รวบรวมรูปในหน้า: { oid, x0, x1, yTop, yBottom, w, h, pageW }
async function collectPageImages(doc, pageNo) {
  const page = await doc.getPage(pageNo);
  const pageW = page.getViewport({ scale: 1 }).width;
  const opList = await page.getOperatorList();
  const stack = [];
  let M = [1, 0, 0, 1, 0, 0];
  const imgs = [];
  const { fnArray, argsArray } = opList;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i] || [];
    if (fn === OPS.save) stack.push(M);
    else if (fn === OPS.restore) M = stack.pop() || M;
    else if (fn === OPS.transform) M = mul(M, args);
    else if (
      fn === OPS.paintImageXObject ||
      fn === OPS.paintImageMaskXObject ||
      fn === OPS.paintJpegXObject ||
      fn === OPS.paintInlineImageXObject
    ) {
      const oid = typeof args[0] === 'string' ? args[0] : null;
      let w = 0;
      let h = 0;
      if (oid) {
        try {
          const obj = await page.objs.get(oid);
          w = obj.width || 0;
          h = obj.height || 0;
        } catch {
          continue;
        }
      }
      const y0 = M[5];
      const y1 = M[5] + M[3];
      imgs.push({ page, oid, x0: M[4], x1: M[4] + M[0], yTop: Math.max(y0, y1), yBottom: Math.min(y0, y1), w, h, pageW });
    }
  }
  return imgs;
}

// แปลง data (RGB/RGBA/Gray) → RGBA แล้ววาดลง canvas
function toCanvas(imgData) {
  const { width, height, data } = imgData;
  const len = data.length;
  const expected4 = width * height * 4;
  const expected3 = width * height * 3;
  const expected1 = width * height;
  let rgba;
  if (len === expected4) {
    rgba = data;
  } else if (len === expected3) {
    rgba = new Uint8ClampedArray(expected4);
    for (let i = 0, j = 0; i < expected3; i += 3, j += 4) {
      rgba[j] = data[i];
      rgba[j + 1] = data[i + 1];
      rgba[j + 2] = data[i + 2];
      rgba[j + 3] = 255;
    }
  } else if (len === expected1) {
    rgba = new Uint8ClampedArray(expected4);
    for (let i = 0, j = 0; i < expected1; i++, j += 4) {
      const v = data[i];
      rgba[j] = v;
      rgba[j + 1] = v;
      rgba[j + 2] = v;
      rgba[j + 3] = 255;
    }
  } else {
    return null;
  }
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas;
}

async function main() {
  const { products } = JSON.parse(fs.readFileSync(PRODUCTS_JSON, 'utf8'));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const byFile = new Map();
  for (const p of products) {
    if (!byFile.has(p.source)) byFile.set(p.source, []);
    byFile.get(p.source).push(p);
  }

  // รูปต่อ (ไฟล์, หน้า)
  const cache = new Map();
  let matched = 0;
  const noImg = [];

  for (const [file, list] of byFile) {
    const pdfPath = path.join(ROOT, 'pdfs', file);
    if (!fs.existsSync(pdfPath)) {
      console.warn(`⚠️ ไม่พบ ${pdfPath} — ข้าม`);
      continue;
    }
    const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)) }).promise;

    // 1) หาผู้สมัคร (candidate) ทั้งหมด: รูป + สินค้า ที่ทับซ้อนกัน
    const candidates = [];
    for (const p of list) {
      const key = `${file}#${p.srcPage}`;
      if (!cache.has(key)) cache.set(key, await collectPageImages(doc, p.srcPage));
      for (const im of cache.get(key)) {
        if (im.w < MIN_PX || im.h < MIN_PX * 0.6) continue;
        if (im.x1 < 0 || im.x0 > im.pageW * MAX_X_FRACTION) continue;
        const overlap = Math.min(im.yTop, p.y) - Math.max(im.yBottom, p.y2);
        if (overlap < OVERLAP_MIN) continue;
        candidates.push({ p, im, overlap, score: overlap * 1000 + (1000 - Math.min(im.x0, 1000)) });
      }
    }

    // 2) greedy: จับคู่ overlap มากสุดก่อน (รูปซ้ายก่อนเมื่อคะแนนเท่ากัน) — รูปหนึ่งใช้กับสินค้าตัวเดียว
    // หมายเหตุ: PDF ใช้ XObject รูปเดียวกันซ้ำหลายตำแหน่ง (oid ซ้ำ เช่น img_p43_2 ×3) → คีย์ต้องรวมตำแหน่ง (หน้า+oid+x0+yTop)
    candidates.sort((a, b) => b.score - a.score);
    const usedImgs = new Set();
    const usedProducts = new Set();
    for (const c of candidates) {
      const imgKey = `${c.p.srcPage}#${c.im.oid}#${c.im.x0.toFixed(1)}#${c.im.yTop.toFixed(1)}`;
      if (usedImgs.has(imgKey) || usedProducts.has(c.p.code)) continue;
      usedImgs.add(imgKey);
      usedProducts.add(c.p.code);
      try {
        const obj = await c.im.page.objs.get(c.im.oid);
        const canvas = toCanvas(obj);
        if (!canvas) continue;
        const out = path.join(OUT_DIR, `${c.p.slug}.jpg`);
        fs.writeFileSync(out, canvas.toBuffer('image/jpeg', { quality: 82 }));
        matched++;
      } catch (e) {
        console.warn(`⚠️ วาดรูปไม่สำเร็จ ${c.p.code}: ${e.message}`);
      }
    }
  }

  // 3) รายงานตัวที่ไม่มีรูป
  const withImg = new Set();
  for (const f of fs.readdirSync(OUT_DIR)) withImg.add(f.replace(/\.jpg$/, ''));
  for (const p of products) {
    if (!withImg.has(p.slug)) noImg.push(`${p.code} (หน้า ${p.srcPage})`);
  }

  console.log(`\n✅ บันทึกรูป ${matched} ใบ ลง public/img/products/`);
  console.log(`ยังไม่มีรูปใน PDF (${noImg.length}/${products.length}):`);
  for (const n of noImg) console.log('   -', n);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
