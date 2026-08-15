// ทำให้รูปการ์ดในแคตตาล็อกเป็นรูปสินค้าจริงตามหน้าเว็บ lg.com/th
// วิธี: เทียบเนื้อหาไฟล์การ์ดปัจจุบันกับ og:image + ทุกรูปใน gallery ของหน้า LG
//  - ตรงกับ og หรือรูปตัวสินค้าจริง (ชื่อสะอาด) → คงเดิม
//  - ตรงกับรูป marketing (with-logo/dispenser/display/thumb/animation/mobile...) → เปลี่ยนเป็น og:image variant ใหญ่สุด
//  - ไม่ตรงกับอะไรเลย (ดาวน์โหลดรอบเก่า) → เปลี่ยนเป็น og:image (รูปหลักตามหน้าเว็บ)
// รัน: npm run cardhero
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'img', 'products');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const DELAY = 60;

const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/products.json'), 'utf8')).products;
const gallery = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/lg-gallery.json'), 'utf8')).products;
const specs = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/lg-specs.json'), 'utf8')).products;
const galByCode = new Map(gallery.map((g) => [g.code, g]));
const specByCode = new Map(specs.map((s) => [s.code, s]));

// ชื่อไฟล์ที่เป็นภาพ marketing/feature ไม่ใช่รูปตัวสินค้าล้วน
const BAD_NAME = /with-logo|\blogo\b|badge|tech-spec|spec-|animation|thumbnail|mobile|feature|spin|360|pre-order|influencer|dispenser|display|didopen|dairy|recipe/i;

async function fetchBytes(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) return null;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  if (!isJpg && !isPng) return null; // HTML error page
  return buf;
}
async function dims(buf) {
  try { const m = await sharp(buf).metadata(); return m.width && m.height ? { w: m.width, h: m.height } : null; } catch { return null; }
}
async function ogOf(pageUrl) {
  const res = await fetch(pageUrl, { headers: { 'user-agent': UA, 'accept-language': 'th-TH,th;q=0.9,en;q=0.8' }, redirect: 'follow' });
  if (!res.ok) return null;
  const html = await res.text();
  const og = html.match(/property="og:image"\s+content="([^"]+)"/);
  return og ? og[1] : null;
}
// variant ขนาดใหญ่ของ og (ลองก่อน) → og เดิม (กันรูปแนวตั้ง/เล็กเกิน)
async function ogBest(og) {
  const base = og.slice(og.lastIndexOf('/') + 1);
  const dir = og.slice(0, og.lastIndexOf('/') + 1);
  const cands = [];
  // หา token ขนาดตัวสุดท้าย (เช่น -450-, -450.jpg, _450_01.jpg) แล้วแทนด้วยขนาดใหญ่กว่า
  let m = null, mm;
  const re = /([_-])(\d{3,4})(?=[_-]|\.)/g;
  while ((mm = re.exec(base))) m = mm; // ใช้ match สุดท้าย (ใกล้ท้ายชื่อไฟล์)
  if (m) {
    const tail = base.slice(m.index + m[0].length); // ส่วนหลัง token (เช่น -01.jpg หรือ .jpg)
    for (const sz of [2010, 1600, 1000, 800, 600]) cands.push(dir + base.slice(0, m.index) + m[1] + sz + tail);
  }
  cands.push(og);
  for (const u of cands) {
    const buf = await fetchBytes(u);
    if (!buf) continue;
    const d = await dims(buf);
    if (!d) continue;
    if (d.h > d.w * 1.2 || d.w < 300) continue; // กันรูปแนวตั้ง/เล็กเกินไปสำหรับการ์ด
    return { buf, src: u, d };
  }
  return null;
}

let fixed = 0, kept = 0, skip = 0, fail = 0;
const changed = [];
for (const p of products) {
  const spec = specByCode.get(p.code);
  const local = path.join(OUT_DIR, `${p.slug}.jpg`);
  const cur = fs.existsSync(local) ? fs.readFileSync(local) : null;
  if (!cur) { skip++; console.log(`⏭️  ${p.code} — ไม่มีไฟล์การ์ด`); continue; }
  if (!spec || !spec.url) { skip++; console.log(`⏭️  ${p.code} — ไม่มีหน้า LG`); continue; }

  let og = null;
  try { og = await ogOf(spec.url); } catch {}
  const ogBase = og ? og.split('/').pop() : '';
  if (og && /\blogo\b/i.test(ogBase)) { kept++; console.log(`⏺️  ${p.code} — og เป็นโลโก้ คงรูปเดิม`); continue; }

  // เทียบเนื้อหากับ og + ทุกรูปใน gallery
  const gal = galByCode.get(p.code);
  const matches = []; // { url, bad }
  if (og) { const b = await fetchBytes(og); if (b && cur.equals(b)) matches.push({ url: og, bad: BAD_NAME.test(ogBase) }); }
  const galImgs = (gal && gal.images) || [];
  for (const u of galImgs.slice(0, 30)) {
    const name = u.split('/').pop() || '';
    const bad = BAD_NAME.test(name);
    const b = await fetchBytes(u);
    if (b && cur.equals(b)) { matches.push({ url: u, bad }); break; } // เจอแล้วพอ
    await new Promise((r) => setTimeout(r, DELAY));
  }

  let reason = null;
  if (matches.some((m) => !m.bad)) {
    kept++; console.log(`⏺️  ${p.code} — การ์ดตรงกับรูปสินค้าจริง (${matches[0].url.split('/').pop()})`);
    continue;
  }
  if (matches.some((m) => m.bad)) reason = `ตรงกับภาพ marketing: ${matches[0].url.split('/').pop()}`;
  else {
    // ไม่ตรงกับอะไรเลย: ถ้ารูปเดิมเป็นรูปใหญ่ (≥800px, ไม่แนวตั้ง) ให้ถือว่าดี คงไว้
    const d = await dims(cur);
    if (d && d.w >= 800 && d.h <= d.w * 1.3) { kept++; console.log(`⏺️  ${p.code} — รูปเดิมใหญ่พอ (${d.w}x${d.h}) ไม่ตรงกับหน้า LG`); continue; }
    reason = 'ไม่ตรงกับรูปในหน้า LG (ดาวน์โหลดรอบเก่า) + เล็ก/แนวตั้ง';
  }

  if (!og) { fail++; console.log(`❌ ${p.code} — ไม่เจอ og:image (${reason})`); continue; }
  const best = await ogBest(og);
  if (!best) { fail++; console.log(`❌ ${p.code} — og variant ไม่ผ่าน (${reason})`); continue; }
  fs.writeFileSync(local, best.buf);
  fixed++;
  changed.push(`${p.code} — ${reason}: ${(cur.length / 1024).toFixed(0)}KB → ${best.d.w}x${best.d.h} ${(best.buf.length / 1024).toFixed(0)}KB (${best.src.split('/').pop()})`);
  console.log(`🔁 ${changed[changed.length - 1]}`);
}
console.log(`\nสรุป: เปลี่ยน ${fixed} / คงเดิม ${kept} / ข้าม ${skip} / ล้มเหลว ${fail}`);
if (changed.length) fs.writeFileSync(path.join(ROOT, 'scripts', 'cardhero-report.txt'), changed.join('\n'));
