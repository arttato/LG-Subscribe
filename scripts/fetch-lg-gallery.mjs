// ดึง URL รูปสินค้าหลายมุมจากเว็บ LG Thailand → src/data/lg-gallery.json
// (เก็บ URL แบบ hotlink — รูปโหลดจาก CDN ของ LG โดยตรง ไม่ต้องดาวน์โหลดเก็บใน repo)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'data', 'lg-gallery.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const DELAY_MS = 200;
const MAX_PER_PRODUCT = 6;

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

// เอา URL รูป gallery — รองรับชื่อไฟล์/โฟลเดอร์หลายแบบ:
//   <รุ่น>-<กว้าง>-<มุม>.jpg | <กว้าง>-<มุม>.jpg | <รุ่น>-<มุม>-<กว้าง>.jpg | <รุ่น>_<กว้าง> (<มุม>).jpg | 450.jpg | D-1.jpg | 01_1.<รุ่น>....jpg (width อยู่ในโฟลเดอร์ 2010x1334/)
// กฎ: width = เลขมากสุดจากชื่อไฟล์ + โฟลเดอร์ขนาด (เช่น 2010x1334)
//      มุมถ่าย = เลขในวงเล็บ > เลขนำหน้าไฟล์ (01_) > เลขน้อยสุดอื่นในชื่อไฟล์
function parsePhoto(rel) {
  const base = rel.split('/').pop();
  const pathNums = [...rel.matchAll(/(\d+)x(\d+)/g)].flatMap((m) => [parseInt(m[1], 10), parseInt(m[2], 10)]);
  const fileNums = [...base.matchAll(/(\d+)/g)].map((m) => parseInt(m[1], 10));
  const allNums = [...pathNums, ...fileNums];
  if (!allNums.length) return null;
  const width = Math.max(...allNums);
  let nn;
  const paren = base.match(/\((\d+)\)/);
  if (paren) nn = parseInt(paren[1], 10);
  else {
    const lead = base.match(/^(\d+)[_.]/);
    if (lead) nn = parseInt(lead[1], 10);
    else {
      const others = fileNums.filter((n) => n !== width && !pathNums.includes(n));
      nn = others.length ? Math.min(...others) : 1;
    }
  }
  const url = rel.startsWith('http') ? rel : 'https://www.lg.com' + rel;
  return { nn, width, url };
}

// ต้องมีโฟลเดอร์ (ไม่ใช่ชื่อไฟล์) ที่เป็น gallery: /gallery/ /gallery1/ /gallery-1/ ...-gallery/
function isGalleryUrl(rel) {
  const segs = rel.split('/').filter(Boolean);
  for (const s of segs.slice(0, -1)) {
    if (s === 'gallery' || s.startsWith('gallery') || s.endsWith('-gallery')) return true;
  }
  return false;
}

function extractGallery(html) {
  const flight = extractFlightStrings(html).join('');
  const best = new Map(); // nn → { width, url }
  const re = /"((?:https?:\/\/www\.lg\.com|\/content\/dam[^"]*|\/th\/image-update[^"]*|\/th\/images[^"]*)[^"]*\.(?:jpg|png|webp))"/gi;
  for (const m of flight.matchAll(re)) {
    const rel = m[1];
    if (!isGalleryUrl(rel)) continue;
    const parsed = parsePhoto(rel);
    if (!parsed) continue;
    const key = String(parsed.nn);
    const prev = best.get(key);
    if (!prev || parsed.width > prev.width) best.set(key, parsed);
  }
  return [...best.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }))
    .map(([, v]) => v.url)
    .slice(0, MAX_PER_PRODUCT);
}

// ── ใช้ URL หน้าจาก lg-specs.json ──
const specs = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'lg-specs.json'), 'utf8'));
const targets = specs.products;
console.log(`สินค้าที่มีหน้า LG: ${targets.length}`);

const results = [];
let ok = 0, fail = 0;
for (let i = 0; i < targets.length; i++) {
  const t = targets[i];
  try {
    const res = await fetch(t.url, {
      headers: { 'user-agent': UA, 'accept-language': 'th-TH,th;q=0.9,en;q=0.8' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const images = extractGallery(html);
    if (images.length < 2) throw new Error('ไม่พบ gallery (มี ' + images.length + ' รูป)');
    results.push({ code: t.code, slug: t.slug, url: t.url, images });
    ok++;
    console.log(`✅ [${i + 1}/${targets.length}] ${t.code} → ${images.length} มุม`);
  } catch (e) {
    fail++;
    console.log(`❌ [${i + 1}/${targets.length}] ${t.code} — ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, DELAY_MS));
}

const out = { fetchedAt: new Date().toISOString(), source: 'https://www.lg.com', products: results };
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`\nบันทึก: ${path.relative(ROOT, OUT)} (${results.length} สินค้า, สำเร็จ ${ok}, ล้มเหลว ${fail})`);
