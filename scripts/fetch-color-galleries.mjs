// ดึง gallery แยกสีของสินค้าที่มีหลายสีจากเว็บ LG Thailand → src/data/color-galleries.json
// ครอบคลุม: เครื่องกรองน้ำ WD516/WD518 (3 สี) + ตระกูลเครื่องซักผ้า/WashTower (2 สีต่อรุ่น)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'data', 'color-galleries.json');
const LG_GALLERY_FILE = path.join(ROOT, 'src', 'data', 'lg-gallery.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const DELAY_MS = 250;

// ── ตระกูลสีของแต่ละรุ่น: [รหัสในแคตตาล็อก] → [สี...]
// key = ตัวระบุสี, th = ชื่อไทย, model = รหัสเต็มของ LG, url = หน้าสีนั้น
// สีแรก = สีหลักที่หน้าแคตตาล็อก/การ์ดใช้อยู่
const FAMILIES = {
  // ── เครื่องกรองน้ำ (3 สี) ──
  WD516: [
    { key: 'navy',   th: 'น้ำเงิน', model: 'WD516AN.ACNPLMT', url: 'https://www.lg.com/th/water-purifiers/wd516an-acnplmt/', swatch: '#2f4a6e' },
    { key: 'white',  th: 'ขาว',    model: 'WD516AN.AEWPLMT', url: 'https://www.lg.com/th/water-purifiers/wd516an-aewplmt/', swatch: '#f2f2f2' },
    { key: 'silver', th: 'เงิน',    model: 'WD516AN.ASLPLMT', url: 'https://www.lg.com/th/water-purifiers/wd516an-aslplmt/', swatch: '#b9bec6' },
  ],
  WD518: [
    { key: 'beige',  th: 'เบจ',     model: 'WD518AN.ABGPLMT', url: 'https://www.lg.com/th/water-purifiers/wd518an-abgplmt/', swatch: '#d9c6a9' },
    { key: 'white',  th: 'ขาว',    model: 'WD518AN.AWHPLMT', url: 'https://www.lg.com/th/water-purifiers/wd518an-awhplmt/', swatch: '#f2f2f2' },
    { key: 'gray',   th: 'เทา',     model: 'WD518AN.ACGPLMT', url: 'https://www.lg.com/th/water-purifiers/wd518an-acgplmt/', swatch: '#8d9198' },
  ],
  // ── WashTower 14/10 กก. (2 สี — แยกการ์ดตามสี) ──
  'WT1410NHEG.ABGPQTH': [
    { key: 'naturalgreen', th: 'เขียวธรรมชาติ', model: 'WT1410NHEG', url: 'https://www.lg.com/th/laundry/wash-tower/wt1410nheg/', swatch: '#8b9b7e' },
    { key: 'bluewhite',    th: 'น้ำเงินขาว',    model: 'WT1410NHEN', url: 'https://www.lg.com/th/laundry/wash-tower/wt1410nhen/', swatch: '#b8c4d6' },
  ],
  'WT1410NHEN.ABNPQTH': [
    { key: 'bluewhite',    th: 'น้ำเงินขาว',    model: 'WT1410NHEN', url: 'https://www.lg.com/th/laundry/wash-tower/wt1410nhen/', swatch: '#b8c4d6' },
    { key: 'naturalgreen', th: 'เขียวธรรมชาติ', model: 'WT1410NHEG', url: 'https://www.lg.com/th/laundry/wash-tower/wt1410nheg/', swatch: '#8b9b7e' },
  ],
  // ── WashTower 25/20 กก. (2 สี — แยกการ์ดตามสี) ──
  'WT2520NHEG.ABGPETH': [
    { key: 'naturalgreen', th: 'เขียวธรรมชาติ', model: 'WT2520NHEG', url: 'https://www.lg.com/th/laundry/wash-tower/wt2520nheg/', swatch: '#8b9b7e' },
    { key: 'navy',         th: 'น้ำเงินกรม',    model: 'WT2520NHEN', url: 'https://www.lg.com/th/laundry/wash-tower/wt2520nhen/', swatch: '#2f4a6e' },
  ],
  'WT2520NHEN.ABNPETH': [
    { key: 'navy',         th: 'น้ำเงินกรม',    model: 'WT2520NHEN', url: 'https://www.lg.com/th/laundry/wash-tower/wt2520nhen/', swatch: '#2f4a6e' },
    { key: 'naturalgreen', th: 'เขียวธรรมชาติ', model: 'WT2520NHEG', url: 'https://www.lg.com/th/laundry/wash-tower/wt2520nheg/', swatch: '#8b9b7e' },
  ],
};

function extractFlightStrings(html) {
  const out = [];
  const re = /self\.__next_f\.push\(\[1,/g;
  let m;
  while ((m = re.exec(html))) {
    const q = html.indexOf('"', m.index + m[0].length);
    if (q === -1) continue;
    let i = q + 1, raw = '';
    while (i < html.length) {
      const c = html[i];
      if (c === '\\') { raw += c + (html[i + 1] ?? ''); i += 2; continue; }
      if (c === '"') break;
      raw += c; i++;
    }
    try { out.push(JSON.parse('"' + raw + '"')); } catch { }
  }
  return out;
}

function angleKey(base) {
  let b = base.replace(/-new$/i, '');
  b = b.replace(/(?:gallery-2010|mobilezoom|thumbnail|basic-large|basic|zoom|large|small|medium)/gi, '');
  b = b.replace(/\d{3,4}x\d{3,4}/gi, '');
  b = b.replace(/[-_]?(?:2010|1600|1044|450|350|165|180)(?=[-_.]|$)/gi, '');
  if (/^\d{3,4}$/.test(b) || b === '') return '0';
  const lead = b.match(/^(\d{1,3})-\D/);
  if (lead) return lead[1];
  const nums = b.match(/\d+/g);
  if (nums && nums.length) return nums[nums.length - 1];
  return base;
}

// ตัวแยกง่ายๆ (parsePhoto) — เหมาะกับรุ่นที่โฟลเดอร์เป็น /gallery/ ชัดเจน (WD516/518)
function parsePhoto(rel) {
  const base = rel.split('/').pop();
  const pathNums = [...rel.matchAll(/(\d+)x(\d+)/g)].flatMap((m) => [parseInt(m[1], 10), parseInt(m[2], 10)]);
  const fileNums = [...base.matchAll(/(\d+)/g)].map((m) => parseInt(m[1], 10));
  const allNums = [...pathNums, ...fileNums];
  if (!allNums.length) return null;
  const width = Math.max(...allNums);
  let nn;
  const paren = base.match(/\((\d+)\)/);
  if (paren) nn = parseInt(paren[1], 10);
  else {
    const lead = base.match(/^(\d+)[_.]/);
    if (lead) nn = parseInt(lead[1], 10);
    else {
      const others = fileNums.filter((n) => n !== width && !pathNums.includes(n));
      nn = others.length ? Math.min(...others) : 1;
    }
  }
  const url = rel.startsWith('http') ? rel : 'https://www.lg.com' + rel;
  return { nn, width, url };
}

function extractGallerySimple(html) {
  const flight = extractFlightStrings(html).join('');
  const best = new Map();
  const re = /"((?:https?:\/\/www\.lg\.com|\/content\/dam[^"]*|\/th\/image-update[^"]*|\/th\/images[^"]*)[^"]*\.(?:jpg|png|webp))"/gi;
  for (const m of flight.matchAll(re)) {
    const rel = m[1];
    if (!isGalleryFolderUrl(rel)) continue;
    const parsed = parsePhoto(rel);
    if (!parsed) continue;
    const key = String(parsed.nn);
    const prev = best.get(key);
    if (!prev || parsed.width > prev.width) best.set(key, parsed);
  }
  return [...best.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true }))
    .map(([, v]) => v.url);
}

