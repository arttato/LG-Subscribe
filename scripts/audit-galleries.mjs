// ตรวจเทียบ gallery ที่เรามี vs หน้า LG จริงทีละรุ่น
// - fetch หน้า LG ทุกหน้า (91) หา URL gallery ทั้งหมด (แบบใหม่ gallery/ + แบบเก่า image-update/th-images)
// - เทียบกับ lg-gallery.json: หา (A) รูปในไฟล์ของเราที่หน้า LG ไม่มีแล้ว (เก่า/ผิดรุ่น) (B) มุมที่ LG มีแต่เราไม่มี
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0';

const gallery = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/lg-gallery.json'), 'utf8')).products;
const specs = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/lg-specs.json'), 'utf8')).products;
const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/products.json'), 'utf8')).products;

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

// คัด URL gallery ที่ "ควรเป็นของรุ่นนี้" ออกจากหน้า (กรองโฆษณา/สเปค/feature รุ่นอื่น)
function collectGallery(html, code) {
  const flight = extractFlightStrings(html).join('');
  const urls = [];
  const re = /"((?:https?:)?[^"]*?\.(?:jpg|jpeg|png|webp))"/gi;
  for (const m of (flight + '\n' + html).matchAll(re)) {
    let u = m[1].replace(/\\\//g, '/');
    if (u.startsWith('/')) u = 'https://www.lg.com' + u;
    if (!/gallery|\/image-update\/|\/th\/images\//i.test(u)) continue;
    if (/\/conf\/|jcr:content\/renditions|thumbnail\.png/.test(u)) continue;
    if (/\/(promotion|banner|gnb|birthday|campaign|internal|monthly|pdp-banner|spec|features)\//i.test(u)) continue;
    const fname = u.split('/').pop();
    if (/Monitor_|Pre-order|GNB|Influencer|Tech-Spec|specfication|^TH-|^350-|^thumb-|Dryer-EU|^ref-|^wd-|^AP-|^Dehumidifier_|Intro-D|best-water-dispenser|microinfluencer|^HA-|\(thumbnail\)/i.test(fname)) continue;
    urls.push(u);
  }
  return urls;
}

// หา "มุม" (key) ของ URL — เหมือน fill-missing-galleries
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
const baseName = (u) => u.split('/').pop().replace(/\.(jpg|jpeg|png|webp)$/i, '');

// คีย์สำหรับเทียบ: ชื่อไฟล์ (ไม่รวมขนาด) — ใช้จับคู่ว่ามุมเดียวกันไหม
function fileKey(u) {
  let b = baseName(u).toLowerCase();
  b = b.replace(/(?:gallery-2010|mobilezoom|thumbnail|basic-large|basic|zoom|large|small|medium|front|main|view|product)/gi, '');
  b = b.replace(/\d{3,4}x\d{3,4}|[-_]?(?:2010|1600|1044|450|350|260|165|180)(?=[-_.]|$)/gi, '');
  b = b.replace(/-new$/i, '');
  b = b.replace(/[^a-z0-9]/g, '');
  return b;
}

const byCode = new Map(specs.map((s) => [s.code, s]));
const results = [];
let i = 0;
for (const g of gallery) {
  i++;
  const spec = byCode.get(g.code);
  if (!spec) { results.push({ code: g.code, status: 'no-page' }); continue; }
  let html;
  try {
    const r = await fetch(spec.url, { headers: { 'user-agent': UA, 'accept-language': 'th-TH,th;q=0.9,en;q=0.8' }, redirect: 'follow' });
    html = await r.text();
  } catch (e) {
    results.push({ code: g.code, status: 'fetch-fail', error: e.message });
    continue;
  }
  const onPage = collectGallery(html, g.code);
  const pageKeys = new Set(onPage.map(fileKey));
  const pageAngles = new Set(onPage.map((u) => angleKey(baseName(u))));

  // (A) รูปของเราที่หน้า LG ไม่มี (key ไม่เจอบนหน้า)
  const stale = g.images.filter((u) => !pageKeys.has(fileKey(u)));
  // (B) มุมที่ LG มี (บนหน้า) แต่เราไม่ได้ (นับมุมที่เราไม่มีเลย)
  const myAngles = new Set(g.images.map((u) => angleKey(baseName(u))));
  const missingAngles = [...pageAngles].filter((a) => !myAngles.has(a));

  const prob = stale.length + missingAngles.length;
  results.push({ code: g.code, total: g.images.length, pageTotal: onPage.length, stale: stale.length, missingAngles: missingAngles.length, staleFiles: stale.map((u) => u.split('/').pop()).slice(0, 8), missingAngleList: missingAngles.slice(0, 8), status: prob ? 'CHECK' : 'ok' });
  if (prob > 0) {
    console.log(`== ${g.code} — เรา ${g.images.length} / หน้า LG ~${onPage.length} | เก่า ${stale.length} | มุมที่ขาด ${missingAngles.length}`);
    if (stale.length) console.log('    เก่า/ไม่เจอบนหน้า:', stale.map((u) => u.split('/').pop()).join(', '));
    if (missingAngles.length) console.log('    มุมที่ LG มีแต่เราไม่มี:', missingAngles.join(', '));
  }
  await new Promise((r) => setTimeout(r, 80));
}

const check = results.filter((r) => r.status === 'CHECK');
console.log(`\n==== สรุป: ตรวจ ${results.length} / ต้องแก้ ${check.length} / ผ่าน ${results.length - check.length}`);
fs.writeFileSync(path.join(ROOT, 'scripts', 'gallery-audit.json'), JSON.stringify(results, null, 2));
