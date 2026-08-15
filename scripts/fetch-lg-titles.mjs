// ดึงชื่อสินค้าเต็ม (h1) จากหน้า LG Thailand สำหรับทุกสินค้าที่มีหน้า
// เก็บเป็น lgName ใน src/data/lg-specs.json — ใช้แสดงบนหน้า detail เหมือนเว็บจริง
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'src/data/lg-specs.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const DELAY_MS = 120;

const specs = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let ok = 0, skip = 0, fail = 0;

for (const s of specs.products) {
  if (!s.url) { skip++; continue; }
  if (s.lgName) { ok++; continue; } // มีแล้ว ข้าม
  try {
    const res = await fetch(s.url, {
      headers: { 'user-agent': UA, 'accept-language': 'th-TH,th;q=0.9,en;q=0.8' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const og = html.match(/property="og:title"\s+content="([^"]+)"/);
    // ชื่อเต็ม = h1 (ตัดส่วนท้าย " - CODE | LG Thailand" ถ้าใช้ og)
    let name = h1 ? h1[1].trim() : null;
    if (!name && og) name = og[1].replace(/\s*-\s*[A-Z0-9.-]+\s*\|\s*LG Thailand.*$/i, '').trim();
    if (!name) throw new Error('ไม่พบ h1');
    s.lgName = name;
    ok++;
    console.log(`✅ ${s.code} => ${name}`);
  } catch (e) {
    fail++;
    console.log(`❌ ${s.code} — ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, DELAY_MS));
}

fs.writeFileSync(FILE, JSON.stringify(specs, null, 2));
console.log(`\nสรุป: มีชื่อแล้ว ${ok} / ไม่มีหน้า ${skip} / ล้มเหลว ${fail}`);
