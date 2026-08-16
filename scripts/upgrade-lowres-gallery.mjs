// หารูปแกลเลอรี่ที่เล็กเกินไป แล้วแทนด้วยมุมเดียวกันขนาดใหญ่กว่า
// รอบ 1 (ไม่ใช้เน็ต): มุมเดียวกันขนาดใหญ่กว่าที่มีอยู่แล้วในข้อมูล (basename ตรงกัน)
// รอบ 2 (ใช้เน็ต): เฉพาะรูปที่ยังเล็ก — ลองแทน path เป็น variant ใหญ่ใน LG CDN
// รัน: node scripts/upgrade-lowres-gallery.mjs         → แสดงผล
//      node scripts/upgrade-lowres-gallery.mjs --apply → เขียนกลับลง JSON
import fs from 'fs';
import crypto from 'crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const APPLY = process.argv.includes('--apply');
const MIN_W = 800;
const MIN_BYTES = 15000;

const load = (f) => {
  const g = JSON.parse(fs.readFileSync(f, 'utf8'));
  return Array.isArray(g) ? g : (g.products || []);
};
const FILES = ['./src/data/lg-gallery.json', './src/data/color-galleries.json'];
const arrs = FILES.map(load);

const cacheDir = '/tmp/galhash';
fs.mkdirSync(cacheDir, { recursive: true });
const cacheFile = (u) => cacheDir + '/' + crypto.createHash('md5').update(u).digest('hex') + '.jpg';
async function fetchCached(u) {
  const f = cacheFile(u);
  if (fs.existsSync(f) && fs.statSync(f).size > 100) return { buf: fs.readFileSync(f), bytes: fs.statSync(f).size };
  const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(f, buf);
  return { buf, bytes: buf.length };
}
async function measure(u) {
  const { buf, bytes } = await fetchCached(u);
  const img = await loadImage(buf);
  return { w: img.width, h: img.height, bytes };
}
const infoCache = new Map();
async function getInfo(u) {
  if (!infoCache.has(u)) {
    try { infoCache.set(u, await measure(u)); } catch { infoCache.set(u, null); }
  }
  return infoCache.get(u);
}

// รวม URL ทั้งหมดพร้อมตำแหน่ง
const refs = [];
arrs.forEach((arr, fi) => {
  arr.forEach((p, ei) => {
    for (const u of (p.images || [])) refs.push({ fi, ei, key: null, url: u });
    for (const col of (p.colors || [])) for (const u of (col.images || [])) refs.push({ fi, ei, key: col.key, url: u });
  });
});

// ---- รอบ 1: basename เดียวกัน ขนาดใหญ่กว่าในข้อมูล (ไม่ใช้เน็ต) — เฉพาะรุ่นเดียวกัน ----
console.log('รอบ 1: หามุมเดียวกันขนาดใหญ่กว่าที่มีอยู่แล้วในข้อมูล...');
const codeOf = (fi, ei) => { const p = arrs[fi][ei]; return p ? p.code : ''; };
const byBase = new Map();
for (const r of refs) {
  const key = codeOf(r.fi, r.ei) + '::' + r.url.split('/').pop();
  if (!byBase.has(key)) byBase.set(key, []);
  byBase.get(key).push(r);
}
// วัดเฉพาะที่จำเป็น (ที่อาจใช้เป็นตัวอัปเกรด) — ใช้ cache เดิมที่มี
const baseInfo = new Map();
for (const [base, rs] of byBase) {
  if (rs.length < 2) continue;
  for (const r of rs) {
    const info = await getInfo(r.url).catch(() => null);
    if (info) baseInfo.set(r.url, info);
  }
}
const replacements = [];
for (const [base, rs] of byBase) {
  if (rs.length < 2) continue;
  for (const r of rs) {
    const cur = baseInfo.get(r.url);
    if (!cur) continue;
    let best = null;
    for (const o of rs) {
      if (o === r) continue;
      const oi = baseInfo.get(o.url);
      if (oi && oi.w > (best ? best.w : cur.w)) best = { url: o.url, w: oi.w };
    }
    if (best && best.w > cur.w + 100) replacements.push({ ...r, from: { url: r.url, w: cur.w }, to: best });
  }
}
console.log(`  รอบ 1 พบ ${replacements.length} รูป (basename ซ้ำขนาดใหญ่กว่า)`);

