// ดึงรูปสินค้าจริงจากเว็บ LG Thailand สำหรับรุ่นที่ PDF ไม่มีรูป
// 1) ดาวน์โหลดหน้า product ของแต่ละรุ่น → 2) หา URL รูปหลัก (og:image / JSON-LD image)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// รุ่นที่ PDF ไม่มีรูป: (code → หน้า LG Thailand)
const MODELS = [
  { slug: 'as35ggw10-ath',  url: 'https://www.lg.com/th/air-puricare/puricare-360/as35ggw10/' },
  { slug: 'dd23gmwe1-ath',  url: 'https://www.lg.com/th/dehumidifier/dd23gmwe1/' },
  { slug: '75qned86bsa-atm', url: 'https://www.lg.com/th/tv-soundbars/qned-evo/75qned86bsa/' },
  { slug: 'oled48c6psa-atm', url: 'https://www.lg.com/th/tv-soundbars/oled-evo/oled48c6psa/' },
  { slug: '27gx704a-b-atm', url: 'https://www.lg.com/th/monitors/gaming/27gx704a-b/' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'th-TH,th;q=0.9,en;q=0.8' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function extractImages(html) {
  const imgs = new Set();
  // og:image
  const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (og) imgs.add(og[1]);
  const og2 = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (og2) imgs.add(og2[1]);
  // JSON-LD image
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const collect = (o) => {
        if (!o || typeof o !== 'object') return;
        if (Array.isArray(o)) { o.forEach(collect); return; }
        if (typeof o.image === 'string' && /^https?:/.test(o.image)) imgs.add(o.image);
        else if (o.image && typeof o.image === 'object') collect(o.image);
        for (const v of Object.values(o)) collect(v);
      };
      collect(data);
    } catch { /* JSON-LD บางบล็อกไม่ใช่ JSON */ }
  }
  // รูปหลักของสินค้า (pattern ทั่วไปของ LG: /products/... หรือ gallery)
  for (const m of html.matchAll(/["'](https:\/\/www\.lg\.com[^"']*(?:product|gallery|images)[^"']*?\.(?:jpg|png|webp)[^"']*)["']/gi)) {
    const u = m[1].split('?')[0];
    if (/\b(icon|logo|banner|bkg|thumb)\b/i.test(u)) continue;
    if (/\/(product|gallery)\//i.test(u)) imgs.add(u);
  }
  return [...imgs];
}

const out = [];
for (const m of MODELS) {
  try {
    const html = await fetchPage(m.url);
    const imgs = extractImages(html);
    out.push({ slug: m.slug, url: m.url, imgs: imgs.slice(0, 12), htmlLen: html.length });
    console.log(`\n=== ${m.slug} (${html.length} bytes) ===`);
    imgs.slice(0, 12).forEach((u, i) => console.log(`  [${i}] ${u}`));
  } catch (e) {
    console.error(`\n=== ${m.slug} FAILED: ${e.message}`);
    out.push({ slug: m.slug, url: m.url, imgs: [], htmlLen: 0 });
  }
}
fs.writeFileSync(path.join(ROOT, 'scripts', 'lg-img-candidates.json'), JSON.stringify(out, null, 2));
