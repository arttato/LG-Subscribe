// เติม gallery ให้รุ่นที่ extractor เดิมจับไม่ได้ (โครงสร้าง URL แบบเก่า)
// - ดึง URL gallery ทั้งหมด (flight strings + HTML ดิบ, unescape, ตัด jcr:content/renditions)
// - จับกลุ่มตาม "มุม" (angle key) แล้วเก็บขนาดใหญ่สุดต่อมุม (D/DZ/L/LM/2010 > M/medium > S/thumbnail)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fs = require('node:fs');
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

// มุมของภาพ — ลบโทเคนขนาด/ตัวแปรออก แล้วใช้เลขท้ายที่เหลือเป็นเลขมุม
// ครอบคลุม: gallery-01-2010, gallery-2010-01, thumbnail-06, S-1/DZ-1/MZ-1, medium01,
// 01-2010.jpg/01-350.jpg, 01-ms3032jas-front-450x450, basic_450_new_image ...
function angleKey(base) {
  let b = base.replace(/-new$/i, '');
  b = b.replace(/(?:gallery-2010|mobilezoom|thumbnail|basic-large|basic|zoom|large|small|medium)/gi, '');
  b = b.replace(/\d{3,4}x\d{3,4}/gi, ''); // 450x450, 1100x730
  b = b.replace(/[-_]?(?:2010|1600|1044|450|350|165|180)(?=[-_.]|$)/gi, ''); // -2010, _450, 350
  // ชื่อเป็นตัวเลขล้วน (260.jpg / 350.jpg / 450.jpg) หรือว่างหลังลบเลข → รูปหลัก มุม 0
  if (/^\d{3,4}$/.test(b) || b === '') return '0';
  // ชื่อแบบ 01-ms3032jas-front / 01-2010 / 02-1044 → มุมคือเลขแรก (ไม่ใช่เลขท้าย)
  const lead = b.match(/^(\d{1,3})-\D/);
  if (lead) return lead[1];
  const nums = b.match(/\d+/g);
  if (nums && nums.length) return nums[nums.length - 1];
  return base;
}

// คะแนนขนาด (เก็บคะแนนสูงสุดต่อมุม)
function sizeScore(u, base) {
  let s = 0;
  if (/\/gallery\//i.test(u)) s += 10;
  if (/\d{4}x\d{3,4}|[-_]?(?:2010|1600|1044)(?=[-_.]|$)/i.test(u)) s += 25; // 2010/1600/1044px ใหญ่สุด
  if (/\d{3}x\d{3,4}|[-_]?450(?=[-_.]|$)/i.test(u)) s += 10; // 450x450, -450
  if (/^DZ/i.test(base)) s += 12;
  if (/^(L|LM)/i.test(base)) s += 11;
  if (/^(D|MZ|M)/i.test(base)) s += 6;
  if (/^S-|thumbnail|mobilezoom|small|^S\b/i.test(base)) s -= 10;
  if (/^basic|^260-|^350-|[-_]?260|[-_]?350(?=[-_.]|$)/i.test(base)) s -= 5; // รูปเล็ก 260/350px
  return s;
}

function collectGallery(html, code) {
  const flight = extractFlightStrings(html).join('');
  const urls = [];
  // ครอบคลุมทั้ง /gallery/ (ใหม่) และ /image-update/, /th/images/ (แบบเก่า)
  const re = /"((?:https?:\/\/www\.lg\.com|\/)[^"]*\.(?:jpg|jpeg|png|webp))"/gi;
  for (const m of (flight + '\n' + html).matchAll(re)) {
    let u = m[1].replace(/\\\//g, '/');
    if (u.startsWith('/')) u = 'https://www.lg.com' + u;
    if (!/gallery|\/image-update\/|\/th\/images\//i.test(u)) continue;
    if (/\/conf\/|jcr:content\/renditions|thumbnail\.png/.test(u)) continue;
    // กรองโฟลเดอร์โฆษณา/สเปค (ทุกตำแหน่งใน path ไม่ใช่แค่ต้น)
    if (/\/(promotion|banner|gnb|birthday|campaign|internal|monthly|pdp-banner|spec|features)\//i.test(u)) continue;
    // กรองชื่อไฟล์โฆษณา/สเปค/thumb ที่ LG ใส่ปนใน gallery
    const fname = u.split('/').pop();
    if (/Monitor_|Pre-order|GNB|Influencer|Tech-Spec|specfication|^TH-|^350-|^thumb-|Dryer-EU|^ref-|^wd-|^AP-|^Dehumidifier_|Intro-D|best-water-dispenser|microinfluencer|^HA-|\(thumbnail\)/i.test(fname)) continue;
    urls.push(u);
  }
  // จับกลุ่มตามมุม เก็บขนาดใหญ่สุดต่อมุม
  const best = new Map();
  for (const u of urls) {
    const base = u.split('/').pop().replace(/\.(jpg|jpeg|png|webp)$/i, '');
    const key = angleKey(base);
    const prev = best.get(key);
    let sc = sizeScore(u, base);
    if (code && new RegExp(code.split('.')[0], 'i').test(u)) sc += 8; // รูปของรุ่นตัวเองได้คะแนนบวก
    if (!prev || sc > prev.score) best.set(key, { url: u, score: sc });
  }
  return [...best.entries()]
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
    .map(([, v]) => v.url);
}

const specs = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/lg-specs.json'), 'utf8')).products;
const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/products.json'), 'utf8')).products;
const galleryFile = path.join(ROOT, 'src/data/lg-gallery.json');
const gallery = JSON.parse(fs.readFileSync(galleryFile, 'utf8'));

const CODES = ['FV1413H4M.AMBPETH', 'TX2723ST5J.APBPETH', 'AS25GCBY0.ABAE', 'AS35GGW10.ATH',
  'DD23GMWE1S.ATH', 'MD19GQGA1.ATH', 'RV10VHP2B.BBLPETH', 'S3MFC.ALBPETH',
  'GN-F452PQAK.AEPPLMT', 'MS3032JAS.BBKPETH', 'WT1410NHEN.ABNPQTH', 'WT2520NHEN.ABNPETH'];

let ok = 0;
for (const code of CODES) {
  const spec = specs.find((s) => s.code === code);
  if (!spec) { console.log(`⏭️  ${code} — ไม่มีหน้า LG`); continue; }
  const r = await fetch(spec.url, { headers: { 'user-agent': UA, 'accept-language': 'th-TH,th;q=0.9,en;q=0.8' }, redirect: 'follow' });
  const html = await r.text();
  const urls = collectGallery(html, code);
  if (urls.length < 2) {
    console.log(`⏭️  ${code} — มุมไม่ซ้ำแค่ ${urls.length} (${urls.map((u) => u.split('/').pop()).join(', ')})`);
    continue;
  }
  const prod = products.find((p) => p.code === code);
  const entry = { code, slug: prod ? prod.slug : '', url: spec.url, images: urls };
  const existing = gallery.products.findIndex((g) => g.code === code);
  if (existing >= 0) gallery.products[existing] = entry;
  else gallery.products.push(entry);
  ok++;
  console.log(`✅ ${code} → ${urls.length} มุม: ${urls.map((u) => u.split('/').pop()).join(', ')}`);
}

fs.writeFileSync(galleryFile, JSON.stringify(gallery, null, 2));
console.log(`\nเขียนลง lg-gallery.json (${gallery.products.length} สินค้า, เติมสำเร็จ ${ok})`);
