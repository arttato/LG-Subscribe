// ตรวจหารูปในแกลเลอรี่ที่เป็น "มุมเดียวกันแต่คนละขนาด/ชนิด" (ซ้ำซ้อน)
// วิธี: ตัดคำบอกขนาด/ชนิดออกจากชื่อไฟล์ แล้วเทียบ (ชื่อฐาน + เลขมุม)
import fs from 'fs';

const g = JSON.parse(fs.readFileSync('./src/data/lg-gallery.json', 'utf8'));
const arr = Array.isArray(g) ? g : (g.products || []);

// คำที่ตัดออก (บอกขนาด/ชนิด ไม่ใช่ตัวมุม)
const stripWords = [
  'basic', 'thumbnail', 'thumb', 'zoom', 'gallery', 'mobile', 'mobilezoom',
  'mobile-zoom', 'update', 're-gallery', 'swing', 'detail', 'zoom-d',
  'new', 'at0', 'atom-v', 'objet', 'gp1', 'feature-card', 'feature',
  'auto-ice-maker', 'aw', 'ultrawide', 'ultragear', 'ultrafine', 'uhd', '4k', '5k',
  'xboom', 'stanbyme', 'qned', 'oled', 'mrgb', 'dualcool', 'air', 'inverter',
  'wash', 'tower', 'soundbar', 'av-soundbar', 'smart-monitor', 'monitor',
  'washing-machine', 'air-purifier', 'air-puricare', 'water-purifier',
  'multi-door', 'side-by-side', 'lifestyle-screens', 'tv', '2025', '2026',
  'lg', 'eath-th-c', 'eath', 'th-c', 'e', 'b', 'a', 'd', 'c', 'w', 'h',
];
const reStrip = new RegExp(`-?(?:${stripWords.join('|')})-?`, 'gi');
const reSize = /(?:^|\/)[^/]*(?:\d+x\d+|\d{3,4})[^/]*(?:\/|$)|(?:^|[_-])(?:\d+x\d+|\d{3,4})(?:[_-]|$)/gi;

const signature = (u) => {
  let name = u.split('/').pop().replace(/\.(jpg|png)$/i, '');
  // ตัดโฟลเดอร์นำหน้าเลข (01-basic, 04-thumbnail...)
  let segs = u.split('/');
  segs = segs.filter((s) => !/^\d{2}-(basic|thumbnail|zoom|gallery|mobile|mobile-zoom)/i.test(s));
  // เลขมุมท้ายสุด
  const m = name.match(/(\d{1,2})$/);
  const angle = m ? m[1] : '0';
  name = name.replace(/(\d{1,2})$/, '');
  let base = name.replace(reStrip, '').replace(reSize, '').replace(/_/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${base}#${angle}`.toLowerCase();
};

const suspects = [];
for (const p of arr) {
  const bySig = new Map();
  for (const u of p.images || []) {
    const s = signature(u);
    if (!bySig.has(s)) bySig.set(s, []);
    bySig.get(s).push(u);
  }
  for (const [s, urls] of bySig) {
    if (urls.length > 1) suspects.push({ code: p.code, sig: s, urls });
  }
}

console.log('=== มุมซ้ำ (มุมเดียวกันหลายขนาด/ชนิด): ' + suspects.length + ' กลุ่ม ===');
for (const s of suspects) {
  console.log('\n### ' + s.code + ' | ' + s.sig);
  for (const u of s.urls) console.log('   ', u.split('/').slice(-3).join('/'));
}
