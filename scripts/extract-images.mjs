// ดึงรูปสินค้าจาก PDF ต้นฉบับ → public/img/products/{slug}.jpg
// วิธี: อ่าน operator list ของแต่ละหน้า (ไม่ต้องเรนเดอร์ทั้งหน้า) ติดตาม CTM หา bounding box ของรูป
//       แล้วจับคู่กับแถบ y ของสินค้า (จาก products.json) ที่ทับซ้อนกันมากที่สุด
// ต้องรัน AFTER `npm run extract` (products.json มี srcPage/y/y2)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createCanvas, ImageData, Image } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFDocument, PDFName, PDFRef } from 'pdf-lib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTS_JSON = path.join(ROOT, 'src', 'data', 'products.json');
const OUT_DIR = path.join(ROOT, 'public', 'img', 'products');
const OPS = pdfjs.OPS;

const MIN_PX = 70; // รูปเล็กกว่านี้ (พิกเซล) ไม่พอใช้
const MAX_X_FRACTION = 0.78; // ต้องอยู่ไม่เกิน 78% ของความกว้างหน้า (กันแบนเนอร์ขวา)
const OVERLAP_MIN = 5; // ต้องทับซ้อนกับแถบสินค้าอย่างน้อย 5pt
const BAND_MARGIN = 25; // pt — ขยายแถบสินค้าลงล่างเล็กน้อย (ภาพสินค้าบางครั้งอยู่ใต้แถวสุดท้ายของ cluster เล็กน้อย เช่น XBOOM-BOUNCE 0.1pt, DFC533FV 18pt)

const mul = (a, b) => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

// รวบรวมรูปในหน้า: { oid, x0, x1, yTop, yBottom, w, h, pageW, raw }
async function collectPageImages(doc, pageNo, pdoc) {
  const page = await doc.getPage(pageNo); // pdf.js เป็น 1-based — srcPage ก็ 1-based
  const pageW = page.getViewport({ scale: 1 }).width;
  const rawDescs = await collectRawImages(pdoc, pageNo - 1); // pdf-lib เป็น 0-based
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
      const x0 = M[4];
      const x1 = M[4] + M[0];
      const yTop = Math.max(M[5], M[5] + M[3]);
      const yBottom = Math.min(M[5], M[5] + M[3]);
      let w = 0;
      let h = 0;
      let raw = null;
      if (oid) {
        try {
          const obj = await page.objs.get(oid);
          w = obj.width || 0;
          h = obj.height || 0;
        } catch {
          // pdf.js โหลด data ไม่ได้ (PDF quirk เช่น WD518) → จับคู่กับ raw XObject ด้วยตำแหน่ง
          raw = matchRawDesc(rawDescs, { x0, x1, yTop, yBottom });
          if (!raw) continue;
          w = raw.w;
          h = raw.h;
        }
      }
      imgs.push({ page, oid, x0, x1, yTop, yBottom, w, h, pageW, raw });
    }
  }
  return imgs;
}

// ถอดรหัส content stream (FlateDecode หรือ plain) — ต้องลอง inflate ก่อนเสมอ
// (ห้ามเช็คด้วย regex ก่อน: ข้อมูล compressed อาจมี byte "Do" ปนอยู่ → พลาดการขยาย)
function decodeContent(raw) {
  try {
    return zlib.inflateSync(Buffer.from(raw)).toString('latin1');
  } catch {
    return Buffer.from(raw).toString('latin1');
  }
}

