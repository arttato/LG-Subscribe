// ตรวจชื่อ (lgName) ทั้ง 91 รุ่นที่ดึงจากเว็บ LG:
// 1) ชื่อที่มีรหัสของรุ่นอื่นปนมา (เช่น ได้ชื่อรุ่นพี่/รุ่นข้างเคียง)
// 2) ชื่อที่ไม่มีรหัสของตัวเองเลย (อาจผิดหน้า/เป็นชื่อรวม)
// 3) ชื่อที่สั้นเกินไป (อาจเป็นชื่อหัวข้อ ไม่ใช่ชื่อสินค้า)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const specs = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/lg-specs.json'), 'utf8')).products;
const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/products.json'), 'utf8')).products;

// รหัสหลัก (ตัด suffix หลังจุด/ขีด) ของทุกรุ่นในแคตตาล็อก
const allCodes = products.map((p) => p.code.split('.')[0].toUpperCase().replace(/[^A-Z0-9]/g, ''));
const byCode = new Map(products.map((p) => [p.code, p]));

// ฟังก์ชัน extract "รหัส" หลักจาก code จริง เช่น WD110MN.ABGPLMT → WD110MN, F2520RNTB.AEBPETH → F2520RNTB
// ตัด suffix สี/ตลาดท้ายรหัส (เช่น 27GX704A-B → 27GX704A, 40U990A-W → 40U990A, 52G930B-B → 52G930B)
function mainCode(code) {
  let c = code.split('.')[0].toUpperCase();
  c = c.replace(/-(?:B|W|S|N|G|T|M)$/, ''); // suffix สี/ตลาด (27GX704A-B → 27GX704A)
  return c.replace(/[^A-Z0-9]/g, '');
}

let suspicious = 0;
for (const s of specs) {
  if (!s.lgName) { console.log(`⏭️  ${s.code} — ไม่มี lgName`); continue; }
  const name = s.lgName;
  const myMain = mainCode(s.code);
  const nameCompact = name.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // หารหัสอื่นในแคตตาล็อกที่ไปโผล่ในชื่อ
  const othersInName = [...new Set(allCodes.filter((c) => c !== myMain && c.length >= 6 && nameCompact.includes(c)))];
  // ตรวจรหัสตัวเอง: ตรงเต็ม หรือเป็น prefix ของรหัสจริง (WD516 → WD516AN.ACNPLMT)
  const selfMatch = nameCompact.includes(myMain) || (myMain.length >= 4 && nameCompact.startsWith(myMain));
  const tooShort = name.length < 15;

  const flags = [];
  if (!selfMatch) flags.push('ไม่มีรหัสตัวเอง');
  if (othersInName.length) flags.push('มีรหัสอื่น: ' + othersInName.join(','));
  if (tooShort) flags.push('สั้นเกินไป (' + name.length + ' ตัว)');

  if (flags.length) {
    suspicious++;
    console.log(`❌ ${s.code} (หลัก=${myMain})`);
    console.log(`    ชื่อ: ${name}`);
    console.log(`    ${flags.join(' | ')}`);
  }
}
console.log(`\nสรุป: ตรวจ ${specs.filter((s) => s.lgName).length} / สงสัย ${suspicious}`);
