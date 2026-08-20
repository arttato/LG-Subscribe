// สคริปต์ดึงข้อมูลสินค้าจากไฟล์ PDF ใบราคา → src/data/products.json + scripts/report.txt
//
// วิธีใช้:  วาง PDF ใหม่ลงในโฟลเดอร์ pdfs/ แล้วรัน  npm run extract
//
// หลักการอ่านตาราง: แต่ละรุ่นสินค้าอยู่ใน "แถบ" แถวหนึ่งของตาราง (บรรทัดที่ y ใกล้กัน)
// รหัสสินค้า / แถว policy / ขนาด อาจสลับตำแหน่งกันภายในแถบได้ (หลายคอลัมน์)
// จึงจัดกลุ่มบรรทัดด้วยระยะห่าง y แล้วค่อยหาความหมายในแต่ละกลุ่ม
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { extractLines } from './lib/pdf-layout.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF_DIR = path.join(ROOT, 'pdfs');
const PUBLIC_PDF_DIR = path.join(ROOT, 'public', 'pdfs');
const OUT_JSON = path.join(ROOT, 'src', 'data', 'products.json');
const META_JSON = path.join(ROOT, 'src', 'data', 'meta.json');
const REPORT = path.join(ROOT, 'scripts', 'report.txt');
const SNAPSHOT = path.join(ROOT, 'scripts', '.last-products.json');
const DEBUG = process.argv.includes('--debug');

const CLUSTER_GAP = 21; // pt — บรรทัดที่ห่างกันเกินนี้ถือว่าคนละรุ่น

// ---------- ตัวช่วยภาษาไทย ----------
// ภาษาไทยใน PDF ถูกตัดเป็นชิ้น (เช่น "น ้า", "รายกา ระยะเวลา") → รวมชิ้นที่อยู่ติดกันเข้าด้วยกัน
const thaiJoin = (s) =>
  s
    .replace(/([\u0E00-\u0E7F])\s+(?=[\u0E00-\u0E7F])/g, '$1') // "น ้า" → "น้ำ"
    // pdf.js สลับ ำ→า บางครั้ง ("เครื่องกรองน้า" → "เครื่องกรองน้ำ")
    // แต่ "หน้า" ก็มี "น้า" ติดกัน (วรรณยุกต์ไปอยู่ผิดตัว) — ต้องไม่แตะตัวที่ตามหลัง ห
    .replace(/(?<!ห)น้า/g, 'น้ำ');

