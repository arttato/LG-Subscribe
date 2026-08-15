// วินิจฉัย: รัน parsePage กับบรรทัดจาก debug dump แล้วโชว์สินค้าที่เจอ
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePage, buildBlock } from './extract.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] || 'debug-Sale Price8 - Subscription_V3.txt';
const txt = fs.readFileSync(path.join(ROOT, 'scripts', file), 'utf8');
const parts = txt.split(/===== หน้า (\d+) =====/).slice(1);

for (let i = 0; i < parts.length; i += 2) {
  const pageNo = parts[i];
  const lines = (parts[i + 1] || '')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^\[(\d+)\] (.*)$/);
      return m ? { y: Number(m[1]), text: m[2] } : { y: 0, text: l };
    });
  const { category, products } = parsePage(Number(pageNo), lines, null);
  const out = products.map((pr) => {
    const b = buildBlock(pr, file);
    return `   ${b.code} | ราคา ${b.price} (${b.priceFrom}) | rows ${b.policies.length} | ${b.category || '-'}`;
  });
  if (products.length) {
    console.log(`หน้า ${pageNo} (cat=${category || '-'}): ${products.length} สินค้า`);
    for (const l of out) console.log(l);
  }
}
