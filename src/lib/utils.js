// แปลงรหัสสินค้าเป็น URL slug — ให้ตรงกับ slug ใน products.json (จาก scripts/extract.mjs)
export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ชื่อย่อสำหรับการ์ด — ใช้ชื่อเต็มจากเว็บ LG (lgName) แต่ตัดส่วนที่ซ้ำซ้อนออก:
// - ส่วนหัวข้อย่อยที่คั่นด้วย | (เช่น "| Super Portable Screen | Motion Art")
// - "รุ่น XXXX" ที่เป็นรหัสสินค้า (การ์ดมีรหัสแสดงอยู่แล้ว)
// เก็บ "รุ่น Bounce/Grab" (ชื่อเล่น ไม่ใช่รหัส) ไว้
// เช่น "เครื่องกรองน้ำ LG PuriCare รุ่น WD516AN.ACNPLMT สีน้ำเงิน" → "เครื่องกรองน้ำ LG PuriCare สีน้ำเงิน"
export function lgShortName(lgName) {
  let n = String(lgName || '');
  n = n.split('|')[0].trim();
  // รหัสสินค้า LG = ตัวอักษร/ตัวเลข/จุด/ขีด โดยต้องมีตัวเลขอย่างน้อย 1 ตัว
  n = n.replace(/\s*รุ่น\s+[A-Za-z0-9.-]*[0-9][A-Za-z0-9.-]*\b/g, '');
  return n.trim();
}
