import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync('src/data/color-galleries.json', 'utf8'));
const UA = 'Mozilla/5.0';
const urls = [];
for (const p of d.products) for (const c of p.colors) for (const u of c.images) urls.push(u);
console.log('total:', urls.length);
let total = urls.length, ok = 0, fail = 0;
const CONC = 4;
for (let i = 0; i < urls.length; i += CONC) {
  const batch = urls.slice(i, i + CONC);
  await Promise.all(batch.map(async (u) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(u, { headers: { 'user-agent': UA }, signal: ctrl.signal });
      clearTimeout(t);
      if (r.ok) ok++; else { fail++; console.log(`❌ HTTP ${r.status} ${u.slice(-70)}`); }
    } catch (e) { fail++; console.log(`❌ ${e.message.slice(0, 30)} ${u.slice(-70)}`); }
  }));
}
console.log(`\n${ok}/${total} URL ตอบ OK (${fail} ล้มเหลว)`);
