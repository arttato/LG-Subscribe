import { defineConfig } from 'astro/config';

// เว็บแบบ static export — โฮสต์ฟรีได้ทุกที่ (Vercel / Netlify / GitHub Pages)
//
// ASTRO_BASE: ใช้เฉพาะ GitHub Pages ที่โฮสต์ใต้โฟลเดอร์ (เช่น /lg-catalog/)
//   - โฮสต์ที่ root (Vercel / Netlify / username.github.io) ไม่ต้องตั้ง — ว่างได้เลย
//   - workflow .github/workflows/deploy.yml ตั้งค่าให้อัตโนมัติจากชื่อ repo
const base = process.env.ASTRO_BASE || '';

export default defineConfig({
  output: 'static',
  base,
});
