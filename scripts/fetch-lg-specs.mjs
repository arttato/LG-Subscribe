// ดึงคุณสมบัติและสเปคจากเว็บ LG Thailand (lg.com/th) → src/data/lg-specs.json
// 1) จับคู่รุ่นกับหน้า product อัตโนมัติจาก sitemap + รายการที่ระบุเอง
// 2) ดาวน์โหลดหน้า → แยกสเปกจาก HTML ที่เรนเดอร์ (ตาราง c-compare-selling)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'data', 'lg-specs.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const DELAY_MS = 250;

// รุ่นที่ sitemap จับคู่ให้ไม่ได้ หรือต้องเลือกหน้าเฉพาะ (product code → URL)
const OVERRIDES = {
  'WD516': 'https://www.lg.com/th/water-purifiers/wd516an-acnplmt/',
  'WD518': 'https://www.lg.com/th/water-purifiers/wd518an-abgplmt/',
  'ZT1Q12GULA1.EWGHATH': 'https://www.lg.com/th/business/air-solution/single-split-air-solution/zt-q12gula0/',
  'ZT1Q18GTLA1.EWGHATH': 'https://www.lg.com/th/business/air-solution/single-split-air-solution/zt-q18gtla0/',
  'ZT1Q24GTLA1.EWGHATH': 'https://www.lg.com/th/business/air-solution/single-split-air-solution/zt-q24gtla0/',
  'ZT4Q18GPLA1.EWGHATH': 'https://www.lg.com/th/business/air-solution/single-split-air-solution/zt-q18gple0/',
  'ZT4Q36GNLA1.EWGHATH': 'https://www.lg.com/th/business/air-solution/single-split-air-solution/zt-q36gnla0/',
  'ZT4Q48GMLA1.EWGHATH': 'https://www.lg.com/th/business/air-solution/single-split-air-solution/zt-q48lmla0/',
  'ZTRQ36GYLA1.EWGHATH': 'https://www.lg.com/th/business/air-solution/single-split-air-solution/zt-q36gyla0/',
  'ZTRQ48GYLA1.EWGHATH': 'https://www.lg.com/th/business/air-solution/single-split-air-solution/zt-q48gyla0/',
  '34U650A-B.ATM': 'https://www.lg.com/hk_en/monitors/ultrawide/34u650a-b/',
  'DD23GMWE1S.ATH': 'https://www.lg.com/th/dehumidifier/dd23gmwe1/',
  'MD19GQGA1.ATH': 'https://www.lg.com/th/dehumidifier/md19gqga1/',
  'DFC335HM.ABMPETH': 'https://www.lg.com/th/dishwasher/dfc335hm/',
  'DFC533FV.APYPETH': 'https://www.lg.com/th/dishwasher/dfc533fv/',
  'A9T-ULTRA.DCBPETH': 'https://www.lg.com/th/vacuum-cleaner/cordless-vacuum-cleaner/a9t-ultra/',
  'RV10VHP2B.BBLPETH': 'https://www.lg.com/th/laundry/dryer/rv10vhp2b/',
  'AS60GHWG0.ABAE': 'https://www.lg.com/th/air-puricare/puricare-360/as60ghwg0/',
  'WT1410NHEG.ABGPQTH': 'https://www.lg.com/th/laundry/wash-tower/wt1410nheg/',
  'GC-X257CMHW.AEEPLMT': 'https://www.lg.com/th/refrigerators/side-by-side-refrigerator/gc-x257cmhw/',
  'XBOOM-BOUNCE': 'https://www.lg.com/th/speakers/xboom/bounce/',
  'XBOOM-GRAB': 'https://www.lg.com/th/speakers/xboom/grab/',
  'XBOOM-STAGE301': 'https://www.lg.com/th/speakers/party-speakers/stage301/',
};

const stripTags = (s) =>
  s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function parseItem(li) {
  const nameM = li.match(/c-compare-selling__spec-name[^>]*>\s*<p>([\s\S]*?)<\/p>/);
  const valM = li.match(/c-compare-selling__spec-desc[^>]*>\s*<p>([\s\S]*?)<\/p>/);
  if (!nameM && !valM) return null;
  const name = nameM ? stripTags(nameM[1]) : '';
  const value = valM ? stripTags(valM[1]) : '';
  if (!name && !value) return null;
  return { name, value };
}

