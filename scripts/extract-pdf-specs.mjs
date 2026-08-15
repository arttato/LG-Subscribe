// ดึงสเปคย่อของสินค้าที่เว็บ LG ไม่มีหน้า จากคอลัมน์ "รายการ" ใน PDF ราคา
// (ขนาดตัวเครื่อง, ความจุ, BTU, การรับประกัน ฯลฯ) → src/data/pdf-specs.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractLines } from './lib/pdf-layout.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src', 'data', 'pdf-specs.json');
const BLOCK_ABOVE = 40;  // pt เหนือ anchor (สำหรับสินค้าที่ anchor ด้วยบรรทัดรหัส)
const BLOCK_BELOW = 180; // pt ใต้ anchor

// ข้อความที่ควรจับเป็นสเปค — ใช้กับบรรทัดในแถบของสินค้า
const thaiJoin = (s) => s
  .replace(/([\u0E00-\u0E7F])\s+(?=[\u0E00-\u0E7F])/g, '$1')
  .replace(/น้า/g, 'น้ำ')
  .replace(/\s+/g, ' ')
  .trim();

function parseBlock(lines) {
  const specs = [];
  const push = (name, value) => {
    if (value && !specs.some((s) => s.name === name)) specs.push({ name, value });
  };

  let label = null; // 'indoor' | 'outdoor' | 'product' — label ล่าสุดที่เจอ
  let warrantyLine = null; // y ของบรรทัด "รับประกันมอเตอร์..."

  for (const l of lines) {
    const t = thaiJoin(l.text);
    // ป้ายขนาด
    if (/ขนาดตัวเครื่องภายในอาคาร/.test(t)) label = 'indoor';
    else if (/ขนาดตัวเครื่องภายนอกอาคาร/.test(t)) label = 'outdoor';
    else if (/ขนาดผลิตภัณฑ์/.test(t)) label = 'product';
    // ค่าขนาด (WxHxD)
    const dim = t.match(/(\d+)\s*x\s*\d+\s*x\s*\d+/);
    if (dim && label) {
      const labelName = label === 'indoor'
        ? 'ขนาดตัวเครื่องภายในอาคาร (กว้างxสูงxลึก มม.)'
        : label === 'outdoor'
          ? 'ขนาดตัวเครื่องภายนอกอาคาร (กว้างxสูงxลึก มม.)'
          : 'ขนาดผลิตภัณฑ์ (กว้างxสูงxลึก มม.)';
      push(labelName, dim[0].replace(/\s+/g, ''));
      label = null;
    }
    // BTU
    const btu = t.match(/([\d.,]+)\s*Btu/i);
    if (btu) push('ความเย็น (Btu)', btu[1]);
    // ประเภทเครื่อง
    if (/แอร์แบบ 4 ทิศทาง/.test(t)) push('ประเภทเครื่อง', 'แอร์แบบ 4 ทิศทาง (คาสเซ็ท)');
    if (/แอร์แบบติดผนัง/.test(t)) push('ประเภทเครื่อง', 'แอร์แบบติดผนัง');
    // ความจุซัก/อบ
    const wd = t.match(/ซัก\s*[:：]?\s*(\d+)\s*กก\.?\s*(?:\/|อบ)\s*(\d+)\s*กก\.?/i);
    if (wd) push('ความจุ (ซัก/อบ)', `${wd[1]} / ${wd[2]} กก.`);
    // การรับประกัน (อาจแยก 2 บรรทัด: "รับประกันมอเตอร์ และคอมเพรสเซอร์" + "10 ปี")
    if (/รับประกันมอเตอร์/.test(t)) warrantyLine = l.y;
    if (/10\s*ปี/.test(t) && warrantyLine != null && l.y >= warrantyLine - 25) {
      const who = /คอมเพรสเซอร์/.test(t) || /คอมเพรสเซอร์/.test(lines.find((x) => x.y === warrantyLine)?.text || '')
        ? 'มอเตอร์และคอมเพรสเซอร์' : 'มอเตอร์';
      push('การรับประกัน', `${who} 10 ปี`);
      warrantyLine = null;
    }
    // มาตรฐาน / คอมเพรสเซอร์ / สี
    if (/ประหยัดไฟเบอร์\s*5/.test(t)) push('มาตรฐานประหยัดไฟ', 'เบอร์ 5');
    if (/LG DUAL INVERTER/.test(t)) push('คอมเพรสเซอร์', 'Dual Inverter');
    const color = t.match(/สี\s*[:：]\s*([^•]+)/);
    if (color) push('สี', color[1].trim());
  }
  return specs;
}

