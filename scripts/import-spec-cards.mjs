// นำเข้าสเปคการ์ดสินค้า (โฟลเดอร์ สเปคการ์ด/) → public/img/specs/ + src/data/spec-cards.json
// จับคู่รุ่นจากผล OCR (scripts/spec-card-ocr.json) — ตรวจสอบกับแคตตาล็อกแล้ว (ส.ค. 2569)
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'สเปคการ์ด');
const DST = path.join(ROOT, 'public', 'img', 'specs');
fs.mkdirSync(DST, { recursive: true });

// file → ครอบครัวสินค้า (family = prefix ก่อน '.' ใน products.json)
// การ์ดแบบเปรียบเทียบหลายรุ่น → แสดงกับทุกรุ่นที่อยู่ในตาราง
const MAP = {
  'LINE_ALBUM_Dishwasher🍽️_260816_1.jpg': ['DFC335HM'],
  'LINE_ALBUM_Dishwasher🍽️_260816_2.jpg': ['DFC533FV'],
  'LINE_ALBUM_Stand by ME2 Max_260816_1.jpg': ['27LX6TDGA', '32LX6BDGA'],
  'LINE_ALBUM_Stand by ME2 Max_260816_2.jpg': ['32LX6BDGA'],
  'LINE_ALBUM_ทีวี_260816_1.jpg': ['27LX6TDGA'],
  'LINE_ALBUM_ลำโพงซาวด์บาร์_260816_1.jpg': ['S95TR'],
  'LINE_ALBUM_ลำโพงซาวด์บาร์_260816_2.jpg': ['S70TY'],
  'LINE_ALBUM_ลำโพงซาวด์บาร์_260816_3.jpg': ['XBOOM-BOUNCE'],
  'LINE_ALBUM_ลำโพงซาวด์บาร์_260816_4.jpg': ['XBOOM-GRAB'],
  'LINE_ALBUM_เครื่องกรองน้ำ_260816_1.jpg': ['WD110MN'],
  'LINE_ALBUM_เครื่องกรองน้ำ_260816_2.jpg': ['WD516'],
  'LINE_ALBUM_เครื่องกรองน้ำ_260816_3.jpg': ['WD518'],
  'LINE_ALBUM_เครื่องกรองน้ำ_260816_4.jpg': ['WD518'],
  'LINE_ALBUM_เครื่องกรองน้ำ_260816_5.jpg': ['WD516'],
  'LINE_ALBUM_เครื่องกรองน้ำ_260816_6.jpg': ['WD516', 'WD518'],
  'LINE_ALBUM_เครื่องซักผ้า  อบผ้า  ตู้ถนอมผ้า_260816_1.jpg': ['WT2520NHEG'],
  'LINE_ALBUM_เครื่องซักผ้า  อบผ้า  ตู้ถนอมผ้า_260816_2.jpg': ['WT2520NHEG'],
  'LINE_ALBUM_เครื่องซักผ้า  อบผ้า  ตู้ถนอมผ้า_260816_3.jpg': ['S3MFC'],
  'LINE_ALBUM_เครื่องซักผ้า  อบผ้า  ตู้ถนอมผ้า_260816_4.jpg': ['WT1410NHEG'],
  'LINE_ALBUM_เครื่องซักผ้า  อบผ้า  ตู้ถนอมผ้า_260816_5.jpg': ['WT1410NHEG'],
  'LINE_ALBUM_เครื่องซักผ้า  อบผ้า  ตู้ถนอมผ้า_260816_6.jpg': ['WT2116SHEG'],
  'LINE_ALBUM_เครื่องซักผ้า  อบผ้า  ตู้ถนอมผ้า_260816_7.jpg': ['FV1413H4M'],
  'LINE_ALBUM_เครื่องซักผ้า  อบผ้า  ตู้ถนอมผ้า_260816_8.jpg': ['F2520RNTB'],
  'LINE_ALBUM_เครื่องซักผ้า  อบผ้า  ตู้ถนอมผ้า_260816_9.jpg': ['TX2723ST5J'],
  'LINE_ALBUM_เครื่องดูดฝุ่น_260816_1.jpg': ['A9T-ULTRA'],
  'LINE_ALBUM_เครื่องดูดฝุ่น_260816_2.jpg': ['A9T-ULTRA'],
  'LINE_ALBUM_เครื่องดูดฝุ่น_260816_3.jpg': ['A9T-LITE'],
  'LINE_ALBUM_เครื่องดูดฝุ่น_260816_4.jpg': ['A9T-CORE', 'A9T-LITE', 'A9T-ULTRA'],
  'LINE_ALBUM_เครื่องฟอกอากาศ_260816_1.jpg': ['AS10GDBY0'],
  'LINE_ALBUM_เครื่องฟอกอากาศ_260816_2.jpg': ['AS10GDBY0', 'AS65GDBY0'],
  'LINE_ALBUM_เครื่องฟอกอากาศ_260816_3.jpg': ['AS60GHWG0', 'AS65GDBY0'],
  'LINE_ALBUM_เครื่องฟอกอากาศ_260816_4.jpg': ['AS60GHWG0'],
  'LINE_ALBUM_เครื่องลดความชื้น_260816_1.jpg': ['DD23GMWE1S'],
  'LINE_ALBUM_เครื่องลดความชื้น_260816_2.jpg': ['MD19GQGA1'],
  'LINE_ALBUM_เสป็คตู้เย็น Exclusive Model_260816_1.jpg': ['GC-B48FPGAM'],
  'LINE_ALBUM_แอร์_260816_1.jpg': ['ART13A', 'ART18A'],
  'LINE_ALBUM_แอร์_260816_2.jpg': ['SAQ11A', 'SAQ13A', 'SAQ18B', 'SAQ24B'],
  'LINE_ALBUM_แอร์_260816_3.jpg': ['SIQ11B', 'SIQ13B', 'SIQ18B', 'SIQ24B'],
  'LINE_ALBUM_แอร์_260816_4.jpg': ['IXY11A', 'IXY13A', 'IXY18A', 'IXY24A'],
  'LINE_ALBUM_ตู้เย็น_260816_2.jpg': ['GC-G24FFQKB'],
  'LINE_ALBUM_ตู้เย็น_260816_4.jpg': ['GC-L24FFCBB'],
  'LINE_ALBUM_ตู้เย็น_260816_5.jpg': ['GN-V389FQEF'],
  'LINE_ALBUM_ตู้เย็น_260816_6.jpg': ['GV-V25FFGRB'],
  'LINE_ALBUM_ตู้เย็น_260816_7.jpg': ['GV-V25FFGRB'],
  'LINE_ALBUM_ตู้เย็น_260816_8.jpg': ['GC-X257CMEW'],
  'LINE_ALBUM_ตู้เย็น_260816_9.jpg': ['GC-J257SQZW'],
  'LINE_ALBUM_ตู้เย็น_260816_10.jpg': ['GC-L257KQKW'],
  'LINE_ALBUM_ตู้เย็น_260816_11.jpg': ['GC-B257SQYL'],
  'LINE_ALBUM_ตู้เย็น_260816_13.jpg': ['GC-V22FFQMB'],
  'LINE_ALBUM_ตู้เย็น_260816_14.jpg': ['GN-F452PQAK'],
  'LINE_ALBUM_ตู้เย็น_260816_15.jpg': ['GN-F392PQAK'],
};
// ไฟล์ที่ไม่มีในแคตตาล็อก (รุ่นไม่อยู่ในสินค้า ส.ค. 2569) — ข้าม ไม่คัดลอก
const SKIP_NOTE = {
  'LINE_ALBUM_ตู้เย็น_260816_1.jpg': 'GN-304SLBR (ตู้แช่แข็ง) ไม่มีในแคตตาล็อก',
  'LINE_ALBUM_ตู้เย็น_260816_3.jpg': 'GC-X24FFCRB ไม่มีในแคตตาล็อก',
  'LINE_ALBUM_ตู้เย็น_260816_12.jpg': 'GC-V24FFCHB ไม่มีในแคตตาล็อก',
  'LINE_ALBUM_เสป็คตู้เย็น Exclusive Model_260816_2.jpg': 'GC-B50FPGAM ไม่มีในแคตตาล็อก',
  'LINE_ALBUM_เครื่องซักผ้า  อบผ้า  ตู้ถนอมผ้า_260816_10.jpg': 'TX2725AT9G ไม่มีในแคตตาล็อก',
};

