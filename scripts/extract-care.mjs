// นำรูปบริการดูแลจาก Care Service 2026.pdf ไปแปะที่สินค้าแต่ละตัว
// 1) เรนเดอร์หน้าบริการดูแล (3-25) → public/img/care/care-NN.png (ใช้ mupdf WASM — pdf.js render เครชบน Node 24)
// 2) จับคู่สินค้าทุกตัวกับหน้าที่ตรงกัน → src/data/care.json
// รัน: npm run care
import fs from 'node:fs';
import * as mupdf from 'mupdf';

const ROOT = process.cwd();
const PRODUCTS = JSON.parse(fs.readFileSync(`${ROOT}/src/data/products.json`, 'utf8'));
const OUT_DIR = `${ROOT}/public/img/care`;

// ── 1. เรนเดอร์หน้าบริการดูแล ──
const PAGES = Array.from({ length: 23 }, (_, i) => i + 3); // หน้า 3-25
const SCALE = 2;
const buf = new Uint8Array(fs.readFileSync(`${ROOT}/Care Service 2026.pdf`));
const doc = mupdf.Document.openDocument(buf, 'application/pdf');
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const p of PAGES) {
  const page = doc.loadPage(p - 1);
  const pix = page.toPixmap(mupdf.Matrix.scale(SCALE, SCALE), mupdf.ColorSpace.DeviceRGB, false, true);
  const png = Buffer.from(pix.asPNG());
  fs.writeFileSync(`${OUT_DIR}/care-${String(p).padStart(2, '0')}.png`, png);
}
console.log(`เรนเดอร์หน้าบริการดูแล ${PAGES.length} หน้า → public/img/care/`);

// ── 2. จับคู่สินค้า → หน้าบริการดูแล ──
const PAGE_TITLE = {
  3: 'บริการดูแลเครื่องกรองน้ำ',
  4: 'บริการดูแลเครื่องกรองน้ำ',
  5: 'บริการดูแลตู้เย็น',
  6: 'บริการดูแลตู้เย็นระบบต่อท่อน้ำ พร้อมชุดกรองน้ำ',
  9: 'บริการดูแลเครื่องซักผ้าและเครื่องอบผ้า',
  10: 'บริการดูแลเครื่องซักผ้าฝาหน้า',
  11: 'บริการดูแลเครื่องซักผ้าฝาบน',
  12: 'บริการดูแลเครื่องอบผ้า',
  14: 'บริการดูแลตู้ถนอมผ้า',
  15: 'บริการดูแลเครื่องดูดฝุ่น',
  17: 'บริการดูแลเครื่องฟอกอากาศ',
  18: 'บริการดูแลเครื่องฟอกอากาศ',
  19: 'บริการดูแลเครื่องฟอกอากาศ',
  22: 'บริการดูแลเครื่องลดความชื้น',
  23: 'บริการดูแลเครื่องล้างจาน',
  24: 'บริการดูแลเครื่องปรับอากาศ',
  25: 'บริการดูแลเครื่องปรับอากาศเชิงพาณิชย์',
};
// ตู้เย็นที่เดินท่อน้ำพร้อมชุดกรองน้ำ (หน้า 6 ของ Care Service ระบุรุ่นตระกูล X24, L24)
const FRIDGE_WATERLINE = new Set(['GC-X257CMHW.AEEPLMT', 'GC-L24FFCBB.AEVPLM1']);

function carePageOf(p) {
  const c = p.category || '';
  if (c.startsWith('เครื่องกรองน้ำ')) return 3;
  if (c.startsWith('เครื่องซักผ้า')) {
    if (p.code.startsWith('F')) return 10; // ฝาหน้า
    if (p.code.startsWith('T')) return 11; // ฝาบน
    return null;
  }
  if (c === 'เครื่องดูดฝุ่น') return 15;
  if (c === 'เครื่องปรับอากาศ') return 24; // แอร์บ้าน
  if (c.startsWith('เครื่องปรับอากาศ SAC')) return 25; // แอร์เชิงพาณิชย์
  if (c === 'เครื่องฟอกอากาศ') {
    if (p.code.startsWith('AS25GCBY0')) return 19; // AeroCat Tower
    if (p.code.startsWith('AS35GGW10')) return 18;
    return 17;
  }
  if (c === 'เครื่องลดความชื้น') return 22;
  if (c === 'เครื่องล้างจาน') return 23;
  if (c === 'เครื่องอบผ้า') return 12;
  if (c === 'ตู้ถนอมผ้า') return 14;
  if (c.startsWith('ตู้เย็น')) return FRIDGE_WATERLINE.has(p.code) ? 6 : 5;
  if (c === 'Wash Tower') return 9; // ซัก+อบ ในตู้เดียว
  return null; // ทีวี/จอ/ไมโครเวฟ/Sound bar — PDF ไม่มีหน้าบริการดูแล
}

const products = [];
let mapped = 0;
for (const p of PRODUCTS.products) {
  const page = carePageOf(p);
  products.push({ code: p.code, page, title: page ? PAGE_TITLE[page] : null });
  if (page) mapped++;
}
fs.writeFileSync(
  `${ROOT}/src/data/care.json`,
  JSON.stringify({ products, source: 'Care Service 2026.pdf', note: 'page = หน้าที่ render ใน public/img/care/care-NN.png' }, null, 2)
);
console.log(`จับคู่แล้ว ${mapped}/${PRODUCTS.products.length} รายการ → src/data/care.json`);
const none = products.filter((x) => !x.page).map((x) => x.code);
if (none.length) console.log(`ไม่มีหน้าบริการดูแลใน PDF (${none.length}):`, none.join(', '));
