// เช็คว่ารูปในแกลเลอรี่ทุกภาพเปิดได้หรือไม่ (HTTP 200)
// 用法: node scripts/check-gallery-urls.mjs            → เตือน (exit 0 เสมอ)
//       node scripts/check-gallery-urls.mjs --fail     → ถ้ามีรูปพัง exit 1
import fs from 'fs';

const FAIL = process.argv.includes('--fail');

const g = JSON.parse(fs.readFileSync('./src/data/lg-gallery.json', 'utf8'));
const arr = Array.isArray(g) ? g : (g.products || []);
const c = JSON.parse(fs.readFileSync('./src/data/color-galleries.json', 'utf8'));
const carr = Array.isArray(c) ? c : (c.products || []);

const urls = new Map(); // url -> [labels]
for (const p of arr) for (const u of (p.images || [])) {
  if (!urls.has(u)) urls.set(u, []);
  urls.get(u).push('lg:' + p.code);
}
for (const p of carr) for (const col of (p.colors || [])) for (const u of (col.images || [])) {
  if (!urls.has(u)) urls.set(u, []);
  urls.get(u).push('color:' + p.code + '/' + col.key);
}

const all = [...urls.keys()];
const bad = [];
const concurrency = 25;
const started = Date.now();
for (let i = 0; i < all.length; i += concurrency) {
  const batch = all.slice(i, i + concurrency);
  await Promise.all(batch.map(async (u) => {
    try {
      const r = await fetch(u, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
      if (!r.ok) bad.push({ url: u, status: r.status, codes: urls.get(u) });
    } catch {
      bad.push({ url: u, status: 'ERR', codes: urls.get(u) });
    }
  }));
}

// ลอง GET อีกครั้งสำหรับ HEAD ที่ล้มเหลว (บาง CDN ไม่รองรับ HEAD)
const finalBad = [];
for (const b of bad) {
  try {
    const r = await fetch(b.url, { signal: AbortSignal.timeout(8000) });
    if (r.ok) continue;
    finalBad.push(b);
  } catch {
    finalBad.push(b);
  }
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
if (finalBad.length === 0) {
  console.log(`✅ [gallerycheck] รูปแกลเลอรี่ ${all.length} ภาพ ผ่านทั้งหมด (${secs}s)`);
  process.exit(0);
}
console.log(`⚠️ [gallerycheck] รูปที่ error ไม่โชว์: ${finalBad.length}/${all.length} ภาพ (${secs}s)`);
for (const b of finalBad) {
  console.log(`  [${b.status}] ${b.codes.join(', ')}`);
  console.log(`      ${b.url.slice(0, 170)}`);
}
process.exit(FAIL ? 1 : 0);
