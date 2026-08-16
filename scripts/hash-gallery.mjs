// หารูปซ้ำ/มุมเดียวกันในแกลเลอรี่ด้วย perceptual hash (เทียบเนื้อหาภาพจริง)
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const g = JSON.parse(fs.readFileSync('./src/data/lg-gallery.json', 'utf8'));
const arr = Array.isArray(g) ? g : (g.products || []);
const cacheDir = '/tmp/galhash';
fs.mkdirSync(cacheDir, { recursive: true });

const urlKey = (u) => crypto.createHash('md5').update(u).digest('hex');
const cacheFile = (u) => path.join(cacheDir, urlKey(u) + '.jpg');

async function fetchCached(u) {
  const f = cacheFile(u);
  if (fs.existsSync(f) && fs.statSync(f).size > 100) return fs.readFileSync(f);
  const r = await fetch(u);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(f, buf);
  return buf;
}

// perceptual hash 32x32 grayscale → 1024 บิต
async function phash(u) {
  const buf = await fetchCached(u);
  const img = await loadImage(buf);
  const c = createCanvas(32, 32);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, 32, 32);
  const d = ctx.getImageData(0, 0, 32, 32).data;
  let sum = 0;
  const gray = [];
  for (let i = 0; i < 1024; i++) { const v = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11; gray.push(v); sum += v; }
  const avg = sum / 1024;
  return gray.map((v) => (v >= avg ? 1 : 0));
}

function hamming(a, b) { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; }

async function main() {
  // ดาวน์โหลด + hash ทุกรูป (เก็บ cache)
  const all = new Map(); // url -> hash
  const jobs = [];
  for (const p of arr) for (const u of p.images || []) if (!all.has(u)) {
    all.set(u, null);
    jobs.push(u);
  }
  console.log('รูปทั้งหมด:', jobs.length, '— เริ่มดาวน์โหลด...');
  const concurrency = 8;
  let done = 0;
  for (let i = 0; i < jobs.length; i += concurrency) {
    const batch = jobs.slice(i, i + concurrency);
    await Promise.all(batch.map(async (u) => {
      try { all.set(u, await phash(u)); } catch (e) { console.log('  ดาวน์โหลดไม่สำเร็จ:', u.slice(-60), e.message); }
    }));
    done += batch.length;
    process.stdout.write(`\r  ${done}/${jobs.length}`);
  }
  console.log('\n');

  // เทียบภายในรุ่นเดียวกัน — เฉพาะกลุ่มที่มุมเดียวกันปรากฏในคนละโฟลเดอร์ (รูปเดียวกันคนละขนาด)
  const folderOf = (u) => u.split('/').slice(-2, -1)[0];
  let dupGroups = 0;
  for (const p of arr) {
    const imgs = (p.images || []).filter((u) => all.get(u));
    const groups = [];
    const used = new Set();
    for (let i = 0; i < imgs.length; i++) {
      if (used.has(i)) continue;
      const grp = [i];
      for (let j = i + 1; j < imgs.length; j++) {
        if (used.has(j)) continue;
        if (hamming(all.get(imgs[i]), all.get(imgs[j])) <= 8) { grp.push(j); used.add(j); }
      }
      const folders = new Set(grp.map((idx) => folderOf(imgs[idx])));
      if (grp.length > 1 && folders.size > 1) groups.push(grp);
    }
    if (groups.length) {
      dupGroups += groups.length;
      console.log('### ' + p.code + ' (รูป ' + imgs.length + ') — กลุ่มมุมซ้ำข้ามโฟลเดอร์ ' + groups.length);
      for (const grp of groups) {
        console.log('  กลุ่ม:');
        for (const idx of grp) console.log('    [โฟลเดอร์ ' + folderOf(imgs[idx]) + ']', imgs[idx].split('/').pop());
      }
    }
  }
  console.log('=== กลุ่มรูปซ้ำรวม:', dupGroups, '===');
}

main().catch((e) => { console.error(e); process.exit(1); });
