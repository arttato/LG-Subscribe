// ดึง gallery แยกสีของเครื่องกรองน้ำ WD516/WD518 จากเว็บ LG Thailand → src/data/color-galleries.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'data', 'color-galleries.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const DELAY_MS = 250;

// 3 สีต่อรุ่น — ลำดับ = ลำดับแสดงปุ่มสี (สีแรก = สีหลักที่การ์ด/หน้า detail ใช้อยู่)
const VARIANTS = [
  { code: 'WD516', key: 'navy',   th: 'น้ำเงิน', model: 'WD516AN.ACNPLMT', url: 'https://www.lg.com/th/water-purifiers/wd516an-acnplmt/' },
  { code: 'WD516', key: 'white',  th: 'ขาว',    model: 'WD516AN.AEWPLMT', url: 'https://www.lg.com/th/water-purifiers/wd516an-aewplmt/' },
  { code: 'WD516', key: 'silver', th: 'เงิน',    model: 'WD516AN.ASLPLMT', url: 'https://www.lg.com/th/water-purifiers/wd516an-aslplmt/' },
  { code: 'WD518', key: 'beige',  th: 'เบจ',     model: 'WD518AN.ABGPLMT', url: 'https://www.lg.com/th/water-purifiers/wd518an-abgplmt/' },
  { code: 'WD518', key: 'white',  th: 'ขาว',    model: 'WD518AN.AWHPLMT', url: 'https://www.lg.com/th/water-purifiers/wd518an-awhplmt/' },
  { code: 'WD518', key: 'gray',   th: 'เทา',     model: 'WD518AN.ACGPLMT', url: 'https://www.lg.com/th/water-purifiers/wd518an-acgplmt/' },
];

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

function isGalleryUrl(rel) {
  const segs = rel.split('/').filter(Boolean);
  for (const s of segs.slice(0, -1)) {
    if (s === 'gallery' || s.startsWith('gallery') || s.endsWith('-gallery')) return true;
  }
  return false;
}

function extractGallery(html) {
  const flight = extractFlightStrings(html).join('');
  const best = new Map();
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
    .map(([, v]) => v.url);
}

// ชื่อสินค้าเต็ม (h1/og:title) — ตัด trailing " - CODE" ที่ LG ต่อท้าย
function extractLgName(html) {
  let name = '';
  const og = html.match(/property="og:title" content="([^"]+)"/);
  if (og && og[1]) name = og[1].replace(/\s*\|\s*LG Thailand.*$/i, '').trim();
  else {
    const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    if (h1) name = h1[1].trim();
  }
  return name.replace(/\s*-\s*[A-Z0-9]+(?:\.[A-Z0-9]+)*\s*$/i, '').trim();
}

// สีของจุดบนปุ่ม (swatch)
const SWATCH = {
  navy: '#2f4a6e', white: '#f2f2f2', silver: '#b9bec6',
  beige: '#d9c6a9', gray: '#8d9198',
};

const byCode = new Map();
for (const v of VARIANTS) {
  try {
    const res = await fetch(v.url, {
      headers: { 'user-agent': UA, 'accept-language': 'th-TH,th;q=0.9,en;q=0.8' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const images = extractGallery(html);
    if (images.length < 2) throw new Error(`gallery แค่ ${images.length} รูป`);
    const entry = { key: v.key, th: v.th, model: v.model, url: v.url, lgName: extractLgName(html), swatch: SWATCH[v.key] || '#999', images };
    if (!byCode.has(v.code)) byCode.set(v.code, []);
    byCode.get(v.code).push(entry);
    console.log(`✅ ${v.code} ${v.th} (${v.key}) → ${images.length} มุม`);
  } catch (e) {
    console.log(`❌ ${v.code} ${v.th} (${v.key}) — ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, DELAY_MS));
}

const products = [...byCode.entries()].map(([code, colors]) => ({ code, colors }));
const out = { fetchedAt: new Date().toISOString(), source: 'https://www.lg.com/th', products };
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`\nบันทึก: ${path.relative(ROOT, OUT)} (${products.length} รุ่น, ${VARIANTS.length} สี)`);
