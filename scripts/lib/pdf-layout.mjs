// อ่าน PDF แล้วคืนค่าเป็นบรรทัดข้อความต่อหน้า (เรียงตามตำแหน่งจริงในหน้ากระดาษ)
// ใช้ pdfjs-dist (อ่านภาษาไทยได้ถูกต้อง) แล้วรวมชิ้นส่วน glyph ที่ถูกตัดออกมาแยกกัน
import fs from 'node:fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const Y_TOLERANCE = 2.5; // ห่างกันไม่เกินนี้ถือว่าอยู่บรรทัดเดียวกัน
const GAP_TOLERANCE = 1.8; // ช่องว่างระหว่าง glyph น้อยกว่านี้ถือว่าเป็นคำ/ตัวเลขเดียวกัน

export async function extractLines(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    pages.push({ page: i, lines: buildLines(tc.items) });
  }
  return pages;
}

function buildLines(items) {
  // 1) จัดกลุ่ม item ที่ y ใกล้กันเป็นบรรทัดเดียวกัน
  const rows = [];
  for (const it of items) {
    const s = it.str;
    if (!s || !s.trim()) continue;
    const y = it.transform[5];
    const x = it.transform[4];
    const w = it.width || s.length * 5;
    let row = rows.find((r) => Math.abs(r.y - y) <= Y_TOLERANCE);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, x1: x + w, s });
  }

  // 2) เรียงซ้าย→ขวา แล้วรวมชิ้นส่วนที่ชิดกันให้เป็นคำเดียวกัน
  return rows
    .sort((a, b) => b.y - a.y)
    .map((r) => {
      r.parts.sort((a, b) => a.x - b.x);
      let out = '';
      let prevX1 = -Infinity;
      for (const p of r.parts) {
        const gap = out === '' ? 0 : p.x - prevX1;
        out += gap > GAP_TOLERANCE ? ' ' + p.s : p.s;
        prevX1 = Math.max(prevX1, p.x1);
      }
      const text = out.replace(/\s+/g, ' ').trim();
      return text ? { y: Math.round(r.y), text } : null;
    })
    .filter(Boolean);
}
