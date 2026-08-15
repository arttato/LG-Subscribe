// แก้การ์ด 13 รุ่นที่ใช้รูปแนวตั้ง 1044x1334 (มุมแรก gallery เป็น feature/zoom แนวตั้ง)
// → ใช้ og:image ของหน้า (gallery-basic 450x450 ภาพตัวสินค้าจริงสแควร์) แทน
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'public', 'img', 'products');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const specs = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/lg-specs.json'), 'utf8')).products;
const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/products.json'), 'utf8')).products;

const TARGETS = ['100QNED86BS.ATM', '32LX6BDGA.ATM', '32U889SA-W.ATM', '45GX950A-B.ATM',
  '55QNED80BSA.ATM', '65NU855BPSA.ATM', '65QNED80BSA.ATM', '75NU855BPSA.ATM',
  '85QNED80BSA.ATM', 'GC-B48FPGAM.ADBPLMT', 'GC-L24FFCBB.AEVPLM1', 'S70TY.ATHALLD',
  'XBOOM-STAGE301'];

async function ogImage(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'th-TH,th;q=0.9,en;q=0.8' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`page HTTP ${res.status}`);
  const html = await res.text();
  const og = html.match(/property="og:image"\s+content="([^"]+)"/);
  if (!og) throw new Error('no og:image');
  return og[1];
}

let ok = 0, fail = 0;
for (const code of TARGETS) {
  const spec = specs.find((s) => s.code === code);
  const prod = products.find((p) => p.code === code);
  if (!spec || !prod) { console.log(`SKIP ${code}`); continue; }
  try {
    const src = await ogImage(spec.url);
    const r = await fetch(src, { headers: { 'user-agent': UA }, redirect: 'follow' });
    if (!r.ok) throw new Error(`img HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not jpeg: ' + src.split('/').pop());
    fs.writeFileSync(path.join(OUT_DIR, `${prod.slug}.jpg`), buf);
    ok++;
    console.log(`OK ${code} <- ${src.split('/').pop()} (${(buf.length / 1024).toFixed(0)}KB)`);
  } catch (e) {
    fail++;
    console.log(`FAIL ${code}: ${e.message}`);
  }
}
console.log(`done ok=${ok} fail=${fail}`);