// แยกข้อมูลจาก HTML:
//   features       = "คุณลักษณะที่สำคัญ" (id=keyFeatureList) — จุดเด่น marketing แบบ bullet
//   keySpecs       = "คุณลักษณะเด่น" (ตาราง c-compare-selling ชื่อ/ค่า) — ใช้ทำ tooltip บนการ์ด
//   featureBlocks  = "คุณสมบัติ" — ช่วง pdp-overview-section ถึง pdp-support-section
//                    แต่ละ block: { title, desc, image } (headline + คำอธิบาย + รูป desktop)
//   groups         = "สเปคทั้งหมด" (c-all-specs-area) — ตารางสเปคเต็มแยกกลุ่ม
//   faq            = JSON-LD FAQPage — คำถาม/คำตอบ
function extractSpecsFromHtml(html) {
  // คุณลักษณะที่สำคัญ (bullet list id=keyFeatureList) — แสดงบนหน้า detail
  const features = [];
  const fm = html.match(/<ul[^>]*id="keyFeatureList"[^>]*>([\s\S]*?)<\/ul>/);
  if (fm) {
    for (const lm of fm[1].matchAll(/<li[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/g)) {
      const t = stripTags(lm[1]);
      if (t) features.push(t);
    }
  }

  // คุณลักษณะเด่น = ตาราง spec-list แรกของหน้า (หัวข้อ "คุณลักษณะเด่น")
  const keySpecs = [];
  const firstList = html.match(/<ul[^>]*class="[^"]*c-compare-selling__spec-list[^"]*">([\s\S]*?)<\/ul>/);
  if (firstList) {
    for (const lm of firstList[1].matchAll(/<li[^>]*class="[^"]*c-compare-selling__item[^"]*">([\s\S]*?)<\/li>/g)) {
      const item = parseItem(lm[1]);
      if (item) keySpecs.push(item);
    }
  }

  // ── คุณสมบัติ (ภาพ + ข้อความ) — เฉพาะ block ใน c-folding ──
  const featureBlocks = extractFeatureBlocks(html);

  // ── สเปคเต็ม (กลุ่ม) ──
  const groups = extractSpecGroups(html);

  // ── FAQ (JSON-LD) ──
  const faq = extractFaq(html);

  return { features, keySpecs, groups, featureBlocks, faq };
}

// ชื่อ section ที่ไม่ใช่คุณสมบัติ (รีวิว/FAQ/subscribe/แนะนำสินค้า/บริการ) — ตัดออก
const NON_FEATURE_TITLE = /(รีวิว|คำถามที่พบบ่อย|LG Subscribe|สินค้าแนะนำ|สนับสนุน|บริการดูแล|คุณสมบัติและสเปค|สเปคทั้งหมด)/;

// c-folding block (component CM0007) = 1 คุณสมบัติ: eyebrow + headline + ข้อความ + รูป
// ใช้ c-folding เป็นตัวแบ่ง เพราะ feature ส่วนใหญ่ของ LG ใช้ component นี้ (support/FAQ ไม่ใช่)
function extractFeatureBlocks(html) {
  const sIdx = html.indexOf('id="pdp-overview-section"');
  const eIdx = html.indexOf('id="pdp-support-section"');
  if (sIdx === -1 || eIdx === -1) return [];
  const seg = html.slice(sIdx, eIdx);
  const blocks = [];
  const parts = seg.split('<div class="c-folding">');
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    const headM = chunk.match(/<h2[^>]*cmp-title__text[^>]*>([\s\S]*?)<\/h2>/);
    if (!headM) continue;
    const title = stripTags(headM[1]);
    if (!title || title.length > 90 || NON_FEATURE_TITLE.test(title)) continue;
    // รูป: ชอบ desktop (min-width: 1025px) → mobile → img src
    const srcM =
      chunk.match(/<source media="\(min-width: 1025px\)" srcSet="([^"]+)"/) ||
      chunk.match(/<source media="\(max-width: 1024px\)" srcSet="([^"]+)"/) ||
      chunk.match(/<img[^>]*src="([^"]+)"/);
    const src = srcM ? srcM[1] : null;
    if (!src) continue;
    // คำอธิบาย: ข้อความทุก <p> ก่อนรูป (ตัดชื่อ headline ออก) — ตัดให้สั้นพอดีสำหรับการ์ด
    const upToPic = chunk.slice(0, Math.max(chunk.indexOf('<picture'), chunk.indexOf('<img')));
    const ps = [...upToPic.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
      .map((m) => stripTags(m[1]))
      .filter((t) => t && t !== title);
    let desc = ps.join(' ');
    if (desc.length > 320) {
      desc = desc.slice(0, 320).replace(/\s+\S*$/, '') + '…';
    }
    blocks.push({
      title,
      desc,
      image: src.startsWith('http') ? src : 'https://www.lg.com' + src,
    });
  }
  return blocks;
}

