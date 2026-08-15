// Post-process หลัง refetch-missing:
// - S95TR: s-*-new.jpg (350px) เป็น thumb ซ้ำมุมของ zoom-NN.jpg (1044px) → เก็บ zoom เท่านั้น
// - WT1410NHEG: mz-N (1044) ซ้ำมุมกับ WTSBG (2010)/large-N (1600) → เลือกใหญ่สุดต่อมุม
// - GC-G24FFQKB: ตัด feature ของ gc-k24ffc2j (รุ่นอื่น) ออก
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'src/data/lg-gallery.json');
const gallery = JSON.parse(fs.readFileSync(FILE, 'utf8'));

// มุม (key) ของ URL — ใช้กับกรณีนี้โดยเฉพาะ
function angleOf(base) {
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
const sizeOf = (u) => {
  const m = u.match(/(\d{3,4})x(\d{3,4})/) || u.match(/(2010|1600|1044|450|350|260)(?=[-_.]|$)/);
  return m ? parseInt(m[1] || m[2], 10) || 0 : 0;
};

function dedupeByAngle(images) {
  const best = new Map();
  for (const u of images) {
    const base = u.split('/').pop().replace(/\.(jpg|jpeg|png|webp)$/i, '');
    let key = angleOf(base);
    if (/^\d+$/.test(key)) key = String(parseInt(key, 10)); // 01 → 1, 03 → 3 (มุมเดียวกัน)
    const prev = best.get(key);
    const sc = sizeOf(u);
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

function setImages(code, images) {
  const e = gallery.products.find((x) => x.code === code);
  if (e) e.images = images;
}

// S95TR — เก็บ zoom-NN (1044px) + s-10/11 (มุมที่ LG มีแค่ 350px ไม่มี zoom ใหญ่)
const s95 = gallery.products.find((x) => x.code === 'S95TR.DTHALLK');
if (s95) {
  const kept = s95.images.filter((u) => {
    const f = u.split('/').pop();
    if (/zoom-\d+/.test(f)) return true;
    const m = f.match(/^s95tr-s-(\d+)-new/);
    return m && !s95.images.some((v) => v.split('/').pop().includes(`zoom-${String(parseInt(m[1], 10)).padStart(2, '0')}`));
  });
  setImages('S95TR.DTHALLK', kept);
  console.log('S95TR:', s95.images.length, '→', kept.length);
  kept.forEach((u) => console.log('   ', u.split('/').pop()));
}

// WT1410NHEG — dedupe ตามมุม เก็บใหญ่สุด (WTSBG 2010 > large 1600 > mz 1044)
const wt = gallery.products.find((x) => x.code === 'WT1410NHEG.ABGPQTH');
if (wt) {
  const deduped = dedupeByAngle(wt.images);
  setImages('WT1410NHEG.ABGPQTH', deduped);
  console.log('WT1410NHEG:', wt.images.length, '→', deduped.length, 'มุม');
  deduped.forEach((u) => console.log('   ', u.split('/').pop()));
}

// GC-G24FFQKB — ตัด feature ของ gc-k24ffc2j (รุ่นอื่น)
const g24 = gallery.products.find((x) => x.code === 'GC-G24FFQKB.AEEPLM1');
if (g24) {
  const clean = g24.images.filter((u) => !/k24ffc2j|feature\//i.test(u));
  setImages('GC-G24FFQKB.AEEPLM1', clean);
  console.log('GC-G24FFQKB:', g24.images.length, '→', clean.length, '(ตัด k24ffc2j feature)');
  clean.forEach((u) => console.log('   ', u.split('/').pop()));
}

fs.writeFileSync(FILE, JSON.stringify(gallery, null, 2));
console.log('บันทึกแล้ว');
