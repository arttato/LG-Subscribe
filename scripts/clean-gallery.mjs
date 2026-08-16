// ทำความสะอาดแกลเลอรี่: (1) ลบรูปที่ไม่ได้มาจาก lg.com/th (2) ลบรูปซ้ำ/มุมเดียวกัน
// ใช้กับทั้ง lg-gallery.json และ color-galleries.json
import fs from 'fs';

function clean(file) {
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
    // (3) มุมเดียวกัน pixel-identical (ต่าง < 0.5%) — lg-gallery.json
    'WD518': ['ABGRLML2.jpg', 'ABGRLML4.jpg', 'ABGRLML6.jpg', 'ABGRLML24.jpg', 'ABGRLML33.jpg'],
    'A9T-ULTRA.DCBPETH': ['13_A9T-ULTRA_PH_Stick_Extended_2010.jpg'],
    'GV-B25FFGDB.ABMPLMT': ['_Front_LightingX_2010.jpg', '_LeftSide_LightingX_2010.jpg', '_RightSide_LightingX_2010.jpg'],
    'GC-X257CMHW.AEEPLMT': ['-03-dispenser-cubed-ice-1044.jpg'],
    '32U889SA-W.ATM': ['smart-monitor-32u889sa-2025-gallery-swing-thumbnail-15.jpg'],
    '45GX950A-B.ATM': ['ultragear-gaming-45gx950a-2025-gallery-thumbnail-06.jpg'],
    'WD110MN.ABGPLMT': ['calmingbeige-gallery-13-2010.jpg', 'calmingbeige-gallery-15-2010.jpg'],
    'AS35GGW10.ATH': ['as35ggw10-gallery-gallery-2010-11.jpg', 'as35ggw10-gallery-gallery-2010-13.jpg'],
    'S3MFC.ALBPETH': ['/L-02.jpg'],
    // (4) มุมเดียวกัน pixel-identical — color-galleries.json (แยกรายสี)
    'WD516:white': ['9_WD516AN.AWHRLML-2010.jpg', '10_WD516AN.AWHRLML-2010.jpg', '12_WD516AN.AWHRLML-2010.jpg'],
    'WD518:beige': ['ABGRLML2.jpg', 'ABGRLML24.jpg', 'ABGRLML34.jpg'],
    'WD518:white': ['WD518AN_AWHPLMT_2-1044.jpg', 'WD518AN_AWHPLMT_10-1044.jpg'],
    'WD518:gray': ['WD518AN_ACGPLMT_10-1044.jpg'],
  };

  const removeIfMatch = (list, code) => {
    const needles = plan[code];
    if (!needles) return { list, removed: 0 };
    const keep = list.filter((u) => {
      const hit = needles.find((n) => u.includes(n));
      return !hit;
    });
    return { list: keep, removed: list.length - keep.length };
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
    let removed = 0;
    let images = p.images || [];
    const r1 = removeIfMatch(images, p.code);
    removed += r1.removed;
    images = r1.list;
    const colors = (p.colors || []).map((c) => {
      const key = p.code + ':' + c.key;
      const r = removeIfMatch(c.images || [], key);
      removed += r.removed;
      return { ...c, images: r.list };
    });
    if (removed) {
      console.log(`✂️  ${p.code}: ลบ ${removed} รูป (${(p.images || []).length} → ${images.length} ภาพหลัก)`);
    }
    removedTotal += removed;
    out.push({ ...p, images, colors: colors.length ? colors : p.colors });
  }

  console.log(`  ${file}: ลบรวม ${removedTotal} รูป`);
  const wrapped = Array.isArray(g) ? out : { ...g, products: out };
  fs.writeFileSync(file, JSON.stringify(wrapped, null, 2) + '\n');
}

clean('./src/data/lg-gallery.json');
clean('./src/data/color-galleries.json');
console.log('เขียนไฟล์เรียบร้อย');
