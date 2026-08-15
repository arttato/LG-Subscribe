// ดาวน์โหลดรูปสินค้าจากเว็บ LG Thailand ลง public/img/products/{slug}.jpg
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'img', 'products');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const IMAGES = {
  'as35ggw10-ath': 'https://www.lg.com/content/dam/channel/wcms/th/image-update/air-puricare/2025/as35ggx0-abae/gallery/re-gallery/AP2025_AeroHit-Web-Thumbnail_450x450.jpg',
  'dd23gmwe1-ath': 'https://www.lg.com/content/dam/channel/wcms/th/image-update/dehumidifier/2026/dd23gmwe1-ath/aircare_hk_dehumidifier_mojave_2024_gp1/gallery/01-basic/aircare-hk-dehumidifier-mojave-dd14gmwe0-gp1-basic-large.jpg',
  '75qned86bsa-atm': 'https://www.lg.com/content/dam/channel/wcms/th/image-update/tv/2026/qned/100-55qned86bsa-atm/gallery/75qned86/gallery/75QNED86-450.jpg',
  'oled48c6psa-atm': 'https://www.lg.com/content/dam/channel/wcms/th/image-update/tv/2026/oled/oled81-42c6psa-atm/gallery/48-c6/update/OLED48C6PSA-450-01.jpg',
  '27gx704a-b-atm': 'https://www.lg.com/content/dam/channel/wcms/th/image-update/monitor/2026/27gx704a-atm/gallery/basic/ultragear-gaming-27gx704a-2025-gallery-basic-large.jpg',
};

fs.mkdirSync(OUT, { recursive: true });

for (const [slug, url] of Object.entries(IMAGES)) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, referer: 'https://www.lg.com/th/' } });
    if (!res.ok) { console.log(`❌ ${slug}: HTTP ${res.status}`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    const img = await loadImage(buf);
    // ตรวจว่ามีเนื้อหาจริง (ไม่ใช่ภาพว่าง/สีเดียว)
    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    let sum = 0, sum2 = 0, alpha = 0;
    for (let i = 0; i < d.length; i += 4) {
      sum += d[i]; sum2 += d[i] * d[i];
      if (d[i + 3] < 250) alpha++;
    }
    const n = d.length / 4;
    const mean = sum / n;
    const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
    const outPath = path.join(OUT, `${slug}.jpg`);
    fs.writeFileSync(outPath, buf);
    console.log(`✅ ${slug}: ${img.width}x${img.height} stddev=${std.toFixed(1)} โปร่งใส=${(alpha / n * 100).toFixed(1)}% → ${path.relative(ROOT, outPath)}`);
  } catch (e) {
    console.log(`❌ ${slug}: ${e.message}`);
  }
}