// ---- รอบ 2: รูปที่ยังเล็ก → ลอง network หา variant ใหญ่ ----
function candidates(u) {
  const list = [];
  const add = (v) => { if (v !== u) list.push(v); };
  add(u.replace(/(^|\/)thumbnail\//i, '$1gallery/'));
  add(u.replace(/(^|\/)thumbnail\//i, '$1basic/'));
  add(u.replace(/[_-]350\.(jpg|png)$/i, '-2010.$1'));
  add(u.replace(/[_-]450\.(jpg|png)$/i, '-2010.$1'));
  add(u.replace(/[_-]180\.(jpg|png)$/i, '-2010.$1'));
  add(u.replace(/[_-]768\.(jpg|png)$/i, '-2010.$1'));
  add(u.replace(/[_-]1044\.(jpg|png)$/i, '-2010.$1'));
  add(u.replace(/\/1044x1334\//i, '/2010x1334/'));
  add(u.replace(/\/1044x1334\//i, '/1600x1062/'));
  add(u.replace(/\/1600x1062\//i, '/2010x1334/'));
  add(u.replace(/\/350-(\d+)\.(jpg|png)$/i, '/2010-$1.$2'));
  return list;
}
async function findBiggerNetwork(u) {
  const cur = await getInfo(u);
  if (!cur || cur.w >= MIN_W && cur.bytes >= MIN_BYTES) return null;
  let best = null;
  for (const cand of new Set(candidates(u))) {
    const m = await getInfo(cand);
    if (m && m.w > (best ? best.w : cur.w)) best = { url: cand, w: m.w };
  }
  return best;
}

const replacedUrls = new Set(replacements.map((r) => r.url));
const stillSmall = refs.filter((r) => !replacedUrls.has(r.url));
console.log('รอบ 2: ลองหา variant ใหญ่ใน LG CDN สำหรับรูปที่ยังเล็ก (' + stillSmall.length + ' รูป)...');
let n2 = 0;
for (let i = 0; i < stillSmall.length; i += 8) {
  const batch = stillSmall.slice(i, i + 8);
  await Promise.all(batch.map(async (r) => {
    const info = await getInfo(r.url);
    if (!info) return;
    if (info.w >= MIN_W && info.bytes >= MIN_BYTES) return;
    const better = await findBiggerNetwork(r.url);
    if (better) { replacements.push({ ...r, from: { url: r.url, w: info.w }, to: better }); n2++; }
  }));
}
console.log(`  รอบ 2 พบ ${n2} รูป`);

// ---- รายงาน ----
console.log('\n=== อัปเกรดทั้งหมด ' + replacements.length + ' รูป ===');
for (const rep of replacements) {
  const where = rep.key ? 'color ' + rep.key : 'gallery';
  console.log(`🆙 ${rep.from.w}px → ${rep.to.w}px [${where}] ${rep.from.url.split('/').pop()}`);
}
const fromSet = new Set(replacements.map((r) => r.from.url));
const toSet = new Set(replacements.map((r) => r.to.url));
console.log(`\nจาก ${fromSet.size} รูป → เป็น ${toSet.size} รูป (แทนที่)`);

if (APPLY) {
  let applied = 0;
  for (const r of replacements) {
    const target = arrs[r.fi][r.ei];
    if (r.key) {
      const col = (target.colors || []).find((c) => c.key === r.key);
      if (!col) continue;
      const i = col.images.indexOf(r.url);
      if (i >= 0) { col.images[i] = r.to.url; applied++; }
    } else {
      const i = (target.images || []).indexOf(r.url);
      if (i >= 0) { target.images[i] = r.to.url; applied++; }
    }
  }
  FILES.forEach((f, fi) => {
    const orig = JSON.parse(fs.readFileSync(f, 'utf8'));
    const wrapped = Array.isArray(orig) ? arrs[fi] : { ...orig, products: arrs[fi] };
    fs.writeFileSync(f, JSON.stringify(wrapped, null, 2) + '\n');
  });
  console.log(`✅ เขียนกลับแล้ว (${applied} รูป)`);
} else {
  console.log('(รันด้วย --apply เพื่อเขียนกลับลง JSON)');
}
