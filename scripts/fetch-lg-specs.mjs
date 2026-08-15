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

// เดิน HTML ตามลำดับ: items ก่อนหัวกลุ่มแรก = คุณลักษณะเด่น, ต่อจากหัวกลุ่ม = สเปคกลุ่มนั้น
function extractSpecsFromHtml(html) {
  const keySpecs = [];
  const groups = [];
  let current = null;
  const re = /(class="[^"]*c-compare-selling__table-head[^"]*"[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>)|(<li[^>]*class="[^"]*c-compare-selling__item[^"]*"[\s\S]*?<\/li>)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) {
      const title = stripTags(m[2]);
      if (!title) continue;
      current = { title, specs: [] };
      groups.push(current);
    } else if (m[3]) {
      const item = parseItem(m[3]);
      if (!item) continue;
      if (current) current.specs.push(item);
      else keySpecs.push(item);
    }
  }
  return { keySpecs, groups };
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
    const { keySpecs, groups } = extractSpecsFromHtml(html);
    if (groups.length === 0 && keySpecs.length === 0) throw new Error('ไม่พบตารางสเปกในหน้า');
    results.push({ code: t.code, slug: t.slug, url: t.url, keySpecs, groups });
    ok++;
    console.log(`✅ [${i + 1}/${targets.length}] ${t.code} → ${groups.length} กลุ่ม, ${keySpecs.length} จุดเด่น`);
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