// ---------- raw fallback: อ่านรูปจาก XObject โดยตรง (เมื่อ pdf.js โหลด data ไม่ได้) ----------
// oid ของ pdf.js (img_pX_N) ไม่เสถียร: รูปใน Form XObject ที่แชร์ระหว่างหน้า (เช่นแบนเนอร์) ถูกติดป้าย
// ด้วยหน้าแรกที่เจอ + เคาน์เตอร์แยก → ลำดับ N ใน oid จึงไม่ตรงกับตำแหน่ง Do ใน content stream เสมอไป
// วิธีที่ถูก: เดิน content stream ของหน้าเอง (pdf-lib, ติดตาม CTM ผ่าน q/Q/cm + แทรกลง Form แบบเรียกซ้ำ)
// หาตำแหน่งรูปจริง แล้วจับคู่กับตำแหน่งรูปใน operator list (pdf.js) ด้วยพื้นที่ทับซ้อนสูงสุด
const TOKEN_RE = /\/[A-Za-z0-9_.-]+|-?\d+(?:\.\d+)?|<<|>>|\[|\]|[A-Za-z]+/g;

// เดิน content stream (หน้า/ฟอร์ม) → รายการรูป XObject { name, x0, x1, yTop, yBottom, w, h }
function walkOps(s, res, ctx, out, M, stack) {
  const nums = [];
  let lastName = null;
  const tokens = s.match(TOKEN_RE) || [];
  for (const t of tokens) {
    if (/^-?\d/.test(t)) { nums.push(parseFloat(t)); continue; }
    if (t.startsWith('/')) { lastName = t.slice(1); continue; }
    if (t === 'q') { stack.push(M); nums.length = 0; }
    else if (t === 'Q') { M = stack.pop() || M; nums.length = 0; }
    else if (t === 'cm' && nums.length >= 6) { M = mul(M, nums.slice(-6)); nums.length = 0; }
    else if (t === 'Do' && lastName) {
      nums.length = 0;
      let obj = res?.get(PDFName.of('XObject'))?.get(PDFName.of(lastName));
      if (obj instanceof PDFRef) obj = ctx.lookup(obj);
      const d = obj?.dict || obj;
      // PDFName.toString() คืน "/Image"/"/Form" (มีสแลช) → ตัดออกก่อนเทียบ
      const subtype = d?.get(PDFName.of('Subtype'))?.toString()?.replace(/^\//, '');
      if (subtype === 'Image') {
        const w = d.get(PDFName.of('Width'))?.asNumber();
        const h = d.get(PDFName.of('Height'))?.asNumber();
        if (w && h) {
          out.push({ name: lastName, x0: M[4], x1: M[4] + M[0], yTop: Math.max(M[5], M[5] + M[3]), yBottom: Math.min(M[5], M[5] + M[3]), w, h });
        }
      } else if (subtype === 'Form') {
        const fm = d.get(PDFName.of('Matrix'))?.asArray?.() || [1, 0, 0, 1, 0, 0];
        const fRes = d.get(PDFName.of('Resources')) || res;
        const fC = d.get(PDFName.of('Contents'));
        const fits = fC?.asArray ? fC.asArray() : [fC];
        for (const it of fits) {
          if (!it) continue;
          walkOps(decodeContent(it.getContents?.() ?? it), fRes, ctx, out, mul(M, fm), []);
        }
      }
      lastName = null;
    }
  }
}

// เดินหน้าทั้งหน้า (pdf-lib 0-based) → รายการรูป XObject พร้อมตำแหน่ง
async function collectRawImages(pdoc, pageIdx) {
  const node = pdoc.getPage(pageIdx).node;
  const res = node.lookup(PDFName.of('Resources'));
  const contents = node.Contents?.();
  const out = [];
  if (!contents) return out;
  const items = contents.asArray ? contents.asArray() : [contents];
  for (const it of items) {
    if (!it) continue;
    walkOps(decodeContent(it.getContents?.() ?? it), res, pdoc.context, out, [1, 0, 0, 1, 0, 0], []);
  }
  return out;
}

// จับคู่รูปจาก operator list (pdf.js) กับรูป raw (pdf-lib) ด้วยพื้นที่ทับซ้อน
function matchRawDesc(descs, im) {
  let best = null;
  let bestScore = 0;
  for (const d of descs) {
    const ox = Math.min(d.x1, im.x1) - Math.max(d.x0, im.x0);
    const oy = Math.min(d.yTop, im.yTop) - Math.max(d.yBottom, im.yBottom);
    if (ox <= 0.5 || oy <= 0.5) continue;
    const score = ox * oy;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

// อ่าน XObject ตามชื่อแล้ววาดลง canvas (FlateDecode RGB/RGBA/Gray หรือ DCTDecode JPEG)
async function rawImageCanvasByName(pdoc, pageIdx, name) {
  const node = pdoc.getPage(pageIdx).node;
  const res = node.lookup(PDFName.of('Resources'));
  let ref = res.get(PDFName.of('XObject')).get(PDFName.of(name));
  const img = ref instanceof PDFRef ? pdoc.context.lookup(ref) : ref;
  const d = img.dict || img;
  const width = d.get(PDFName.of('Width'))?.asNumber();
  const height = d.get(PDFName.of('Height'))?.asNumber();
  const filter = d.get(PDFName.of('Filter'));
  if (!width || !height) {
    console.warn(`⚠️ raw fallback: /${name} ไม่มีขนาด`);
    return null;
  }

  let data = img.getContents();
  const filterName = filter ? filter.toString() : '';
  if (filterName.includes('FlateDecode')) data = zlib.inflateSync(data);
  if (filterName.includes('DCTDecode')) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    await new Promise((resolve, reject) => {
      const imgEl = new Image();
      imgEl.onload = () => {
        ctx.drawImage(imgEl, 0, 0);
        resolve();
      };
      imgEl.onerror = reject;
      imgEl.src = data;
    });
    return canvas;
  }

  const expected3 = width * height * 3;
  const expected4 = width * height * 4;
  if (data.length !== expected3 && data.length !== expected4) {
    console.warn(`⚠️ raw fallback: /${name} data ${data.length} ไบต์ ≠ ${expected3}/${expected4}`);
    return null;
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
    rgba[j] = data[i];
    rgba[j + 1] = data[i + 1];
    rgba[j + 2] = data[i + 2];
    rgba[j + 3] = 255;
  }
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas;
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
    const pdoc = await PDFDocument.load(fs.readFileSync(pdfPath), { ignoreEncryption: true });

    // 1) หาผู้สมัคร (candidate) ทั้งหมด: รูป + สินค้า ที่ทับซ้อนกัน
    const candidates = [];
    for (const p of list) {
      const key = `${file}#${p.srcPage}`;
      if (!cache.has(key)) cache.set(key, await collectPageImages(doc, p.srcPage, pdoc));
      for (const im of cache.get(key)) {
        if (im.w < MIN_PX || im.h < MIN_PX * 0.6) continue;
        if (im.x1 < 0 || im.x0 > im.pageW * MAX_X_FRACTION) continue;
        const overlap = Math.min(im.yTop, p.y) - Math.max(im.yBottom, p.y2 - BAND_MARGIN);
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
      let canvas = null;
      if (c.im.raw) {
        // pdf.js โหลด data ไม่ได้ → อ่าน XObject ตรงๆ จากหน้าเดียวกัน (จับคู่ด้วยตำแหน่ง)
        canvas = await rawImageCanvasByName(pdoc, c.p.srcPage - 1, c.im.raw.name);
      } else {
        try {
          const obj = await c.im.page.objs.get(c.im.oid);
          canvas = toCanvas(obj);
        } catch (e) {
          const desc = matchRawDesc(await collectRawImages(pdoc, c.p.srcPage - 1), c.im);
          if (desc) canvas = await rawImageCanvasByName(pdoc, c.p.srcPage - 1, desc.name);
        }
      }
      if (!canvas) continue;
      const out = path.join(OUT_DIR, `${c.p.slug}.jpg`);
      fs.writeFileSync(out, canvas.toBuffer('image/jpeg', { quality: 82 }));
      matched++;
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
