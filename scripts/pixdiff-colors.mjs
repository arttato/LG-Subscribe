import fs from 'fs';
import crypto from 'crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
const g = JSON.parse(fs.readFileSync('./src/data/color-galleries.json', 'utf8'));
const arr = Array.isArray(g) ? g : (g.products || []);
const cacheDir = '/tmp/galhash';
const fetchCached = async (u) => {
  const f = cacheDir + '/' + crypto.createHash('md5').update(u).digest('hex') + '.jpg';
  if (fs.existsSync(f) && fs.statSync(f).size > 100) return fs.readFileSync(f);
  const r = await fetch(u);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(f, buf);
  return buf;
};
async function norm64(u) {
  const buf = await fetchCached(u);
  const img = await loadImage(buf);
  const c = createCanvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, 128, 128);
  const d = ctx.getImageData(0, 0, 128, 128).data;
  const out = new Float32Array(16384);
  for (let i = 0; i < 16384; i++) out[i] = (d[i*4]*0.3 + d[i*4+1]*0.59 + d[i*4+2]*0.11) / 255;
  return out;
}
function diff(a, b) { let s = 0; for (let i = 0; i < 16384; i++) s += Math.abs(a[i]-b[i]); return s / 16384; }
let dupGroups = 0;
for (const p of arr) {
  for (const col of (p.colors || [])) {
    const imgs = col.images || [];
    if (imgs.length < 2) continue;
    const norms = [];
    for (const u of imgs) { try { norms.push(await norm64(u)); } catch { norms.push(null); } }
    const used = new Set();
    for (let i = 0; i < imgs.length; i++) {
      if (used.has(i) || !norms[i]) continue;
      const grp = [i];
      for (let j = i + 1; j < imgs.length; j++) {
        if (used.has(j) || !norms[j]) continue;
        if (diff(norms[i], norms[j]) < 0.005) { grp.push(j); used.add(j); }
      }
      if (grp.length > 1) {
        dupGroups++;
        console.log('### ' + p.code + ' [' + col.key + '] — กลุ่มมุมเดียวกัน');
        for (const idx of grp) console.log('    ', imgs[idx].split('/').pop());
        console.log('    ---');
      }
    }
  }
}
console.log('=== กลุ่มรูปมุมเดียวกันรวม (color-galleries):', dupGroups, '===');