const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'products.json'), 'utf8')).products;
const famOf = (code) => code.split('.')[0];
const fams = new Set(products.map((p) => famOf(p.code)));

const out = new Map(); // family -> array of filenames
const files = fs.readdirSync(SRC).filter((f) => /\.jpe?g$/i.test(f));
let copied = 0;
for (const f of files) {
  if (SKIP_NOTE[f]) {
    console.log(`⏭  ${f} — ${SKIP_NOTE[f]}`);
    continue;
  }
  const families = MAP[f];
  if (!families) {
    console.log(`⚠  ไม่มี mapping: ${f}`);
    continue;
  }
  // ตรวจว่า family มีในแคตตาล็อกไหม
  const missing = families.filter((fm) => !fams.has(fm));
  if (missing.length) {
    console.log(`⚠  family ไม่พบในแคตตาล็อก: ${f} → ${missing.join(', ')}`);
    continue;
  }
  const ext = path.extname(f);
  const num = (f.match(/_260816_(\d+)\.jpg$/) || [])[1] || '1';
  // hash สั้นจากชื่อไฟล์เดิมกันชื่อชนกัน (เช่น ทีวี กับ StanbyME ต่างก็ได้ -1)
  const h = createHash('md5').update(f).digest('hex').slice(0, 4);
  const dstName = `spec-${families[0]}-${num}-${h}${ext}`;
  fs.copyFileSync(path.join(SRC, f), path.join(DST, dstName));
  copied++;
  for (const fm of families) {
    if (!out.has(fm)) out.set(fm, []);
    out.get(fm).push(dstName);
  }
  console.log(`✓ ${f} → ${dstName}  (${families.join(', ')})`);
}

const specCards = {
  source: 'โฟลเดอร์ สเปคการ์ด/ (LINE_ALBUM ... 260816)',
  note: 'สเปคการ์ดสินค้า — รูปถ่ายจากเอกสารฝึกอบรมของ LG จับคู่รุ่นโดย OCR + ตรวจกับแคตตาล็อก',
  products: [...out.entries()].map(([code, images]) => ({ code, images })),
};
fs.writeFileSync(path.join(ROOT, 'src', 'data', 'spec-cards.json'), JSON.stringify(specCards, null, 2));
console.log(`\nคัดลอก ${copied}/${files.length} รูป → public/img/specs/`);
console.log(`spec-cards.json: ${specCards.products.length} ครอบครัว`);
