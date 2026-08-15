// ดึง banner โปรโมชัน (carousel) จากหน้า LG Subscribe → public/img/banners/ + src/data/banners.json
// ใช้ซ้ำเดือนหน้า: npm run banners — ดึงสไลด์ที่ LG กำลังแสดงอยู่จริงโดยอัตโนมัติ
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'img', 'banners');
const OUT_JSON = path.join(ROOT, 'src', 'data', 'banners.json');
const PAGE = 'https://www.lg.com/th/subscribe/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

fs.mkdirSync(OUT_DIR, { recursive: true });

// ── 1. ดาวน์โหลดหน้า LG Subscribe ──
console.log('ดาวน์โหลดหน้า:', PAGE);
const res = await fetch(PAGE, {
  headers: { 'user-agent': UA, 'accept-language': 'th-TH,th;q=0.9,en;q=0.8' },
  redirect: 'follow',
});
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const html = await res.text();

// ── 2. แยกสไลด์ hero carousel จาก HTML ที่ render แล้ว ──
// โครงสร้าง: <picture><source media="(max-width: 768px)" srcSet="...720x960..."/>
//            <source media="(min-width: 769px)" srcSet="...1920x720..."/>...</picture>
const slides = [];
const picRe = /<picture>([\s\S]*?)<\/picture>/g;
let pm;
while ((pm = picRe.exec(html)) !== null) {
  const block = pm[1];
  if (!/1920x720/.test(block)) continue;
  const desk = block.match(/srcSet="([^"]*1920x720[^"]*)"/);
  const mob = block.match(/srcSet="([^"]*720x960[^"]*)"/) || block.match(/src="([^"]*720x960[^"]*)"/);
  if (!desk) continue;
  slides.push({
    desktop: desk[1].startsWith('http') ? desk[1] : 'https://www.lg.com' + desk[1],
    mobile: mob ? (mob[1].startsWith('http') ? mob[1] : 'https://www.lg.com' + mob[1]) : null,
  });
}
console.log(`พบสไลด์: ${slides.length}`);
if (!slides.length) throw new Error('ไม่พบสไลด์ในหน้า');

// ── 3. ดาวน์โหลด desktop + mobile ลง public/img/banners/ ──
const saved = [];
for (let i = 0; i < slides.length; i++) {
  const s = slides[i];
  const n = String(i + 1).padStart(2, '0');
  const jobs = [
    { key: 'desktop', url: s.desktop, file: `banner-${n}.jpg` },
    { key: 'mobile', url: s.mobile, file: `banner-${n}-m.jpg` },
  ];
  const info = { desktop: `/img/banners/banner-${n}.jpg`, mobile: `/img/banners/banner-${n}-m.jpg` };
  for (const j of jobs) {
    if (!j.url) { info[j.key] = null; continue; }
    try {
      const r = await fetch(j.url, { headers: { 'user-agent': UA, referer: 'https://www.lg.com/th/' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 10000) throw new Error(`ไฟล์เล็กเกินไป (${buf.length} bytes)`);
      fs.writeFileSync(path.join(OUT_DIR, j.file), buf);
      info[j.key] = `/img/banners/${j.file}`;
      console.log(`✅ ${j.file} (${(buf.length / 1024).toFixed(0)} KB)`);
    } catch (e) {
      console.log(`❌ ${j.file} — ${e.message}`);
      info[j.key] = null;
    }
  }
  saved.push({ desktop: info.desktop, mobile: info.mobile, lgDesktop: s.desktop, lgMobile: s.mobile });
}

// ── 4. เขียน src/data/banners.json ──
// คง title/category ที่เคยตั้งไว้ (จับคู่ด้วยชื่อไฟล์ต้นทาง) — สไลด์ใหม่จะได้ title ว่างให้ใส่เอง
const fileKey = (u) => (u ? u.split('/').pop().replace(/\.(jpg|png|webp)$/i, '') : '');
const prev = (() => {
  try { return JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')).slides; } catch { return []; }
})();
const prevByFile = new Map(prev.map((s) => [fileKey(s.lgDesktop), s]));

const slidesOut = saved.filter((s) => s.desktop).map((s) => {
  const p = prevByFile.get(fileKey(s.lgDesktop)) || {};
  return { ...s, title: p.title || '', category: p.category || '' };
});
const out = {
  fetchedAt: new Date().toISOString(),
  source: PAGE,
  slides: slidesOut,
};
fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
const noTitle = slidesOut.filter((s) => !s.title).length;
console.log(`\nบันทึก: ${path.relative(ROOT, OUT_JSON)} (${slidesOut.length}/${slides.length} สไลด์)`);
if (noTitle) console.log(`⚠️  สไลด์ใหม่ ${noTitle} ใบ ยังไม่มี title/category — เปิด ${path.relative(ROOT, OUT_JSON)} แล้วใส่ให้`);
