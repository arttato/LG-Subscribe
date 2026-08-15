// แปลงรหัสสินค้าเป็น URL slug — ให้ตรงกับ slug ใน products.json (จาก scripts/extract.mjs)
export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
