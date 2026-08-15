// Re-fetch gallery สำหรับรุ่นที่ extractor เดิมจับมุมไม่ครบ
// (fetch-lg-gallery.mjs ตรวจ gallery แค่ในโฟลเดอร์ → พลาดรุ่นที่ URL อยู่ใน /th/images/ หรือมี gallery ในชื่อไฟล์)
// ใช้ collectGallery แบบ robust (เหมือน fill-missing-galleries) + กรอง feature ของรุ่นอื่น
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0';

function extractFlightStrings(html) {
  const out = [];
  const re = /self\.__next_f\.push\(\[1,/g;
  let m;
  while ((m = re.exec(html))) {
    const q = html.indexOf('"', m.index + m[0].length);
    if (q === -1) continue;
    let i = q + 1, raw = '';
    while (i < html.length) {
      const c = html[i];
      if (c === '\\') { raw += c + (html[i + 1] ?? ''); i += 2; continue; }
      if (c === '"') break;
      raw += c; i++;
    }
    try { out.push(JSON.parse('"' + raw + '"')); } catch { }
  }
  return out;
}

// มุมของภาพ — ลบโทเคนขนาด/ตัวแปร แล้วใช้เลขท้ายเป็นมุม (เหมือน fill-missing-galleries)
function angleKey(base) {
  let b = base.replace(/-new$/i, '');
  b = b.replace(/(?:gallery-2010|mobilezoom|thumbnail|basic-large|basic|zoom|large|small|medium)/gi, '');
  b = b.replace(/\d{3,4}x\d{3,4}/gi, '');
  b = b.replace(/[-_]?(?:2010|1600|1044|450|350|165|180)(?=[-_.]|$)/gi, '');
  if (/^\d{3,4}$/.test(b) || b === '') return '0';
  const lead = b.match(/^(\d{1,3})-\D/);
  if (lead) return lead[1];
  const nums = b.match(/\d+/g);
  if (nums && nums.length) return nums[nums.length - 1];
  return base;
}

function sizeScore(u, base) {
  let s = 0;
  if (/\/gallery\//i.test(u)) s += 10;
  if (/\d{4}x\d{3,4}|[-_]?(?:2010|1600|1044)(?=[-_.]|$)/i.test(u)) s += 25;
  if (/\d{3}x\d{3,4}|[-_]?450(?=[-_.]|$)/i.test(u)) s += 10;
  if (/^DZ/i.test(base)) s += 12;
  if (/^(L|LM)/i.test(base)) s += 11;
  if (/^(D|MZ|M)/i.test(base)) s += 6;
  if (/^S-|thumbnail|mobilezoom|small|^S\b|-s-\d+(?:-new)?$/i.test(base)) s -= 10; // s95tr-s-2-new = thumb
  if (/^basic|^260-|^350-|[-_]?260|[-_]?350(?=[-_.]|$)/i.test(base)) s -= 5;
  return s;
}

// เก็บ URL gallery ทั้งหมดจากหน้า (กรองโฆษณา/สเปค) — ครอบคลุมโฟลเดอร์ + ชื่อไฟล์ที่มี gallery
// โน้ต: ชื่อไฟล์ของรุ่นตัวเองบางรุ่นขึ้นต้นด้วย ref-/TH-/thumb- (เช่น ref-f-next8-gc-v22ffqmb-thumbnail-01)
//       → ถ้ามีรหัสของรุ่นตัวเองใน path ให้เก็บไว้เสมอ ยกเว้นโฆษณาชัดเจน
function collectGallery(html, code) {
  const flight = extractFlightStrings(html).join('');
  const codeKey = (code || '').split('.')[0].toLowerCase();
  const urls = [];
  const re = /"((?:https?:)?[^"]*?\.(?:jpg|jpeg|png|webp))"/gi;
  for (const m of (flight + '\n' + html).matchAll(re)) {
    let u = m[1].replace(/\\\//g, '/');
    if (u.startsWith('/')) u = 'https://www.lg.com' + u;
    if (!/gallery|\/image-update\/|\/th\/images\//i.test(u)) continue;
    if (/\/conf\/|jcr:content\/renditions|thumbnail\.png/.test(u)) continue;
    if (/\/(promotion|banner|gnb|birthday|campaign|internal|monthly|pdp-banner|spec|features)\//i.test(u)) continue;
    const fname = u.split('/').pop();
    const isOwn = codeKey && u.toLowerCase().includes(codeKey);
    if (isOwn) {
      // ของรุ่นตัวเอง — กรองเฉพาะโฆษณา/สเปคชัดๆ
      if (/Monitor_|Pre-order|GNB|Influencer|Tech-Spec|specfication|Intro-D|best-water-dispenser|microinfluencer/i.test(fname)) continue;
    } else {
      if (/Monitor_|Pre-order|GNB|Influencer|Tech-Spec|specfication|^TH-|^350-|^thumb-|Dryer-EU|^ref-|^wd-|^AP-|^Dehumidifier_|Intro-D|best-water-dispenser|microinfluencer|^HA-|\(thumbnail\)/i.test(fname)) continue;
    }
    urls.push(u);
  }
  // จับกลุ่มตามมุม เก็บขนาดใหญ่สุดต่อมุม
  const best = new Map();
  for (const u of urls) {
    const base = u.split('/').pop().replace(/\.(jpg|jpeg|png|webp)$/i, '');
    let key = angleKey(base);
    if (/^\d+$/.test(key)) key = String(parseInt(key, 10)); // 01 → 1
    const prev = best.get(key);
    const sc = sizeScore(u, base);
    if (!prev || sc > prev.score) best.set(key, { url: u, score: sc });
  }
  return [...best.entries()]
    .sort((a, b) => {
      const na = parseInt(a[0], 10);
      const nb = parseInt(b[0], 10);
      if (Number.isNaN(na) && Number.isNaN(nb)) return a[0].localeCompare(b[0]);
      if (Number.isNaN(na)) return 1;
      if (Number.isNaN(nb)) return -1;
      return na - nb;
    })
    .map(([, v]) => v.url);
}

const galleryFile = path.join(ROOT, 'src/data/lg-gallery.json');
const gallery = JSON.parse(fs.readFileSync(galleryFile, 'utf8'));
const specs = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/lg-specs.json'), 'utf8')).products;
const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/products.json'), 'utf8')).products;

// รุ่นที่ audit เจอว่าขาดมุม (ตัวเลข = จำนวนมุมที่คาดว่าควรได้จากหน้า)
const TARGETS = [
  'WT1410NHEG.ABGPQTH', '27LX6TDGA.ATM', '40U990A-W.ATM', 'GC-L24FFCBB.AEVPLM1',
  'GC-X257CMHW.AEEPLMT', 'S95TR.DTHALLK', 'GC-G24FFQKB.AEEPLM1', 'GC-V22FFQMB.AEPPLMT',
];

for (const code of TARGETS) {
  const spec = specs.find((s) => s.code === code);
  if (!spec) { console.log(`SKIP ${code} — ไม่มีหน้า`); continue; }
  const r = await fetch(spec.url, { headers: { 'user-agent': UA, 'accept-language': 'th-TH,th;q=0.9,en;q=0.8' }, redirect: 'follow' });
  const html = await r.text();
  const urls = collectGallery(html, code);
  // กรอง feature/ภาพของรุ่นอื่น: เก็บเฉพาะ URL ที่ path/ชื่อมีรหัสของรุ่นตัวเอง (ถ้ามีของตัวเองเพียงพอ)
  const codeKey = code.split('.')[0].toLowerCase();
  const own = urls.filter((u) => u.toLowerCase().includes(codeKey));
  const final = own.length >= 3 ? own : urls; // ถ้ารุ่นตัวเองไม่พอ ใช้ทั้งหมด
  const prod = products.find((p) => p.code === code);
  const entry = { code, slug: prod ? prod.slug : '', url: spec.url, images: final };
  const idx = gallery.products.findIndex((g) => g.code === code);
  if (idx >= 0) gallery.products[idx] = entry;
  else gallery.products.push(entry);
  console.log(`${code}: ได้ ${final.length} มุม (ทั้งหมด ${urls.length}, ของรุ่นเอง ${own.length})`);
  final.forEach((u) => console.log('   ', u.split('/').pop()));
}

fs.writeFileSync(galleryFile, JSON.stringify(gallery, null, 2));
console.log(`\nเขียนลง lg-gallery.json (${gallery.products.length} สินค้า)`);