// ── 1) โหลดสินค้า 7 ตัวที่ยังไม่มีสเปค ──
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/products.json'), 'utf8'));
const lgSpecs = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/lg-specs.json'), 'utf8'));
const haveLg = new Set(lgSpecs.products.map((p) => p.code));

// สินค้าที่ต้องการ: ยังไม่มีสเปคจากเว็บ LG
const targets = data.products.filter((p) => !haveLg.has(p.code));
console.log('สินค้าที่ยังไม่มีสเปค:', targets.length, 'ตัว');
targets.forEach((p) => console.log('  -', p.code, `(หน้า ${p.srcPage}, ${p.source})`));

// ── 2) อ่าน PDF ตามไฟล์ ──
const byFile = new Map();
for (const p of targets) {
  if (!byFile.has(p.source)) byFile.set(p.source, []);
  byFile.get(p.source).push(p);
}

const results = [];
for (const [file, prods] of byFile) {
  const pages = await extractLines(path.join(ROOT, 'pdfs', file));
  const pageMap = new Map(pages.map((pg) => [pg.page, pg.lines]));
  // anchor: บรรทัดรหัสสินค้า หรือบรรทัด BTU (ใช้ y ของ anchor เป็นจุดเริ่ม)
  for (const p of prods) {
    const lines = pageMap.get(p.srcPage) || [];
    const codeText = p.code.split('.')[0].replace(/\s/g, '');
    const inBand = (y) => y <= p.y + 2 && y >= p.y2 - 2;
    const codeLines = lines.filter((l) => inBand(l.y) && l.text.replace(/\s/g, '').includes(codeText));
    const btuLines = lines.filter((l) => inBand(l.y) && /[\d.,]+\s*Btu/i.test(l.text));
    // anchor: บรรทัด BTU ที่ใกล้บรรทัดรหัสสินค้ามากที่สุด (BTU มักอยู่เหนือรหัส)
    let anchor;
    if (codeLines.length && btuLines.length) {
      const cy = codeLines[0].y;
      anchor = [...btuLines].sort((a, b) => Math.abs(a.y - cy) - Math.abs(b.y - cy))[0];
    } else if (codeLines.length) anchor = codeLines[0];
    else if (btuLines.length) anchor = btuLines[0];
    if (!anchor) {
      console.log(`❌ ${p.code}: ไม่พบ anchor`);
      continue;
    }
    // block = รอบ anchor แต่ตัดที่ BTU ถัดไป (สินค้าตัวถัดไป) เพื่อไม่เก็บข้ามรุ่น
    const anchorBtu = (anchor.text.match(/[\d.,]+\s*Btu/i) || [])[0];
    let cutY = anchor.y - BLOCK_BELOW;
    if (anchorBtu) {
      // แอร์: ตัดที่ BTU ของสินค้าถัดไป (ไม่เก็บข้ามรุ่น)
      const next = btuLines
        .filter((l) => l.y < anchor.y && !l.text.includes(anchorBtu))
        .sort((a, b) => b.y - a.y)[0];
      if (next) cutY = Math.max(cutY, next.y);
    }
    // แอร์: เริ่มจากบรรทัด BTU ลงมา (ข้อมูลสินค้าด้านบนอาจเป็นของตัวก่อนหน้า)
    // เครื่องซัก/อื่นๆ: ครอบรอบบรรทัดรหัส (สเปคอาจอยู่เหนือ/ใต้)
    const block = anchorBtu
      ? lines.filter((l) => l.y <= anchor.y && l.y >= cutY)
      : lines.filter((l) => l.y <= anchor.y + BLOCK_ABOVE && l.y >= cutY);
    const specs = parseBlock(block);
    if (!specs.length) {
      console.log(`⚠️ ${p.code}: ไม่พบสเปคในแถบ`);
      continue;
    }
    results.push({ code: p.code, slug: p.slug, source: file, page: p.srcPage, specs });
    console.log(`✅ ${p.code}: ${specs.map((s) => `${s.name}=${s.value}`).join(' | ')}`);
  }
}

fs.writeFileSync(OUT, JSON.stringify({ source: 'PDF ราคา (คอลัมน์รายการสินค้า)', products: results }, null, 2));
console.log(`\nบันทึก: ${path.relative(ROOT, OUT)} (${results.length} สินค้า)`);
