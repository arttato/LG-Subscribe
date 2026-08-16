// เช็คว่ารูปในแกลเลอรี่ทุกภาพเปิดได้หรือไม่ (HTTP 200)
import fs from 'fs';

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
console.log('URL ทั้งหมด:', all.length);

const bad = [];
const concurrency = 12;
for (let i = 0; i < all.length; i += concurrency) {
  const batch = all.slice(i, i + concurrency);
  await Promise.all(batch.map(async (u) => {
    try {
      const r = await fetch(u, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
      if (!r.ok) bad.push({ url: u, status: r.status, codes: urls.get(u) });
    } catch (e) {
      bad.push({ url: u, status: 'ERR ' + e.message.slice(0, 40), codes: urls.get(u) });
    }
  }));
  process.stdout.write(`\r  ${Math.min(i + concurrency, all.length)}/${all.length}`);
}
console.log('\n');

// ลอง GET อีกครั้งสำหรับ HEAD ที่ล้มเหลว (บาง CDN ไม่รองรับ HEAD)
const finalBad = [];
for (const b of bad) {
  try {
    const r = await fetch(b.url);
    if (r.ok) continue; // GET สำเร็จ → ไม่นับ
    finalBad.push(b);
  } catch {
    finalBad.push(b);
  }
}

console.log('=== รูปที่ error ไม่โชว์: ' + finalBad.length + ' รูป ===');
for (const b of finalBad) {
  console.log(`[${b.status}]`);
  for (const code of b.codes) console.log('   ', code);
  console.log('    URL:', b.url.slice(0, 160));
}