function isGalleryFolderUrl(rel) {
  const segs = rel.split('/').filter(Boolean);
  for (const s of segs.slice(0, -1)) {
    if (s === 'gallery' || s.startsWith('gallery') || s.endsWith('-gallery')) return true;
  }
  return false;
}

function sizeScore(u, base) {
  let s = 0;
  if (/\/gallery\//i.test(u)) s += 10;
  if (/\d{4}x\d{3,4}|[-_]?(?:2010|1600|1044)(?=[-_.]|$)/i.test(u)) s += 25;
  if (/\d{3}x\d{3,4}|[-_]?450(?=[-_.]|$)/i.test(u)) s += 10;
  if (/^DZ/i.test(base)) s += 12;
  if (/^(L|LM)/i.test(base)) s += 11;
  if (/^(D|MZ|M)/i.test(base)) s += 6;
  if (/^S-|thumbnail|mobilezoom|small|^S\b|-s-\d+(?:-new)?$/i.test(base)) s -= 10;
  if (/^basic|^260-|^350-|[-_]?260|[-_]?350(?=[-_.]|$)/i.test(base)) s -= 5;
  return s;
}

// เก็บ URL gallery ทั้งหมดจากหน้า (กรองโฆษณา/สเปค) — ครอบคลุมโฟลเดอร์ + ชื่อไฟล์
function collectGallery(html, code) {
  const flight = extractFlightStrings(html).join('');
  const codeKey = (code || '').split('.')[0].toLowerCase();
  const urls = [];
  const re = /"((?:https?:)?[^"]*?\.(?:jpg|jpeg|png|webp))"/gi;
  for (const m of (flight + '\n' + html).matchAll(re)) {
    let u = m[1].replace(/\\\//g, '/');
    if (u.startsWith('/')) u = 'https://www.lg.com' + u;
    if (!/gallery|\/image-update\/|\/th\/images\//i.test(u)) continue;
    if (/\/conf\/|jcr:content\/renditions|thumbnail\.png/.test(u)) continue;
    if (/\/(promotion|banner|gnb|birthday|campaign|internal|monthly|pdp-banner|spec|features)\//i.test(u)) continue;
    const fname = u.split('/').pop();
    const isOwn = codeKey && u.toLowerCase().includes(codeKey);
    if (isOwn) {
      if (/Monitor_|Pre-order|GNB|Influencer|Tech-Spec|specfication|Intro-D|best-water-dispenser|microinfluencer/i.test(fname)) continue;
    } else {
      if (/Monitor_|Pre-order|GNB|Influencer|Tech-Spec|specfication|^TH-|^350-|^thumb-|Dryer-EU|^ref-|^wd-|^AP-|^Dehumidifier_|Intro-D|best-water-dispenser|microinfluencer|^HA-|\(thumbnail\)/i.test(fname)) continue;
    }
    urls.push(u);
  }
  const best = new Map();
  for (const u of urls) {
    const base = u.split('/').pop().replace(/\.(jpg|jpeg|png|webp)$/i, '');
    let key = angleKey(base);
    if (/^\d+$/.test(key)) key = String(parseInt(key, 10));
    const prev = best.get(key);
    const sc = sizeScore(u, base);
    if (!prev || sc > prev.score) best.set(key, { url: u, score: sc });
  }
  return [...best.entries()]
    .sort((a, b) => {
      const na = parseInt(a[0], 10);
      const nb = parseInt(b[0], 10);
      if (Number.isNaN(na) && Number.isNaN(nb)) return a[0].localeCompare(b[0]);
      if (Number.isNaN(na)) return 1;
      if (Number.isNaN(nb)) return -1;
      return na - nb;
    })
    .map(([, v]) => v.url);
}

// ชื่อสินค้าเต็ม (h1/og:title) — ตัด trailing " - CODE" ที่ LG ต่อท้าย
function extractLgName(html) {
  let name = '';
  const og = html.match(/property="og:title" content="([^"]+)"/);
  if (og && og[1]) name = og[1].replace(/\s*\|\s*LG Thailand.*$/i, '').trim();
  else {
    const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    if (h1) name = h1[1].trim();
  }
  return name.replace(/\s*-\s*[A-Z0-9]+(?:\.[A-Z0-9]+)*\s*$/i, '').trim();
}

// รูปจาก lg-gallery.json ที่ audit ผ่านแล้ว (ใช้แทนการ fetch ใหม่ ถ้ารุ่นนั้นมี) — key = รหัสก่อนจุด
const lgGalleryFile = JSON.parse(fs.readFileSync(LG_GALLERY_FILE, 'utf8'));
const lgByPrefix = new Map();
for (const entry of lgGalleryFile.products) {
  const prefix = entry.code.split('.')[0].toLowerCase();
  lgByPrefix.set(prefix, entry.images);
}

// ชื่อเต็มจาก lg-specs.json (audit ผ่านแล้ว) — key = รหัสก่อนจุด
const lgSpecsFile = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'lg-specs.json'), 'utf8'));
const lgNameByPrefix = new Map();
for (const entry of lgSpecsFile.products) {
  if (entry.lgName) lgNameByPrefix.set(entry.code.split('.')[0].toLowerCase(), entry.lgName);
}

