// อัปเกรดรูปการ์ดที่ได้จาก og:image ให้เป็นขนาดใหญ่ขึ้น
// 1) ดึง og:image จากหน้า LG ของแต่ละรุ่น
// 2) ลองแทน suffix ขนาด (_450 → _2010/_1000/_800) — LG มักมีหลายขนาด
// 3) ถ้าไม่มี variant ใหญ่ ตรวจหาอีกวิธี: รูปอื่นในหน้า (เช่น _large, _big)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'img', 'products');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/products.json'), 'utf8')).products;
const specs = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/lg-specs.json'), 'utf8')).products;
const byCode = new Map(products.map((p) => [p.code, p]));
const specByCode = new Map(specs.map((s) => [s.code, s]));

const SMALL_CODES = [
  'IXY11A', 'IXY13A', 'IXY18A', 'IXY24A', 'S3MFC.ALBPETH', 'MD19GQGA1.ATH',
  'GN-F452PQAK.AEPPLMT', 'DD23GMWE1S.ATH', 'TX2723ST5J.APBPETH', 'MS3032JAS.BBKPETH',
  'WT1410NHEN.ABNPQTH', 'WT2520NHEN.ABNPETH', 'AS25GCBY0.ABAE', 'FV1413H4M.AMBPETH',
  'AS35GGW10.ATH', 'RV10VHP2B.BBLPETH',
];

async function fetchBytes(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100 || buf[0] !== 0xff || buf[1] !== 0xd8) return null; // ไม่ใช่ JPEG
  return buf;
}

// ลอง variant ขนาดต่างๆ ของ URL (แทน _450/_350 → ใหญ่ขึ้น)
const SIZE_VARIANTS = ['2010', '1000', '800', '600'];
async function bestVariant(url) {
  const sizeMatch = url.match(/[_-](\d{3,4})\.(jpg|jpeg|png|webp)$/i);
  if (!sizeMatch) return url;
  const prefix = url.slice(0, sizeMatch.index);
  const sep = url[sizeMatch.index]; // ตัวคั่นขนาด (_ หรือ -)
  const ext = '.' + sizeMatch[2]; // นามสกุลไฟล์ (jpg/png/...)
  for (const s of SIZE_VARIANTS) {
    const cand = prefix + sep + s + ext;
    const buf = await fetchBytes(cand);
    if (buf) return { url: cand, bytes: buf.length };
  }
  return { url, bytes: 0 };
}

async function getOgImage(pageUrl) {
  const res = await fetch(pageUrl, { headers: { 'user-agent': UA, 'accept-language': 'th-TH,th;q=0.9,en;q=0.8' }, redirect: 'follow' });
  if (!res.ok) return null;
  const html = await res.text();
  const og = html.match(/property="og:image"[^>]*content="([^"]+)"/);
  return og ? og[1] : null;
}

let ok = 0, unchanged = 0, fail = 0;
for (const code of SMALL_CODES) {
  const p = byCode.get(code);
  const spec = specByCode.get(code);
  if (!p || !spec || !spec.url) { fail++; console.log(`❌ ${code} — ไม่มีข้อมูล/หน้า`); continue; }
  try {
    const og = await getOgImage(spec.url);
    if (!og) { fail++; console.log(`❌ ${code} — ไม่เจอ og:image`); continue; }
    const best = await bestVariant(og);
    const cur = path.join(OUT_DIR, `${p.slug}.jpg`);
    const curSize = fs.existsSync(cur) ? fs.statSync(cur).size : 0;
    if (!best.bytes || best.bytes <= curSize) {
      unchanged++;
      console.log(`⏭️  ${code} — ไม่มีรูปใหญ่กว่า (${(curSize / 1024).toFixed(1)}KB)`);
      continue;
    }
    const buf = await fetchBytes(best.url);
    if (!buf) { fail++; console.log(`❌ ${code} — โหลดไม่สำเร็จ`); continue; }
    fs.writeFileSync(cur, buf);
    ok++;
    console.log(`✅ ${code} ${(curSize / 1024).toFixed(1)}KB → ${(buf.length / 1024).toFixed(1)}KB  (${best.url.split('/').pop()})`);
  } catch (e) {
    fail++;
    console.log(`❌ ${code} — ${e.message}`);
  }
}
console.log(`\nสรุป: อัปเกรด ${ok} / ไม่มีขนาดใหญ่กว่า ${unchanged} / ล้มเหลว ${fail}`);
