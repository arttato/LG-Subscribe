// ดาวน์โหลดรูปสินค้าจริงจากเว็บ LG Thailand ให้ทุกสินค้าในแคตตาล็อก
// 1) รุ่นที่มี lg-gallery.json → ใช้รูปมุมแรก (มุมหลัก)
// 2) รุ่นที่มีหน้า LG (lg-specs.json) แต่ไม่มี gallery → ดึง og:image / รูป content/dam แรกจากหน้า
// 3) รุ่นที่ไม่มีหน้า LG → คงรูปเดิม (จาก PDF)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'img', 'products');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const DELAY_MS = 150;

const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/products.json'), 'utf8')).products;
const gallery = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/lg-gallery.json'), 'utf8')).products;
const specs = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/lg-specs.json'), 'utf8')).products;

const galByCode = new Map(gallery.map((g) => [g.code, g]));
const specByCode = new Map(specs.map((s) => [s.code, s]));

async function fetchBytes(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// หารูปจากหน้า LG ที่ gallery ไม่เจอ: og:image → รูป /content/dam/ ...jpg แรก
async function findPageImage(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'th-TH,th;q=0.9,en;q=0.8' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const og = html.match(/property="og:image"\s+content="([^"]+)"/);
  if (og) return og[1];
  const dam = html.match(/"(https:\/\/www\.lg\.com\/content\/dam[^"]*\.(?:jpg|png|webp))"/);
  if (dam) return dam[1];
  const dam2 = html.match(/"(https?:\/\/[^"]*\.lg\.com\/[^"]*\.(?:jpg|png|webp))"/);
  if (dam2) return dam2[1];
  throw new Error('ไม่พบรูปในหน้า');
}

const results = [];
let ok = 0, skip = 0, fail = 0;
for (const p of products) {
  const gal = galByCode.get(p.code);
  const spec = specByCode.get(p.code);
  let src = null, how = '';
  if (gal && gal.images.length) {
    src = gal.images[0];
    how = 'gallery';
  } else if (spec && spec.url) {
    try {
      src = await findPageImage(spec.url);
      how = 'og:image';
    } catch (e) {
      fail++;
      results.push({ code: p.code, status: 'fail', error: e.message });
      console.log(`❌ ${p.code} — ${e.message}`);
      continue;
    }
  } else {
    skip++;
    results.push({ code: p.code, status: 'skip (ไม่มีหน้า LG)' });
    console.log(`⏭️  ${p.code} — ไม่มีหน้า LG คงรูป PDF เดิม`);
    continue;
  }
  try {
    const buf = await fetchBytes(src);
    const out = path.join(OUT_DIR, `${p.slug}.jpg`);
    fs.writeFileSync(out, buf);
    ok++;
    results.push({ code: p.code, slug: p.slug, status: 'ok', how, src, bytes: buf.length });
    console.log(`✅ ${p.code} (${how}) ${buf.length.toLocaleString()}B`);
  } catch (e) {
    fail++;
    results.push({ code: p.code, status: 'fail', error: e.message });
    console.log(`❌ ${p.code} — ดาวน์โหลดรูปไม่สำเร็จ: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, DELAY_MS));
}

console.log(`\nสรุป: สำเร็จ ${ok} / ข้าม ${skip} / ล้มเหลว ${fail}`);
fs.writeFileSync(path.join(ROOT, 'scripts', 'lg-images-report.json'), JSON.stringify(results, null, 2));
