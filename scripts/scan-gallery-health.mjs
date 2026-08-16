// สแกนสุขภาพแกลเลอรี่ทั้งหมด: ดาวน์โหลดทุกรูป หาไฟล์แตก (เล็กเกินไป) + รูปที่โฟลเดอร์ไม่ใช่แกลเลอรี่สินค้า
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MIN_BYTES = 5 * 1024; // ไฟล์ < 5KB = น่าสงสัย (ไฟล์แตกของ LG มัก ~1KB)

const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/lg-gallery.json'), 'utf8'));
const c = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/color-galleries.json'), 'utf8'));

const all = [];
for (const p of g.products) for (const u of p.images) all.push({ code: p.code, url: u, src: 'lg-gallery' });
for (const p of c.products) for (const col of p.colors) for (const u of col.images || []) all.push({ code: `${p.code} (${col.key})`, url: u, src: 'color' });
console.log(`ตรวจ ${all.length} รูป (${g.products.length} รุ่น lg-gallery + ${c.products.length} รุ่นสี)`);

// โฟลเดอร์แกลเลอรี่ที่ยอมรับได้ (โฟลเดอร์สุดท้ายก่อนชื่อไฟล์)
const OK_FOLDER = /^(gallery|gallery-new|gallery-1|thumbnail|zoom|basic|desktop|mobile|update|gp1|1600x1062|2010x1334|2010|1044x1334|04-thumbnail|03-zoom|03-mobile-zoom|01-basic|new-image|re-gallery|350|02-gallery|03-mobilezoom|basic_|img)$/i;
// โฟลเดอร์ที่ตั้งชื่อตามรุ่น (เช่น wt1410nhen, gn-f452pqak) — อนุญาตถ้าตรงรุ่นตัวเอง
const modelFolder = (code) => code.split('.')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();

const broken = [];
const oddFolder = [];
const errors = [];
const results = [];

const workers = [];
const CONC = 12;
const queue = [...all];
let idx = 0;
async function worker() {
  while (idx < queue.length) {
    const item = queue[idx++];
    try {
      const res = await fetch(item.url, { headers: { 'user-agent': UA }, redirect: 'follow' });
      if (!res.ok) { errors.push({ ...item, status: res.status }); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      const size = buf.length;
      const folder = (item.url.split('?')[0].split('/')).slice(-2)[0];
      const isModelFolder = folder.toLowerCase() === modelFolder(item.code) || modelFolder(item.code).startsWith(folder.toLowerCase().split('_')[0].replace(/[^a-z0-9]/gi,'')) || folder.toLowerCase().startsWith(modelFolder(item.code).slice(0, 8));
      if (size < MIN_BYTES) broken.push({ ...item, sizeKB: (size / 1024).toFixed(1), folder });
      else if (!OK_FOLDER.test(folder) && !isModelFolder) oddFolder.push({ ...item, folder });
      results.push({ code: item.code, size, ok: true });
    } catch (e) {
      errors.push({ ...item, error: e.message });
    }
  }
}
for (let i = 0; i < CONC; i++) workers.push(worker());
await Promise.all(workers);

console.log(`\n── ไฟล์แตก/เล็กเกิน (<${MIN_BYTES / 1024}KB): ${broken.length}`);
for (const b of broken) console.log(`  ❌ ${b.code} | ${b.sizeKB}KB | ${b.url.split('/').pop()}`);

console.log(`\n── โฟลเดอร์ไม่ใช่แกลเลอรี่สินค้า: ${oddFolder.length}`);
for (const b of oddFolder) console.log(`  ⚠ ${b.code} | [${b.folder}] | ${b.url.split('/').pop()}`);

console.log(`\n── ดาวน์โหลด error: ${errors.length}`);
for (const b of errors) console.log(`  ❌ ${b.code} | ${b.status || b.error} | ${b.url.split('/').pop()}`);
