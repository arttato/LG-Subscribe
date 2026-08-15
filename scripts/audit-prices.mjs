// ตรวจราคา: replay การจับคู่ policy row (nearest anchor) แบบเดียวกับ extract.mjs
// แล้วเทียบกับ policy/price ที่เก็บใน products.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractLines } from './lib/pdf-layout.mjs';
import { parsePage, buildBlock } from './extract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/products.json'), 'utf8'));
const stored = new Map(data.products.map((p) => [p.code, p]));

const PDFS = ['pdfs/Price list_Aug_V3.pdf', 'pdfs/Sale Price8 - Subscription_V3.pdf'];
const pdfKey = (f) => f.split('/').pop().replace(/%20/g, ' ');

// replay ทุกหน้า → รวม policy ต่อรหัส
const replayed = new Map(); // code -> [{policy, price}]
for (const file of PDFS) {
  if (!fs.existsSync(file)) continue;
  const pages = await extractLines(file);
  for (const pg of pages) {
    const items = pg.lines.map((l) => ({ y: l.y, text: l.text }));
    const parsed = parsePage(pg.page, items, null, pdfKey(file));
    for (const model of parsed.products) {
      const block = buildBlock(model, pdfKey(file));
      for (const r of block.policies) {
        if (r.price == null) continue;
        const list = replayed.get(block.code) || [];
        const key = `${r.policy}|${r.price}`;
        if (!list.some((x) => `${x.policy}|${x.price}` === key)) list.push({ policy: r.policy, price: r.price });
        replayed.set(block.code, list);
      }
    }
  }
}

let ok = 0, issues = 0;
const norm = (s) => s.replace(/\s+/g, '_').toLowerCase();
for (const [code, p] of stored) {
  const rp = replayed.get(code);
  if (!rp) { continue; } // รุ่นที่ไม่ได้มาจาก PDF (Sound bar)
  const st = new Map(p.policies.map((x) => [norm(x.policy), x.price]));
  const rpMap = new Map(rp.map((x) => [norm(x.policy), x.price]));
  const diffs = [];
  for (const [k, v] of rpMap) {
    if (st.has(k) && st.get(k) !== v) diffs.push(`${p.policies.find((x) => norm(x.policy) === k).policy}: ระบบ=${st.get(k)} PDF=${v}`);
    else if (!st.has(k)) diffs.push(`${rp.find((x) => norm(x.policy) === k).policy}: ไม่มีในระบบ PDF=${v}`);
  }
  if (diffs.length) {
    issues++;
    console.log(`❌ ${code} (เริ่มต้น=${p.price}):\n   ${diffs.join('\n   ')}`);
  } else ok++;
}
console.log(`\nสรุป: ถูกต้อง ${ok}, มีปัญหา ${issues} จาก ${data.products.length}`);