const products = [];
for (const [code, variants] of Object.entries(FAMILIES)) {
  const colors = [];
  for (const v of variants) {
    try {
      const codeKey = v.model.split('.')[0].toLowerCase();
      // key กรองรูปของตัวเอง = สลัก URL ของหน้าสีนั้น (เช่น wd516an-aslplmt) — แม่นกว่ารหัสรุ่น (กันรูป feature สีอื่นปน)
      const slugKey = v.url.split('/').filter(Boolean).pop().toLowerCase();
      let images = lgByPrefix.get(codeKey) || null;
      // ชื่อเต็ม: ใช้จาก lg-specs ก่อน (audit ผ่าน) — ถ้าไม่มี (รุ่นใหม่/คู่สีที่ไม่อยู่ในแคตตาล็อก) fetch หน้า LG
      let lgName = lgNameByPrefix.get(codeKey) || '';
      let fromCache = true;
      if (!images || !lgName) {
        // ยังไม่มีใน lg-gallery / lg-specs → fetch หน้า LG จริง
        const res = await fetch(v.url, {
          headers: { 'user-agent': UA, 'accept-language': 'th-TH,th;q=0.9,en;q=0.8' },
          redirect: 'follow',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const imagesRobust = collectGallery(html, v.model);
        const imagesSimple = extractGallerySimple(html);
        const imagesAll = imagesRobust.length >= imagesSimple.length ? imagesRobust : imagesSimple;
        const own = imagesAll.filter((u) => u.toLowerCase().includes(slugKey));
        images = own.length >= 3 ? own : imagesAll;
        lgName = lgName || extractLgName(html);
        fromCache = false;
      }
      if (!images || images.length < 2) throw new Error(`gallery แค่ ${images ? images.length : 0} รูป`);
      colors.push({
        key: v.key,
        th: v.th,
        model: v.model,
        url: v.url,
        lgName: lgName || v.model,
        swatch: v.swatch,
        images,
      });
      console.log(`✅ ${code} → ${v.th} (${v.key}) ${images.length} มุม${fromCache ? ' (cache)' : ''}`);
    } catch (e) {
      console.log(`❌ ${code} → ${v.th} (${v.key}) — ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  if (colors.length >= 2) products.push({ code, colors });
}

const out = { fetchedAt: new Date().toISOString(), source: 'https://www.lg.com/th', products };
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`\nบันทึก: ${path.relative(ROOT, OUT)} (${products.length} รุ่น)`);
