// ทำความสะอาดแกลเลอรี่: (1) ลบรูปที่ไม่ได้มาจาก lg.com/th (2) ลบรูปซ้ำ/มุมเดียวกัน
import fs from 'fs';

const file = './src/data/lg-gallery.json';
const g = JSON.parse(fs.readFileSync(file, 'utf8'));
const arr = Array.isArray(g) ? g : (g.products || []);

// แผนการลบ: code -> [ส่วนของ URL ที่ตรงกับรูปที่ต้องลบ] (กรณีลบทั้ง entry ใช้ DELETE_ENTRY)
const DELETE_ENTRY = '##DELETE##';
const plan = {
  // (1) แหล่งไม่ใช่ lg.com/th
  '34U650A-B.ATM': [DELETE_ENTRY], // ทั้ง 15 รูปมาจาก hk_en — LG ไทยไม่มีรุ่นนี้
  'ZT1Q12GULA1.EWGHATH': ['channelbtb/lgcom/common/portal/es/'],
  // (2) มุมเดียวกันคนละโฟลเดอร์ (รูปเดียวกันคนละขนาด)
  'GC-B48FPGAM.ADBPLMT': ['gallery-thumbnail-11-back-view.jpg'],
  'XBOOM-BOUNCE': ['xboom-bounce-2025-gallery-thumbnail-08.jpg'],
  // (3) มุมเดียวกัน pixel-identical (ต่าง < 0.5%)
  'WD518': ['ABGRLML2.jpg', 'ABGRLML4.jpg', 'ABGRLML6.jpg', 'ABGRLML24.jpg', 'ABGRLML33.jpg'],
  'A9T-ULTRA.DCBPETH': ['13_A9T-ULTRA_PH_Stick_Extended_2010.jpg'],
  'GV-B25FFGDB.ABMPLMT': ['_Front_LightingX_2010.jpg', '_LeftSide_LightingX_2010.jpg', '_RightSide_LightingX_2010.jpg'],
  'GC-X257CMHW.AEEPLMT': ['-03-dispenser-cubed-ice-1044.jpg'],
  '32U889SA-W.ATM': ['smart-monitor-32u889sa-2025-gallery-swing-thumbnail-15.jpg'],
  '45GX950A-B.ATM': ['ultragear-gaming-45gx950a-2025-gallery-thumbnail-06.jpg'],
  'WD110MN.ABGPLMT': ['calmingbeige-gallery-13-2010.jpg', 'calmingbeige-gallery-15-2010.jpg'],
  'AS35GGW10.ATH': ['as35ggw10-gallery-gallery-2010-11.jpg', 'as35ggw10-gallery-gallery-2010-13.jpg'],
  'S3MFC.ALBPETH': ['/L-02.jpg'],
};

let removedTotal = 0;
const out = [];
for (const p of arr) {
  const needles = plan[p.code];
  if (needles && needles.includes(DELETE_ENTRY)) {
    console.log(`🗑️  ลบทั้งรุ่น ${p.code} (รูป ${p.images.length} — ไม่ใช่ lg.com/th)`);
    removedTotal += p.images.length;
    continue;
  }
  if (!needles) { out.push(p); continue; }
  const keep = p.images.filter((u) => {
    const hit = needles.find((n) => u.includes(n));
    if (hit) removedTotal++;
    return !hit;
  });
  if (keep.length !== p.images.length) {
    console.log(`✂️  ${p.code}: ลบ ${p.images.length - keep.length} รูป (${p.images.length} → ${keep.length})`);
  }
  out.push({ ...p, images: keep });
}

// ตรวจผลลัพธ์ซ้ำอีกครั้ง
const check = new Set();
for (const p of out) for (const u of p.images || []) check.add(u);
console.log(`\nรวมลบ: ${removedTotal} รูป | เหลือทั้งหมด: ${check.size} รูป`);

// คงโครงสร้าง wrapper เดิมไว้ (ถ้ามี { fetchedAt, source, products })
const wrapped = Array.isArray(g) ? out : { ...g, products: out };
fs.writeFileSync(file, JSON.stringify(wrapped, null, 2) + '\n');
console.log('เขียน lg-gallery.json เรียบร้อย');