// สเปคเต็ม: ทุกกลุ่ม (table-head + spec-list) ใน c-all-specs-area
function extractSpecGroups(html) {
  const groups = [];
  const start = html.indexOf('c-all-specs-area');
  if (start === -1) return groups;
  const faq = html.indexOf('js-accordion', start);
  const end = faq > start ? faq : start + 200000;
  const seg = html.slice(start, end);
  const re = /<div class="c-compare-selling__table-head[^"]*">([\s\S]*?)<\/div>([\s\S]*?)<ul class="c-compare-selling__spec-list">([\s\S]*?)<\/ul>/g;
  for (const m of seg.matchAll(re)) {
    const title = stripTags(m[1]);
    const items = [];
    for (const liM of m[3].matchAll(/<li[^>]*class="[^"]*c-compare-selling__item[^"]*">([\s\S]*?)<\/li>/g)) {
      const nameM = liM[1].match(/c-compare-selling__spec-name[^>]*>([\s\S]*?)<\/div>/);
      const valM = liM[1].match(/c-compare-selling__spec-desc[^>]*>([\s\S]*?)<\/div>/);
      const name = nameM ? stripTags(nameM[1]) : '';
      const value = valM ? stripTags(valM[1]) : '';
      if (name || value) items.push({ name, value });
    }
    if (items.length) groups.push({ title, specs: items });
  }
  return groups;
}

// FAQ จาก JSON-LD (FAQPage)
function extractFaq(html) {
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim());
      const arr = Array.isArray(j) ? j : [j];
      for (const item of arr) {
        const t = item['@type'];
        if (t === 'FAQPage' || (Array.isArray(t) && t.includes('FAQPage'))) {
          return (item.mainEntity || [])
            .map((q) => ({ q: stripTags(q.name), a: stripTags(q.acceptedAnswer?.text || '') }))
            .filter((x) => x.q && x.a);
        }
      }
    } catch (e) {}
  }
  return [];
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'th-TH,th;q=0.9,en;q=0.8' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// ── 1) โหลดสินค้า ──
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/products.json'), 'utf8'));
const products = data.products;

// ── 2) sitemap → ดัชนีรุ่น → URL ──
console.log('โหลด sitemap ของ LG Thailand...');
const sitemapRes = await fetch('https://www.lg.com/th/sitemap.xml', { headers: { 'user-agent': UA } });
if (!sitemapRes.ok) throw new Error(`sitemap HTTP ${sitemapRes.status}`);
const sitemapText = await sitemapRes.text();
const byCode = new Map();
for (const m of sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const u = m[1];
  const slug = u.split('/').filter(Boolean).pop().toLowerCase();
  const alnum = slug.replace(/[^a-z0-9]/g, '');
  if (alnum.length < 4) continue;
  const prev = byCode.get(alnum);
  // ชอบหน้า consumer (ไม่ใช่ /business/) มากกว่า
  if (!prev || (prev.includes('/business/') && !u.includes('/business/'))) byCode.set(alnum, u);
}
console.log(`sitemap URLs: ${(sitemapText.match(/<loc>/g) || []).length} | ดัชนีรุ่น: ${byCode.size}`);

// ── 3) จับคู่ URL ──
const urlOf = (code) => {
  if (OVERRIDES[code]) return OVERRIDES[code];
  const base = code.split('.')[0].replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  return byCode.get(base) || null;
};
const targets = products
  .map((p) => ({ code: p.code, slug: p.slug, name: p.name, url: urlOf(p.code) }))
  .filter((t) => t.url);
console.log(`มีหน้า LG: ${targets.length}/${products.length}`);

// ── 4) ดาวน์โหลด + สกัด ──
const results = [];
let ok = 0, fail = 0;
for (let i = 0; i < targets.length; i++) {
  const t = targets[i];
  try {
    const html = await fetchHtml(t.url);
    const { features, keySpecs, groups, featureBlocks, faq } = extractSpecsFromHtml(html);
    if (features.length === 0 && keySpecs.length === 0) throw new Error('ไม่พบคุณลักษณะ/สเปกในหน้า');
    results.push({ code: t.code, slug: t.slug, url: t.url, features, keySpecs, groups, featureBlocks, faq });
    ok++;
    console.log(`✅ [${i + 1}/${targets.length}] ${t.code} → ${features.length} จุดเด่น, ${keySpecs.length} สเปคเด่น`);
  } catch (e) {
    fail++;
    console.log(`❌ [${i + 1}/${targets.length}] ${t.code} — ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, DELAY_MS));
}

// ── 5) บันทึก ──
const out = { fetchedAt: new Date().toISOString(), source: 'https://www.lg.com/th', products: results };
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`\nบันทึก: ${path.relative(ROOT, OUT)} (${results.length} สินค้า, สำเร็จ ${ok}, ล้มเหลว ${fail})`);

const noPage = products.filter((p) => !urlOf(p.code)).map((p) => p.code);
if (noPage.length) console.log(`ไม่มีหน้า LG (ไม่เก็บสเปค): ${noPage.join(', ')}`);