// ---------- regex ----------
const DOT_CODE_RE = /[A-Z0-9]{1,12}(?:-[A-Z0-9]{1,8})?\.[A-Z0-9]{2,12}/;
const PLAIN_CODE_RE = /(?<![A-Z0-9_])[A-Z]{2,4}\d{2,4}[A-Z]?\d*(?![A-Z0-9_])/; // เช่น WD516, SAQ11A (ไม่ใช่ "H13" เกรดฟิลเตอร์)
const NUM_RE = /^[\d,]+(?:\.\d+)?$/;
const POLICY_RE = /([2567])Y[\s_](Visit|Self)\b/g; // รองรับทั้ง "5Y_Visit" และ "5Y Visit"
const POLICY_CODE_RE = /\b(?:VISIT|SELF|NOSERVICE|OUT)_[A-Z0-9_%().\-]{4,}\b/;
const SCHEDULE_RE = /(\d+)\s*-\s*(\d+)\s*\(\s*([\d,]+(?:\.\d+)?)/;
const RANGE_RE = /รอบบิลที่\s*(\d+)\s*(?:ถึง|-)\s*(\d+)\s*\(\s*([\d,]+(?:\.\d+)?)/g;
const CAPACITY_RE = /^\d[\d.,]*\s*Btu\b/;
// สินค้าที่ไม่มีรหัสใน PDF (หน้า Sound bar แบบ Advance payment เช่น "LG xboom Grab")
// → จับคู่ด้วยชื่อที่ปรากฏ สร้างรหัสสังเคราะห์ XBOOM-xxx ใช้ติดตาม diff ข้ามเดือน
// (ถ้า LG เปลี่ยนชื่อเดือนหน้า รหัสใหม่จะโผล่ใน report เป็นสินค้าใหม่)
const NAMED_ANCHOR_RE = /^LG\s+xboom\s+([A-Za-z0-9]+)/i;

// รหัสสินค้าที่ PDF วางผิดหมวด (จอมอนิเตอร์ UltraGear ขึ้นต้น U/GX ไปอยู่ในหน้าหมวดโทรทัศน์)
// → บังคับหมวดหมู่ตามรหัส (prefix ก่อนจุด) ทุกครั้งที่รัน extract — เดือนหน้า PDF ใหม่ก็ยังแยกถูก
const CATEGORY_OVERRIDES = {
  '27GX704A': 'มอนิเตอร์',
  '32U889': 'มอนิเตอร์',
  '34U650A': 'มอนิเตอร์',
  '40U990A': 'มอนิเตอร์',
  '45GX950A': 'มอนิเตอร์',
  '52G930B': 'มอนิเตอร์',
  // ตู้เย็นจาก Sale PDF (หัวข้อหน้าคือ "ตู้เย็น" ไม่มีหมวดย่อย แต่แถวมีป้ายในวงเล็บ เช่น "(Side by Side)")
  'GC-B257SQYL': 'ตู้เย็น Side by Side',
  'GC-L257KQKW': 'ตู้เย็น Side by Side',
  'GN-F392PQAK': 'ตู้เย็น 2 ประตู',
  'GV-B25FFGDB': 'ตู้เย็น Multi-Door',
  'GC-L24FFCBB': 'ตู้เย็น Multi-Door', // PDF: "(Multi Door)/ Plumbing"
};

// หมวดย่อยตู้เย็นใน Price list PDF → ชื่อหมวดบนเว็บ (แยกการ์ดตามหัวข้อย่อยของ PDF: Plumbing, Side-by-Side, Multi-Door, 2 ประตู)
const FRIDGE_SUB = {
  'ตู้เย็น / Side-by-Side': 'ตู้เย็น Side by Side',
  'ตู้เย็น / Multi-Door': 'ตู้เย็น Multi-Door',
  'ตู้เย็น / 2 ประตู': 'ตู้เย็น 2 ประตู',
  'ตู้เย็น / Plumbing': 'ตู้เย็น Multi-Door',
};

// หน้าแบบตารางหลายคอลัมน์: รหัสสี (ทุกสี) อยู่คอลัมน์ซ้าย แต่แถวราคาอยู่คอลัมน์กลาง
// → y ของรหัสกับแถวราคาสลับกัน ระยะ "ใกล้ที่สุด" จึงจับคู่ผิด (เช่น รหัส WD518AN อยู่ระหว่างแถวราคาของ WD516AN)
// กำหนดบล็อกช่วง y ของแถวราคาแต่ละรุ่น (ค่า y จาก PDF ต้นฉบับ — ถ้า LG เปลี่ยนโครงสร้างหน้าต้องอัปเดต)
// ไฟล์ → หน้า → [ { yMin, yMax, family } ]
const POLICY_BLOCK_OVERRIDES = {
  'Price list_Aug_V3.pdf': {
    4: [
      { yMin: 235, yMax: 390, family: 'WD516AN' }, // 5Y_Visit 799 / 5Y_Self 699 / 7Y_Visit 599 / 7Y_Self 499
      { yMin: 140, yMax: 200, family: 'WD518AN' }, // 5Y_Visit 549 / 5Y_Self 499
      { yMin: 45, yMax: 135, family: 'WD110MN' }, // 7Y_Visit 449 / 7Y_Self 399
    ],
  },
  // ตาราง OBS แอร์ IXY (Sale PDF): รหัสกับแถวราคาอยู่คนละคอลัมน์ แถว 12M ใกล้รุ่นถัดไป
  // (ค่า y จาก PDF ต้นฉบับ — ถ้า LG เปลี่ยนโครงสร้างหน้าต้องอัปเดต)
  'Sale Price8 - Subscription_V3.pdf': {
    7: [
      { yMin: 320, yMax: 395, family: 'IXY11A' }, // 5Y_Visit 6M 499 / 12M 399
      { yMin: 215, yMax: 280, family: 'IXY13A' }, // 5Y_Visit 6M 549 / 12M 449
      { yMin: 115, yMax: 180, family: 'IXY18A' }, // 5Y_Visit 6M 699 / 12M 599
      { yMin: 10, yMax: 85, family: 'IXY24A' }, // 5Y_Visit 6M 849 / 12M 749
    ],
  },
};

// แผนราคาแบบกำหนดเอง (ตรวจค่ากับ PDF ต้นฉบับแล้ว) — ใช้เมื่อตารางมีโครงสร้างที่ parser อ่านผิด
// ตาราง OBS แอร์ IXY (Sale PDF หน้า 7): ราคาในแถวเป็น "ราคาโปร" และบรรทัดงวดของแถวถัดไป
// หลุดเข้ามาใน window → parser ได้ราคา/เทอมสลับกัน (เริ่มต้น 18A=300, 24A=600 ผิดจาก PDF)
// (ค่า y ของแถว override ใช้ของแถวเดิมที่จับคู่ได้ เพื่อกัน crop รูปเพี้ยน)
const PRICE_OVERRIDES = {
  'Sale Price8 - Subscription_V3.pdf': {
    7: {
      'IXY11A': [
        { policy: '5Y_Visit', term: 6, price: 499, promoCode: 'VISIT_5Y_6M00' },
        { policy: '5Y_Visit', term: 12, price: 399, promoCode: 'VISIT_5Y_12M' },
      ],
      'IXY13A': [
        { policy: '5Y_Visit', term: 6, price: 549, promoCode: 'VISIT_5Y_6M' },
        { policy: '5Y_Visit', term: 12, price: 449, promoCode: 'VISIT_5Y_12M' },
      ],
      'IXY18A': [
        { policy: '5Y_Visit', term: 6, price: 699, promoCode: 'VISIT_5Y_6M' },
        { policy: '5Y_Visit', term: 12, price: 599, promoCode: 'VISIT_5Y_12M' },
      ],
      'IXY24A': [
        { policy: '5Y_Visit', term: 6, price: 849, promoCode: 'VISIT_5Y_6M' },
        { policy: '5Y_Visit', term: 12, price: 749, promoCode: 'VISIT_5Y_12M' },
      ],
    },
  },
};

// ตระกูลของรหัส (ก่อนจุด) เช่น "WD516AN.ACNPLMT" → "WD516AN"
const familyOf = (c) => (c || '').split('.')[0];

// ---------- บรรทัดที่ไม่ใช่ข้อมูลสินค้า ----------
function isNoise(line) {
  if (!line) return true;
  if (/^\[?\d{1,3}\]?$/.test(line)) return true; // เลขหน้าล้วน
  if (/^Advance\s*Payment|^Policy\b|Policy\s*name/i.test(line)) return true;
  if (/^Subscription\b/.test(line)) return true;
  if (/^New\s*Model\b|^Control\s*Stock\b/.test(line)) return true;
  if (/พื้นที่ติดตั้งเฉพำะ/.test(line)) return true;
  if (/Free Premium Gift/i.test(line)) return true;
  if (/^\*{2}/.test(line)) return true;
  if (/2569/.test(line)) return true; // วันที่โปรโมชัน
  const c = thaiJoin(line);
  return (
    /^ช[ำา]?ระล่วงหน้า/.test(c) || // ชำระล่วงหน้า / ชาระล่วงหน้า (อักษร ำ/า มักสลับกัน)
    /^ราคาปกติ/.test(c) ||
    /^ส[่]?วนลด/.test(c) || // ส่วนลด (บางครั้งวรรณยุกต์หลุด)
    /^รายการ/.test(c) ||
    /^แบบการขาย/.test(c) ||
    /^สัญญา/.test(c) ||
    /^รอบบริการ/.test(c) ||
    /^ราคาต่อเดือน/.test(c) ||
    /^ราคาโปร/.test(c) ||
    /^โปรโมชัน/.test(c) ||
    /^เงื่อนไข/.test(c) ||
    /^รุ่น\b/.test(c) ||
    /^หมายเหตุ/.test(c)
  );
}

// บรรทัดที่เป็นหัวหมวดหมู่ (ต้องเป็นบรรทัดแรกๆ ของหน้า)
function isCategory(line) {
  if (isNoise(line)) return false;
  if (line.length < 2 || line.length > 60) return false;
  if (/^\d/.test(line)) return false;
  if (/^SAC\b/i.test(line)) return true; // SAC(4Way Cassette Type)...
  if (/^OBS\b/i.test(line)) return true;
  if (/\d/.test(line)) return false; // หัวหมวดหมู่ปกติไม่มีตัวเลข
  if (/[\u0E00-\u0E7F]/.test(line)) return true;
  return /^(Wash\s*Tower|Sound\s*bar|Life\s*Style\s*TV|COMBO)/i.test(line);
}

function cleanCategory(line) {
  return thaiJoin(line)
    .replace(/\s*New\s*Model\)?/gi, '')
    .replace(/เครื่องอบผ้าเครื่องซักผ้า/g, 'เครื่องอบผ้า/เครื่องซักผ้า')
    .replace(/\s+-\s+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^([\u0E00-\u0E7F]{2,20})\1$/, '$1') // "เครื่องซักผ้าเครื่องซักผ้า" → "เครื่องซักผ้า"
    .replace(/MULTI-DOOR/g, 'Multi-Door')
    .replace(/SIDE-BY-SIDE/g, 'Side-by-Side')
    .replace(/^SOUND\s*BAR$/i, 'Sound bar')
    .replace(/[()]$/, '')
    .trim();
}

// รหัสสินค้าที่เป็น "หัวบล็อก" (ขึ้นต้นบรรทัด) เช่น "GC-X257CMHW.AEEPLMT", "WD516 หรือ WD518"
function leadingCode(line) {
  const codes = findEligibleCodes(line);
  return codes.length > 0 && line.startsWith(codes[0]) ? codes[0] : null;
}

// หารหัสสินค้าในบรรทัด — ตัวที่ "มีสิทธิ์" เป็นรหัสหลัก
function findEligibleCodes(line) {
  const codes = [];
  const dotMatches = [...line.matchAll(new RegExp(DOT_CODE_RE.source, 'g'))];
  const plainMatches = [...line.matchAll(new RegExp(PLAIN_CODE_RE.source, 'g'))];
  const plainOnly = plainMatches.filter((m) => !dotMatches.some((d) => d.index === m.index));
  for (const m of [...dotMatches, ...plainOnly].sort((a, b) => a.index - b.index)) {
    const code = m[0];
    const before = line[m.index - 1] || '';
    const after = line[m.index + code.length] || '';
    if (before === '+' || before === '(' || before === '!') continue; // สมาชิกชุดโปรโมชัน/ของแถม
    if (after === ':') continue; // เช่น "WD516 : น้ำเงิน"
    if (after === '%' || after === '(') continue; // เช่น "DC50%(8M)" ไม่ใช่รุ่น
    if (/^PTO/.test(code)) continue; // รหัสชุด/แพ็กเกจ (PTODFC..., PTOL24...)
    if (/^\d+\.[\d]{2,4}$/.test(code)) continue; // "11.942" = ความจุ Btu ไม่ใช่รุ่น
    codes.push(code);
  }
  return codes;
}

// ราคา "1,249" → 1249, "1.149" → 1149
function toNumber(s) {
  if (!s) return null;
  let t = s.replace(/,/g, '');
  if (/^\d{1,3}\.\d{3}$/.test(t)) t = t.replace('.', '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// หาตำแหน่ง policy ใน tokens (รองรับทั้ง "5Y_Visit" และ "5Y Visit" ที่แยกเป็น 2 คำ)
function findPolicyIndex(tokens, policyToken) {
  const parts = policyToken.split(/\s+/);
  for (let i = 0; i <= tokens.length - parts.length; i++) {
    if (tokens.slice(i, i + parts.length).join(' ') === parts.join(' ')) return i;
  }
  return -1;
}

// แยกแถว policy ออกจากทั้งหน้า (คืนค่าแถวพร้อมตำแหน่ง y เพื่อจับคู่กับรหัสสินค้า)
function parsePolicies(items) {
  const lines = items.map((i) => i.text);
  const out = [];
  const clusterText = lines.join(' ');

  for (let li = 0; li < lines.length; li++) {
    for (const m of lines[li].matchAll(POLICY_RE)) {
      const row = parsePolicyRow(lines, li, m[0], false);
      if (row && row.price != null) out.push({ ...row, y: items[li].y });
    }
  }
  // รูปแบบ No Service: "5Y No Service", "5Y No", หรือ "5Y" ลอยเดี่ยว (หน้า TV/ซาวด์บาร์)
  for (let li = 0; li < lines.length; li++) {
    for (const m of lines[li].matchAll(/([2567])Y\s+No\s+Service\b/g)) {
      const row = parsePolicyRow(lines, li, m[0], true, clusterText);
      if (row && row.price != null) out.push({ ...row, y: items[li].y });
    }
    for (const m of lines[li].matchAll(/([2567])Y\s+No\b/g)) {
      const row = parsePolicyRow(lines, li, m[0], true, clusterText);
      if (row && row.price != null) out.push({ ...row, y: items[li].y });
    }
  }
  // "5Y" / "6Y" ลอยเดี่ยว + มี Advance payment ในหน้า → นโยบาย No Service
  // (ไม่ตัดแถวที่ policy ซ้ำกัน — แต่ละรุ่นมี "5Y" ของตัวเอง)
  if (/Advance\s+payment/i.test(clusterText)) {
    for (let li = 0; li < lines.length; li++) {
      for (const m of lines[li].matchAll(/\b([2567])Y\b(?!\s*(?:Visit|Self)|\s+No|_)/g)) {
        const row = parsePolicyRow(lines, li, m[0], true, clusterText);
        if (row && row.price != null) out.push({ ...row, y: items[li].y });
      }
    }
  }
  // dedupe แถวซ้ำในหน้า (เช่น รุ่นเดียวกันถูกกล่าวถึงหลายที่)
  const seen = new Set();
  return out.filter((r) => {
    const k = `${r.policy}|${r.price}|${Math.round(r.y / 5)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ตัวเลขที่ "พอเป็นราคา" (ข้ามเลขตารางงวดที่เล็กๆ เช่น 1, 2, 8, 60)
const PRICE_MIN = 100; // ราคาต่ำสุดในเอกสาร ≈ 89 (ไมโครเวฟ) — เลขงวด/จำนวนเดือนจะต่ำกว่านี้มาก

function priceNumbers(tokens, from) {
  const nums = [];
  for (let j = from; j < tokens.length && nums.length < 4; j++) {
    if (NUM_RE.test(tokens[j])) {
      const n = toNumber(tokens[j]);
      if (n != null && n >= PRICE_MIN) nums.push(n);
    }
  }
  return nums;
}

function parsePolicyRow(lines, lineIndex, policyToken, noService, clusterText) {
  const sameLine = lines[lineIndex];
  const tokens = sameLine.split(/\s+/);
  const i = findPolicyIndex(tokens, policyToken);
  if (i === -1) return null;

  let term = null;
  let price = null;

  if (noService) {
    // ราคาต่อเดือน = เงินงวดแรกในตาราง × 2 (จ่ายล่วงหน้า 50% 12 งวด)
    // ค้นในบรรทัดใกล้เคียง (ไม่ใช่ทั้งหน้า เพราะแต่ละรุ่นมีตารางงวดของตัวเอง)
    const local = lines.slice(lineIndex, lineIndex + 6).join(' ');
    const m = local.match(SCHEDULE_RE);
    if (m) {
      const first = toNumber(m[3]);
      if (first != null) price = Math.round(first * 2);
    }
    if (price == null) {
      // ไม่มีตารางงวด → ตัวเลขแรกที่ตามหลัง policy (เช่น "6Y No Service 89")
      const nums = tokens.slice(i + 1).map(toNumber).filter((n) => n != null);
      if (nums.length >= 1) price = nums[0];
    }
  } else {
    let j = i + 1;
    while (j < tokens.length && !NUM_RE.test(tokens[j])) j++;
    if (j < tokens.length) term = toNumber(tokens[j]);
    const same = priceNumbers(tokens, j + 1);
    if (/^2Y/.test(policyToken)) {
      // ซื้อขาด: ใช้ราคาเต็ม (เช่น 37,900 — ไม่เอาเลขส่วนลด 3,790)
      if (same.length >= 1) price = same[0];
    } else {
      const cands = [...same];
      // ราคาต่อเดือนจริงบางทีอยู่บรรทัดถัดไป (หรือเป็นค่าที่น้อยกว่าในบรรทัดเดียวกัน)
      // มองหาตัวเลข ≥ 3 หลักตัวแรกของบรรทัดถัดไป โดยข้ามเลขที่อยู่ในวงเล็บ (ตารางงวด)
      // และข้ามบรรทัดมิติตัวเครื่อง (เช่น "840x204x840", "1,180x132x450") — ตัวเลขในนั้นไม่ใช่ราคา
      // (เคยเป็นบั๊ก: เอา 840/450 จากมิติไปทำ Math.min กับราคาจริง 1,899 → ราคาผิด)
      const nextLine = lines[lineIndex + 1] || '';
      const m = !/[\d,]+x[\d,]+/.test(nextLine)
        ? nextLine.match(/(?<![(\d])[\d,]{3,}(?:\.\d+)?\b/)
        : null;
      if (m) cands.push(toNumber(m[0]));
      const valid = cands.filter((n) => n != null && n >= PRICE_MIN);
      if (valid.length >= 1) price = Math.min(...valid);
    }
    if (price != null && price >= PRICE_MIN) {
      // ใช้ราคาจากตารางงวด ("รอบบิลที่ X-Y (ราคา)") แทน เพราะเป็นราคาต่อเดือนจริงเสมอ
      // (ราคาโปรรวม/ราคาโปรโมชันในคอลัมน์ข้างๆ อาจน้อยหรือมากกว่าราคาจริงก็ได้)
      // จำกัด window เฉพาะบรรทัดต่อเนื่องของแถวเดียวกัน (หยุดเมื่อเจอแถว policy ถัดไป)
      // — เดิมใช้ 8 บรรทัดตายตัว ทำราคาจากแถวถัดไปหลุดเข้ามา (เช่น 5Y_Self 699 → 599)
      const windowLines = [lines[lineIndex]];
      for (let k = lineIndex + 1; k < lines.length && windowLines.length < 8; k++) {
        if (/[2567]Y[\s_](Visit|Self)/.test(lines[k])) break; // เจอแถว policy ถัดไป → หยุด
        windowLines.push(lines[k]);
      }
      const ranges = [...windowLines.join(' ').matchAll(RANGE_RE)];
      if (ranges.length > 0) {
        // ราคาต่อเดือนจริง = งวดที่สิ้นสุดไกลสุด (9-60/13-72) และจำนวนมากที่สุด
        const best = ranges.reduce((a, b) =>
          +b[2] > +a[2] || (+b[2] === +a[2] && toNumber(b[3]) > toNumber(a[3])) ? b : a
        );
        price = toNumber(best[3]);
      }
    }
  }

  const codeM = sameLine.match(POLICY_CODE_RE);
  return {
    policy: policyToken,
    term,
    price,
    promoCode: codeM ? codeM[0] : null,
  };
}

// ---------- แยกหน้าเป็นสินค้า ----------
// หลักการ: ดึง "รหัสสินค้า" และ "แถวราคา" ออกจากกันทั้งหน้า แล้วจับคู่กันด้วยระยะ y ที่ใกล้ที่สุด
// เพราะตารางใน PDF มีหลายคอลัมน์ รหัสกับราคาอาจอยู่คนละตำแหน่ง/คนละบรรทัด
function parsePage(pageNo, rawLines, inheritedCategory, pdfFile) {
  const items = [];
  for (const { y, text } of rawLines) {
    const line = text.trim();
    if (!line) continue;
    if (isNoise(line)) continue;
    items.push({ y, text: line });
  }
  if (items.length === 0) return { category: null, products: [] };

  // หาหมวดหมู่: ไล่จากบนลงล่าง หยุดเมื่อเจอเนื้อหาสินค้า
  let category = inheritedCategory || null;
  for (const { text: line } of items) {
    const contentStart =
      /[2567]Y[\s_](Visit|Self)|[2567]Y\s+No/.test(line) ||
      leadingCode(line) ||
      /^รอบบิลที่|^•/.test(line);
    if (contentStart) break;
    const merged = line.match(/^(.+?)\s*ช[ำา]?ระล่วงหน้า|^(.+?)\s*(?:Advance\s*Payment)/i);
    if (merged) {
      const cat = (merged[1] || merged[2] || '').trim();
      if (cat) {
        category = cleanCategory(cat);
        break;
      }
    }
    if (isCategory(line)) {
      category = cleanCategory(line);
      break;
    }
  }

  // 1) รหัสสินค้าที่ "มีสิทธิ์" เป็นสินค้าจริง: ขึ้นต้นบรรทัด หรือ อยู่หลังความจุ ("9,200 Btu SAQ11A")
  //    บรรทัด "WD516 หรือ WD518" = 2 รุ่นที่ใช้ราคาชุดเดียวกัน
  const anchors = [];
  const seen = new Set();
  const advancePage = /Advance\s+payment/i.test(items.map((i) => i.text).join(' '));
  for (const { y, text: line } of items) {
    // บรรทัดต่อของชื่อชุด (เช่น "(DFC533FV.APYPETH+" / "MS2032GAS.BBKPETH)") — ไม่ใช่รุ่นจริง
    if (/^\(/.test(line)) continue;
    const lc = leadingCode(line);
    if (lc && line.slice(lc.length).trim() === ')') continue;
    let codes;
    if (CAPACITY_RE.test(line)) {
      // "9,200 Btu SAQ11A 5Y_Visit ..." — รหัสอยู่หลังความจุ ตัดส่วน Btu ออกก่อนหา
      codes = findEligibleCodes(line.replace(/^\d[\d.,]*\s*Btu\b/, ''));
    } else if (/หรือ/.test(line)) {
      codes = findEligibleCodes(line); // "WD516 หรือ WD518" = หลายรุ่นในบรรทัดเดียว
    } else if (leadingCode(line)) {
      codes = [leadingCode(line)];
    } else {
      codes = [];
    }
    // ไม่มีรหัสจริงในบรรทัด → ลองจับคู่ชื่อสินค้าไร้รหัส (เฉพาะหน้าแบบ Advance payment = Sound bar)
    let named = null;
    if (codes.length === 0 && advancePage) {
      const nm = line.match(NAMED_ANCHOR_RE);
      if (nm) {
        codes = ['XBOOM-' + nm[1].toUpperCase()];
        named = nm[0]; // ชื่อสะอาด (ไม่รวมเศษตารางงวดที่ติดท้ายบรรทัด)
      }
    }
    for (const code of codes) {
      if (seen.has(code)) continue;
      seen.add(code);
      anchors.push({ code, y, line, named });
    }
  }

  // 2) แถวราคาทั้งหน้า (พร้อมตำแหน่ง y)
  const rows = parsePolicies(items);

  // 3) จับคู่แถวราคากับรหัสที่อยู่ใกล้ที่สุด (ภายใน 200pt)
  //    หน้าแบบตารางหลายคอลัมน์ (รหัสสี "ทุกสี") → บังคับตามบล็อกช่วง y ของแต่ละรุ่น (POLICY_BLOCK_OVERRIDES)
  const blocks = (POLICY_BLOCK_OVERRIDES[pdfFile] || {})[pageNo] || [];
  const byCode = new Map();
  for (const r of rows) {
    let best = null;
    let bestD = 201;
    const block = blocks.find((b) => r.y >= b.yMin && r.y <= b.yMax);
    for (const a of anchors) {
      if (block && familyOf(a.code) !== block.family) continue; // จำกัดเฉพาะรุ่นในบล็อก
      const d = Math.abs(r.y - a.y);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    if (best) {
      if (!byCode.has(best.code)) byCode.set(best.code, []);
      byCode.get(best.code).push(r);
    }
  }

  // 3.5) แผนราคาแบบกำหนดเอง (PRICE_OVERRIDES) — กันบั๊กตารางที่ parser อ่านผิด (เช่น OBS แอร์ IXY)
  const priceOv = (PRICE_OVERRIDES[pdfFile] || {})[pageNo] || {};
  for (const [code, plans] of Object.entries(priceOv)) {
    const oldRows = byCode.get(code) || [];
    byCode.set(
      code,
      plans.map((pl, i) => ({ ...pl, y: oldRows[i] ? oldRows[i].y : anchors.find((a) => a.code === code)?.y ?? 0 }))
    );
  }

  // 4) รุ่น "X หรือ Y" ใช้ราคาร่วมกัน → แชร์แถวราคาให้ครบทุกตัว
  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      if (anchors[i].y === anchors[j].y && /หรือ/.test(anchors[i].line)) {
        const merged = [...(byCode.get(anchors[i].code) || []), ...(byCode.get(anchors[j].code) || [])];
        byCode.set(anchors[i].code, merged);
        byCode.set(anchors[j].code, merged);
      }
    }
  }

  // 5) กลุ่มบรรทัดรอบรหัส ใช้หาชื่อ/คำอธิบาย
  //    (บรรทัดเรียงจากบนลงล่าง — y ลดลงเรื่อยๆ จึงใช้ระยะห่างสัมบูรณ์ตัด cluster)
  const clusters = [];
  let current = null;
  for (const { y, text: line } of items) {
    if (!current || Math.abs(y - current.yLast) > CLUSTER_GAP) {
      if (current) clusters.push(current);
      current = { yFirst: y, yLast: y, lines: [line] };
    } else {
      current.yLast = y;
      current.lines.push(line);
    }
  }
  if (current) clusters.push(current);
  // anchor อยู่ที่ไหนก็ได้ภายในช่วงของ cluster (yFirst=บน, yLast=ล่าง) — รองรับ cluster หลายบรรทัด
  const clusterAt = (y) => clusters.find((c) => y >= c.yLast - CLUSTER_GAP && y <= c.yFirst + CLUSTER_GAP);

  const products = anchors.map((a) => {
    const cluster = clusterAt(a.y);
    const lines = cluster ? cluster.lines : [a.line];
    // แถบ y ของสินค้า (ใช้สำหรับ crop รูปจาก PDF: y=บน, y2=ล่าง ในพิกัดจุดของหน้า)
    // รวม y ของรหัส + cluster + แถวราคาที่จับคู่ — เพราะ cluster เองแคบเกินไป (GAP 21pt แยกตอนช่องว่างใหญ่)
    const rowYs = (byCode.get(a.code) || []).map((r) => r.y);
    const yFirst = Math.max(a.y, cluster ? cluster.yFirst : -Infinity, ...rowYs);
    const yLast = Math.min(a.y, cluster ? cluster.yLast : Infinity, ...rowYs);
    return { category, page: pageNo, code: a.code, y: a.y, yFirst, yLast, line: a.line, named: a.named, lines, rows: byCode.get(a.code) || [] };
  });
  return { category, products };
}

// ---------- สร้างข้อมูลสินค้าจากกลุ่มบรรทัด ----------
const NAME_KEYWORDS = /(Tower|InstaView|AeroHit|AeroCat|AeroMini|Freezer|Door|Compressor|Plumbing|Water Filter|xboom|Grab|Bounce|STAGE|Sound bar|Soundbar|UltraGear|StanbyME|OLED|QNED|DUAL|ARTCOOL|DUALCOOL|Monitor|Washer|Dryer|Combo)/i;
const NAME_STOP = /^(รอบบิลที่|•|ราคา|ลด\b|SIZE|สี\b|ขนาด|ประหยัด|SEER|Phase|Subscription|Disc|Promotion|รับประกัน|LG\s+Subscribe|Combo\s+Promotion)/;
// บรรทัดที่ไม่ใช่ชื่อสินค้า (สเปก/ตารางงวด/แถว policy) — PDF นี้ไม่มีชื่อสินค้าจริง
// มีแต่รหัส+สี+ขนาด+ราคา จึงกรองให้เหลือเฉพาะบรรทัดที่ "ดูเป็นชื่อ" จริงๆ เท่านั้น
const NAME_JUNK = /รอบบิล|รอบที่|Disc\.|ราคา|ลด\s|กก|มม|กว้าง|สูง|ลึก|พลังเสียง|ซับวูฟเฟอร์|ซาวด์บาร์|VISIT|SELF|NOSERVICE|OUT_|•|\d{2,}/;

function pickName(lines) {
  for (const line of lines) {
    const l = line.trim();
    if (!l || NAME_STOP.test(l)) continue;
    if (findEligibleCodes(l).length > 0) continue; // ข้ามบรรทัดรหัสสินค้า
    if (NAME_JUNK.test(l)) continue;
    if (/^\(/.test(l) && l.length < 80) return thaiJoin(l).replace(/^\(|\)$/g, '').trim();
  }
  for (const line of lines) {
    const l = line.trim();
    if (!l || NAME_STOP.test(l)) continue;
    if (findEligibleCodes(l).length > 0) continue;
    if (NAME_JUNK.test(l)) continue;
    if (NAME_KEYWORDS.test(l) && l.length < 80) return thaiJoin(l);
  }
  // PDF นี้ไม่มีชื่อไทยในตาราง — ถ้าไม่มีชื่อที่ชัดเจน ปล่อยว่าง (หน้าเว็บจะแสดงแค่รหัส)
  return '';
}

function slugify(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '-').replace(/^-+|-+$/g, '') || 'product';
}

function buildBlock(model, pdfFile) {
  const { lines, rows } = model;
  const policies = [...rows];
  const monthly = policies.filter((p) => !/^2Y/.test(p.policy));
  const outright = policies.filter((p) => /^2Y/.test(p.policy));
  const mode = monthly.length > 0 ? 'monthly' : outright.length > 0 ? 'outright' : policies.length > 0 ? 'noservice' : 'none';

  let best = null;
  for (const p of policies) {
    if (p.price == null) continue;
    if (!best || p.price < best.price) best = p;
  }

  // ชื่อสินค้า: มาจาก meta.json (กรอกเอง) หรือชื่อที่จับคู่สินค้าไร้รหัส (xboom) เท่านั้น
  // — ไม่อนุมานชื่อจาก PDF เพราะตารางราคาไม่มีชื่อสินค้าจริง (มีแต่รหัส/สี/ขนาด/ราคา)
  const name = model.named ? thaiJoin(model.named) : '';
  const description = lines
    .filter((l) => !/^•/.test(l) && !/^รอบบิลที่/.test(l))
    .map((l) => thaiJoin(l))
    .join('\n')
    .trim()
    .slice(0, 2000);

  const cleanPolicies = policies.map(({ policy, term, price, promoCode }) => ({ policy, term, price, promoCode }));
  return {
    code: model.code,
    slug: slugify(model.code || name),
    category: model.category || null,
    name: name || model.code,
    source: pdfFile,
    page: model.page,
    srcPage: model.page, // หน้าต้นฉบับใน PDF (ไม่ถูก remap ตามการตัดหน้า)
    y: Math.round(model.yFirst), // แถบตำแหน่งสินค้าในหน้า (จุด) — ใช้ crop รูป
    y2: Math.round(model.yLast),
    pdf: `/pdfs/${encodeURIComponent(pdfFile)}`,
    mode,
    price: best ? best.price : null,
    priceFrom: best ? best.policy : null,
    policies: cleanPolicies,
    description,
  };
}

// ---------- ตัด PDF เหลือเฉพาะหน้าสินค้า ----------
// เอกสารราคามีหน้าปก/หน้าโปรโมชัน/เงื่อนไขท้ายเล่มที่ไม่ใช่ข้อมูลสินค้า
// → สร้าง PDF ฉบับย่อเฉพาะหน้าที่มีสินค้า ไปไว้ public/pdfs/ แล้ว remap หมายเลขหน้า
async function writeTrimmedPdf(file, pageNumbers) {
  if (pageNumbers.length === 0) return null;
  const first = Math.min(...pageNumbers);
  const last = Math.max(...pageNumbers);
  const src = fs.readFileSync(path.join(PDF_DIR, file));
  const doc = await PDFDocument.load(src, { ignoreEncryption: true });
  const trimmed = await PDFDocument.create();
  const pages = await trimmed.copyPages(doc, Array.from({ length: last - first + 1 }, (_, i) => first - 1 + i));
  for (const pg of pages) trimmed.addPage(pg);
  const out = path.join(PUBLIC_PDF_DIR, file);
  fs.writeFileSync(out, await trimmed.save());
  return { offset: first - 1, total: trimmed.getPageCount() };
}

// ---------- diff report ----------
function diffReport(products, previous) {
  const cur = new Map(products.map((p) => [p.code, p.price]));
  const lines = [];
  lines.push(`อัปเดตเมื่อ: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
  lines.push(`สินค้าทั้งหมด: ${products.length} รายการ`);
  lines.push('');

  if (previous) {
    const prev = new Map(Object.entries(previous));
    const added = [...cur.entries()].filter(([c]) => !prev.has(c));
    const removed = [...prev.entries()].filter(([c]) => !cur.has(c));
    const changed = [...cur.entries()].filter(([c, p]) => prev.has(c) && prev.get(c) !== p);
    lines.push(`สินค้าใหม่ (+${added.length}):`);
    for (const [c, p] of added) lines.push(`   + ${c}  ${p == null ? '?' : p.toLocaleString()}`);
    lines.push('');
    lines.push(`ราคาเปลี่ยน (~${changed.length}):`);
    for (const [c, p] of changed) lines.push(`   ~ ${c}  ${prev.get(c)?.toLocaleString()} → ${p == null ? '?' : p.toLocaleString()}`);
    lines.push('');
    lines.push(`สินค้าหาย (-${removed.length}):`);
    for (const [c] of removed) lines.push(`   - ${c}`);
    lines.push('');
  } else {
    lines.push('(run ครั้งแรก — ไม่มีข้อมูลเดิมให้เทียบ)');
    lines.push('');
  }

  const noPrice = products.filter((p) => p.price == null);
  lines.push(`⚠️ ยังไม่มีราคา (${noPrice.length}):`);
  for (const p of noPrice) lines.push(`   ? ${p.code || p.name} (หน้า ${p.page}, ${p.source})`);
  lines.push('');
  return lines.join('\n');
}

// ---------- main ----------
async function main() {
  if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });
  const pdfFiles = fs.readdirSync(PDF_DIR).filter((f) => f.toLowerCase().endsWith('.pdf')).sort();
  if (pdfFiles.length === 0) {
    console.error('ไม่พบไฟล์ PDF ในโฟลเดอร์ pdfs/ — กรุณาวางไฟล์ PDF ลงในโฟลเดอร์ pdfs/ ก่อน');
    process.exit(1);
  }

  fs.mkdirSync(PUBLIC_PDF_DIR, { recursive: true }); // ต้องสร้างก่อน writeTrimmedPdf (CI clone ใหม่ไม่มีโฟลเดอร์นี้)

  const allProducts = [];
  const sources = [];
  for (const file of pdfFiles) {
    const pages = await extractLines(path.join(PDF_DIR, file));
    let lastCat = null;
    const pageProducts = [];
    for (const p of pages) {
      const parsed = parsePage(p.page, p.lines, lastCat, file);
      if (parsed.products.length === 0) continue; // ข้ามหน้าปก/หน้าโปรโมชันรวม
      if (parsed.category) lastCat = parsed.category;
      pageProducts.push(...parsed.products);
    }
    const products = pageProducts.map((m) => buildBlock(m, file));
    allProducts.push(...products);

    // ตัด PDF เหลือเฉพาะหน้าที่มีสินค้า (หน้าแรก→หน้าสุดท้ายที่มีสินค้า) แล้ว remap หมายเลขหน้า
    const trim = await writeTrimmedPdf(file, [...new Set(pageProducts.map((m) => m.page))]);
    if (trim) {
      for (const p of products) p.page = p.page - trim.offset;
      sources.push({ file, pages: pages.length, keptPages: trim.total, products: products.length });
      console.log(
        `✓ ${file}: ${pages.length} หน้า → เหลือ ${trim.total} หน้า (เฉพาะหน้าสินค้า), เจอสินค้า ${products.length} รายการ`
      );
    } else {
      sources.push({ file, pages: pages.length, products: products.length });
      console.log(`✓ ${file}: ${pages.length} หน้า, เจอสินค้า ${products.length} รายการ`);
    }
    if (DEBUG) {
      fs.writeFileSync(
        path.join(ROOT, 'scripts', `debug-${file.replace(/\.pdf$/, '')}.txt`),
        pages.map((p) => `===== หน้า ${p.page} =====\n` + p.lines.map((l) => `[${l.y}] ${l.text}`).join('\n')).join('\n')
      );
    }
  }

  // dedupe ด้วยรหัสสินค้า (เก็บตัวที่มีแถว policy ครบที่สุด)
  const byCode = new Map();
  for (const p of allProducts) {
    const existing = byCode.get(p.code);
    if (existing) {
      if (p.policies.length > existing.policies.length) {
        console.warn(`⚠️ รหัสซ้ำ: ${p.code} — เก็บเวอร์ชันหน้า ${p.page} (${p.policies.length} policy) แทนหน้า ${existing.page}`);
        byCode.set(p.code, p);
      }
      continue;
    }
    byCode.set(p.code, p);
  }
  let products = [...byCode.values()];

  // ชื่อไทย/หมวดหมู่ที่กรอกเองใน meta.json (คีย์ = รุ่นก่อนจุด เช่น "WD516AN" หรือโค้ดเต็ม)
  // คีย์ที่ขึ้นต้น _ (คำอธิบาย/ตัวอย่าง) ถูกข้าม
  let meta = {};
  if (fs.existsSync(META_JSON)) {
    try {
      const raw = JSON.parse(fs.readFileSync(META_JSON, 'utf8'));
      meta = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_')));
    } catch (e) {
      console.warn('⚠️ meta.json อ่านไม่ได้:', e.message);
    }
  }

  // รุ่นสี variants ไม่มีแถวราคาของตัวเอง (เช่น WD516AN.AEWPLMT) → ใช้ราคาต่ำสุดของครอบครัวเดียวกัน
  const famPrice = new Map();
  for (const p of products) {
    const f = familyOf(p.code);
    if (p.price != null && (!famPrice.has(f) || p.price < famPrice.get(f))) famPrice.set(f, p.price);
  }
  for (const p of products) {
    if (p.price == null && famPrice.has(familyOf(p.code))) {
      p.price = famPrice.get(familyOf(p.code));
      p.priceNote = 'ราคารุ่นเดียวกัน';
    }
  }

  // รวมรุ่นสี/เวอร์ชันที่ราคาเท่ากันเป็น 1 การ์ด (เช่น 27LX6TDGA.ATM/.GRAB, OLED55C6PSA.ATM/.S30A, 32U889.GRAB/32U889SA-W)
  // — ราคาเท่ากัน = สินค้าตัวเดียวกันคนละสี/เวอร์ชัน ไม่ต้องโชว์ซ้ำ (ต้องรันหลังเติมราคาครอบครัว ราคาจะได้ครบก่อนจับกลุ่ม)
  // ราคาต่างกันในครอบครัวเดียวกัน (เช่น WD516AN.ACNPLMT 799 ≠ 599) = สินค้าคนละแบบ → ยังแยกการ์ด
  const variantGroup = (c) => Object.keys(CATEGORY_OVERRIDES).find((k) => c.startsWith(k)) || c.split('.')[0];
  const keepScore = (p) => (p.code.includes('.ATM') ? 2 : 0) + Math.min(p.policies.length, 3);
  const byVariant = new Map();
  for (const p of products) {
    const key = `${variantGroup(p.code)}|${p.price}`;
    const cur = byVariant.get(key);
    if (!cur || keepScore(p) > keepScore(cur)) byVariant.set(key, p);
  }
  products = [...byVariant.values()];

  for (const p of products) {
    const mExact = meta[p.code];
    const mFam = meta[familyOf(p.code)];
    const m = mExact || mFam;
    if (m) {
      if (m.name) p.name = m.name;
      if (m.category) p.category = m.category;
      if (m.gift) p.gift = m.gift; // ของแถม (แสดงรูปบนการ์ด) — ใส่ใน meta.json
      if ((mExact && mExact.hide) || (mFam && mFam.hide)) p.hidden = true; // ต้องการซ่อนรุ่นนี้ออกจากแคตตาล็อก (meta.json)
    }
    // รวมการ์ดรุ่นย่อยเข้ากับรุ่นหลัก (เช่น WD516AN.ACNPLMT → WD516) — ค่าจาก meta `merge`
    p._merge = (mExact && mExact.merge) || (mFam && mFam.merge) || null;
    // บังคับหมวดหมู่สำหรับรุ่นที่ PDF วางผิดหน้า (ใส่หลัง meta เพื่อให้ override เสมอ)
    // เทียบเป็น prefix เพราะรหัสมี suffix สี/เวอร์ชันคั่นด้วย - เช่น "32U889SA-W.ATM", "45GX950A-B.ATM"
    const overrideKey = Object.keys(CATEGORY_OVERRIDES).find((k) => p.code.startsWith(k));
    if (overrideKey) p.category = CATEGORY_OVERRIDES[overrideKey];
    if (p.category && FRIDGE_SUB[p.category]) p.category = FRIDGE_SUB[p.category];
  }

  // รวมรุ่นย่อยเข้าด้วยกันตาม meta `merge` (เช่น WD516AN.* + WD516 ซื้อขาด → การ์ดเดียว "WD516")
  // — รวม policy ทั้งหมด (dedupe ด้วย policy|price) แล้วเก็บการ์ดหลักไว้ (หน้า/แถบ y สำหรับรูปมาจากการ์ดหลัก)
  const mergeMap = new Map(); // target -> รายการรุ่นย่อยที่จะรวมเข้า
  for (const p of products) {
    const t = p._merge;
    if (t && t !== p.code) {
      if (!mergeMap.has(t)) mergeMap.set(t, []);
      mergeMap.get(t).push(p);
    }
  }
  for (const [target, subs] of mergeMap) {
    const base = products.find((p) => p.code === target);
    if (!base) {
      console.warn(`⚠️ merge: ไม่พบการ์ดหลัก ${target}`);
      continue;
    }
    const seen = new Set(base.policies.map((r) => `${r.policy}|${r.price}`));
    for (const s of subs) {
      for (const r of s.policies) {
        const k = `${r.policy}|${r.price}`;
        if (!seen.has(k)) {
          base.policies.push(r);
          seen.add(k);
        }
      }
      if (!base.description && s.description) base.description = s.description;
    }
    // คำนวณราคาเริ่มต้นใหม่ (ต่ำสุดจาก policy ทั้งหมด) + mode
    let best = null;
    for (const r of base.policies) if (r.price != null && (!best || r.price < best.price)) best = r;
    base.price = best ? best.price : null;
    base.priceFrom = best ? best.policy : null;
    const monthly = base.policies.filter((r) => !/^2Y/.test(r.policy));
    base.mode = monthly.length > 0 ? 'monthly' : base.mode;
    console.log(`🔀 รวม ${subs.length + 1} การ์ด → ${base.code} (policy ${base.policies.length} รายการ, เริ่มต้น ${base.price})`);
  }
  products = products.filter((p) => !p._merge || p._merge === p.code);
  for (const p of products) delete p._merge;

  const hiddenCount = products.filter((p) => p.hidden).length;
  products = products.filter((p) => !p.hidden);
  if (hiddenCount > 0) console.log(`ℹ️ ซ่อนตาม meta.json: ${hiddenCount} รายการ`);

  products.sort(
    (a, b) =>
      (a.category || '').localeCompare(b.category || '', 'th') ||
      a.code.localeCompare(b.code, 'en') ||
      0
  );

  const data = {
    // ไม่มี generatedAt — ถ้าใส่ timestamp จะทำให้ products.json ต่างทุกครั้งที่ build (diff รก)
    // ดูวันเวลาล่าสุดได้จาก scripts/report.txt (บรรทัด "อัปเดตเมื่อ")
    sources,
    products,
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  // Fix promoCode issues: add missing closing parentheses, fix known typos
  for (const p of products) {
    for (const pol of p.policies) {
      if (!pol.promoCode) continue;
      // Add missing closing parentheses
      const openCount = (pol.promoCode.match(/\(/g) || []).length;
      const closeCount = (pol.promoCode.match(/\)/g) || []).length;
      if (openCount > closeCount) pol.promoCode += ')'.repeat(openCount - closeCount);
      // Fix known typos from PDF extraction
      if (pol.promoCode === 'VISIT_5Y_6M00') pol.promoCode = 'VISIT_5Y_6M';
    }
  }
  fs.writeFileSync(OUT_JSON, JSON.stringify(data, null, 2));

  // diff report
  let previous = null;
  if (fs.existsSync(SNAPSHOT)) {
    try { previous = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')); } catch { /* ignore */ }
  }
  const report = diffReport(products, previous);
  fs.writeFileSync(REPORT, report);
  fs.writeFileSync(SNAPSHOT, JSON.stringify(Object.fromEntries(products.map((p) => [p.code || `slug:${p.slug}`, p.price])), null, 2));

  console.log('');
  console.log(report);
  console.log(`\nเขียนข้อมูลไปที่: ${path.relative(ROOT, OUT_JSON)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export { parsePage, buildBlock, parsePolicies, parsePolicyRow, isNoise, isCategory, cleanCategory, toNumber, thaiJoin, findEligibleCodes, leadingCode };
