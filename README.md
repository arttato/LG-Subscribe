# รายการสินค้า LG Subscribe (จาก PDF)

เว็บแคตตาล็อกสินค้าแบบ static — ดึงข้อมูลสินค้า/ราคาจากไฟล์ PDF ใบราคารายเดือนโดยอัตโนมัติ แล้วแสดงเป็นเว็บที่ค้นหา/กรองหมวดหมู่ได้ พร้อมหน้า detail ที่ดู PDF ต้นฉบับได้ในตัว

## โครงสร้าง

```
pdfs/                     ← วางไฟล์ PDF ราคาใหม่ที่นี่ (ไฟล์ละกี่ไฟล์ก็ได้)
scripts/extract.mjs       ← สคริปต์อ่าน PDF → สร้างข้อมูล + ตัด PDF เหลือหน้าสินค้าไป public/pdfs/
scripts/extract-images.mjs← สคริปต์ดึงรูปสินค้าจาก PDF → public/img/products/ (ต้อง commit)
scripts/fetch-lg-specs.mjs← สคริปต์ดึงคุณสมบัติ/สเปคจากเว็บ LG Thailand → src/data/lg-specs.json
scripts/fetch-lg-gallery.mjs ← สคริปต์ดึง URL รูปสินค้าหลายมุมจากเว็บ LG → src/data/lg-gallery.json
scripts/extract-pdf-specs.mjs ← สคริปต์ดึงสเปคย่อของรุ่นที่ LG ไม่มีหน้าจากคอลัมน์ "รายการ" ใน PDF → src/data/pdf-specs.json
src/data/products.json    ← ข้อมูลสินค้าที่สกัดได้ (ห้ามแก้เอง — สคริปต์เขียนทับ)
src/data/lg-specs.json    ← สเปคสินค้าจากเว็บ LG Thailand (รัน npm run specs — commit ไฟล์นี้)
src/data/lg-gallery.json  ← URL รูป gallery จากเว็บ LG (รัน npm run gallery — commit ไฟล์นี้)
src/data/pdf-specs.json   ← สเปคย่อจาก PDF ราคา (รัน npm run pdfspecs — commit ไฟล์นี้)
src/data/spec-cards.json  ← รูปสเปคการ์ดสินค้า (รัน npm run specimport — commit ไฟล์นี้)
public/img/specs/         ← รูปสเปคการ์ดสินค้า (รัน npm run specimport — commit ไฟล์เหล่านี้)
src/data/meta.json        ← ใส่ชื่อไทย/หมวดหมู่ที่ต้องการให้สินค้า (กรอกเองได้)
src/pages/                ← หน้าเว็บ (Astro static)
public/pdfs/              ← PDF ฉบับย่อที่เว็บใช้แสดง (สคริปต์สร้างให้อัตโนมัติ — ไม่ต้อง commit)
public/img/products/      ← รูปสินค้าที่สกัดจาก PDF (รัน npm run images — commit ไฟล์เหล่านี้)
scripts/report.txt        ← รายงาน diff: สินค้าใหม่ / ราคาเปลี่ยน / สินค้าหาย
```

## วิธีอัปเดต (ทำทุกเดือนเมื่อได้ PDF ใหม่)

```bash
# 1. วาง PDF ราคาใหม่ลงในโฟลเดอร์ pdfs/ (ลบไฟล์เก่าออกได้ — ระบบอ่านทุกไฟล์ในโฟลเดอร์)
# 2. รันสคริปต์ดึงข้อมูล
npm run extract

# 3. ดูรายงานว่าเดือนนี้มีอะไรเปลี่ยน (เปิด scripts/report.txt)
#    สินค้าใหม่ / ราคาเปลี่ยน / สินค้าที่ไม่มีในไฟล์ใหม่

# 4. (ถ้าต้องการ) เพิ่มชื่อไทย/หมวดหมู่ใน src/data/meta.json แล้วรัน npm run extract ใหม่

# 5. ดึงรูปสินค้าจาก PDF (รุ่นไหน PDF มีรูปให้ จะได้รูปคู่กัน)
npm run images

# 6. (แนะนำ) ใช้รูปสินค้าจริงจากเว็บ LG Thailand แทนภาพสกรีนจาก PDF (ทุก 92 รุ่น)
npm run specs        # คุณสมบัติ/สเปคจาก lg.com/th (จำเป็นสำหรับขั้นตอนนี้)
npm run gallery      # URL รูปหลายมุมจาก lg.com/th
npm run lgimages     # ดาวน์โหลดรูปจริงลง public/img/products/ (ทับรูป PDF)
npm run cardhero     # ตรวจ/แก้รูปการ์ดให้เป็นรูปสินค้าจริงตามหน้า LG (og:image)
npm run colors       # gallery แยกสี → ปุ่มเลือกสีบนหน้า detail (WD516/WD518 3 สี, WashTower 14/10 และ 25/20 → 1 การ์ด 2 สี)
npm run specimport   # นำเข้าสเปคการ์ดจากโฟลเดอร์ สเปคการ์ด/ → public/img/specs/ + src/data/spec-cards.json (จับคู่รุ่นอัตโนมัติ, ต้องมี scripts/spec-card-ocr.json)

# 7. build และ deploy
npm run build        # ผลลัพธ์อยู่ในโฟลเดอร์ dist/
```

> **รูปการ์ดสินค้า:** ตอนนี้ใช้รูปจริงจากเว็บ LG Thailand (`npm run lgimages` — ดาวน์โหลดจาก CDN ของ LG ให้ทุก 92 รุ่น) แทนภาพสกรีนจาก PDF `npm run images` จะ**ไม่ทับ**รุ่นที่มีรูปจาก LG แล้ว (มีใน `lg-gallery.json`) — ใช้รูป PDF เฉพาะรุ่นที่ LG ไม่มีหน้าเท่านั้น

> รูปสินค้าถูกดึงจากรูปที่ฝังใน PDF (จับคู่ตามตำแหน่งบนหน้า) — ต้องรัน `npm run images` แล้ว commit ไฟล์ใน `public/img/products/` ด้วย ไม่งั้น CI จะ build โดยไม่มีรูป (รุ่นที่ PDF ไม่มีรูปจะแสดงแบบไม่มีการ์ดรูป)
> สเปคมาจากเว็บ LG Thailand ต้องรัน `npm run specs` แล้ว commit `src/data/lg-specs.json` — สคริปต์จับคู่รุ่นกับหน้า lg.com/th อัตโนมัติจาก sitemap (รุ่นที่ LG ไทยไม่มีหน้า product จะไม่มีส่วนสเปคในหน้า detail)
> CI (GitHub Actions) ไม่รัน `npm run images` / `npm run specs` เพื่อให้ build เร็ว — ข้อมูลที่ commit ไว้จะถูกใช้

### รูปสินค้าหลายมุม (แกลเลอรี) — จากเว็บ LG Thailand

หน้า detail ของสินค้าที่มีหน้า LG จะแสดงแกลเลอรีรูปหลายมุม (เลื่อนซ้าย/ขวา + เลือกจาก thumbnails) แทนรูปเดี่ยว:

```bash
npm run gallery
```

- สคริปต์อ่านรายการหน้า LG จาก `lg-specs.json` → แกะ URL รูป gallery จากหน้า (โฟลเดอร์ `/gallery/` รองรับชื่อไฟล์ทุกรูปแบบของ LG) → เขียน `src/data/lg-gallery.json` แล้ว commit
- **รูปไม่ได้เก็บใน repo** — เป็น URL hotlink ไปยัง CDN ของ LG โดยตรง (โหลดจากเว็บ LG ตอนแสดงผล) จึงไม่เปลืองพื้นที่ repo
- รุ่นที่ไม่มี gallery (LG ลงรูปเดียว หรือไม่มีหน้า) จะแสดงรูปจาก PDF เหมือนเดิม

### สเปคย่อจาก PDF (รุ่นที่เว็บ LG ไม่มีหน้า)

รุ่นที่ LG ไทยไม่มีหน้า product (แอร์ IXY, แอร์คาสเซ็ท ZT4Q24GPLA1, เครื่องซัก FV1413H4M, WashTower WT1410NHEN) — ดึงสเปคย่อที่อยู่ในคอลัมน์ "รายการ" ของ PDF ราคาเอง:

```bash
npm run pdfspecs
```

- อ่านบรรทัดในแถบตำแหน่งของแต่ละรุ่น (ยึดบรรทัดรหัสสินค้า/BTU เป็น anchor) → แยกเป็นสเปค (Btu, ขนาดตัวเครื่อง, ความจุ, การรับประกัน, มาตรฐานเบอร์ 5 ฯลฯ)
- เขียน `src/data/pdf-specs.json` แล้ว commit — หน้า detail แสดงเป็นกลุ่ม "สเปคจากเอกสาร" พร้อมข้อความบอกที่มา
- ครอบคลุมทุกรุ่นที่เหลือ → สินค้า**ทุกตัว (91/91) มีสเปค** (84 จากเว็บ LG + 7 จาก PDF)

### รูปบริการดูแล (Care Service 2026.pdf)

หน้า detail ของสินค้าเครื่องใช้ไฟฟ้าแสดงหัวข้อ "บริการดูแลจากผู้เชี่ยวชาญ LG" พร้อมรูปหน้าบริการดูแลที่ตรงกับหมวดของสินค้า (เครื่องกรองน้ำ ตู้เย็น เครื่องซักผ้า/อบผ้า แอร์ ฟอกอากาศ ฯลฯ):

```bash
npm run care
```

- เรนเดอร์หน้า 3-25 ของ `Care Service 2026.pdf` → `public/img/care/care-NN.png` (ใช้ `mupdf` WASM — `pdf.js` render + `@napi-rs/canvas` เครชบน Node 24)
- จับคู่สินค้า 66/92 รายการกับหน้าที่ตรงกัน (ทีวี/จอ/ไมโครเวฟ/Sound bar — PDF ไม่มีหน้าบริการดูแล) → `src/data/care.json` แล้ว commit
- ตู้เย็นรุ่นต่อท่อน้ำพร้อมชุดกรองน้ำ (GC-X257CMHW, GC-L24FFCBB) ใช้หน้าพิเศษ (หน้า 6)

### ตรวจสอบราคากับ PDF ต้นฉบับ

เทียบราคา policy ของทุกสินค้าใน `products.json` กับแถวราคาจริงใน PDF (จำลองการจับคู่แบบเดียวกับ `extract`):

```bash
npm run auditprices
```

- อ่าน PDF ทั้ง 2 ไฟล์ → จับคู่แถวราคากับรุ่น (nearest anchor) → เทียบกับราคาที่ commit ไว้ → รายงานรุ่นที่ไม่ตรง (เช่น เจอบั๊กมิติตัวเครื่อง "840x204x840" ถูกนับเป็นราคา 840)
- รันหลัง `npm run extract` ทุกครั้งก่อน commit เพื่อกันราคาผิดขึ้นเว็บ

### ดึงสเปคจากเว็บ LG Thailand (หน้า detail)

หน้า detail ของแต่ละสินค้าจะแสดงส่วน **"คุณลักษณะที่สำคัญ"** (จุดเด่น marketing จากหัวข้อ `keyFeatureList` บนหน้า product ทางการของ LG) เป็นรายการ bullet สั้นๆ — ไม่แสดงตารางสเปคเต็มแล้ว:

```bash
npm run specs
```

- สคริปต์จับคู่รุ่นกับหน้า lg.com/th อัตโนมัติจาก `sitemap.xml` + รายการระบุเองใน `OVERRIDES` (รุ่นที่ sitemap จับคู่ไม่ได้)
- ดึง 2 อย่าง: `features` (คุณลักษณะที่สำคัญ — แสดงบนหน้า detail) + `keySpecs` (ตารางแรกของหน้า — ใช้ทำ tooltip บนการ์ดแคตตาล็อก)
- ข้อมูลที่ดึงได้เขียนไป `src/data/lg-specs.json` แล้ว commit — หน้า detail อ่านจากไฟล์นี้ (โหลดตอน build)
- รุ่นที่ไม่มีหัวข้อคุณลักษณะ: แสดง keySpecs แทน, รุ่นที่ไม่มีหน้า LG (ZT4Q24GPLA1) แสดงสเปคย่อจาก PDF (npm run pdfspecs)
- หน้าแคตตาล็อก: ชี้การ์ดค้างไว้จะเห็น **tooltip สเปคเด่น 2-3 รายการ** (ข้อมูลจากไฟล์เดียวกัน)
- ครอบคลุม **91/91 รุ่น**: 90 รุ่นจากเว็บ LG + ZT4Q24GPLA1 จากสเปคย่อใน PDF ราคา (npm run pdfspecs)

### รุ่นที่ PDF ไม่มีรูป → ดึงจากเว็บ LG Thailand

รุ่นบางตัวอยู่ในไฟล์ราคาแบบตารางล้วน (ไม่มีรูปใน PDF) — หารูปทางการจากเว็บ LG Thailand ใส่เองได้:

```bash
node scripts/download-lg-images.mjs   # ดาวน์โหลดรูปตามรายการในสคริปต์ → public/img/products/{slug}.jpg
```

- สคริปต์นี้มีรายการ `slug → URL รูปทางการ` (og:image จากหน้าสินค้า lg.com/th) — รุ่นใหม่ที่ไม่มีรูป เปิดหน้า lg.com/th หา URL แล้วเพิ่มลงในรายการ `IMAGES` ในสคริปต์
- รูปที่วางทับด้วยวิธีนี้จะถูกใช้แทนรูปจาก PDF โดยอัตโนมัติ (ตรวจ slug ตรงกัน)

> ต้องการ Node.js 18+ เท่านั้น — ไม่ต้องติดตั้ง Python หรือไลบรารีอื่น

## ใส่ชื่อไทยให้สินค้า (meta.json)

ชื่อสินค้าภาษาไทย**ไม่มีอยู่ใน PDF** (ในไฟล์มีแต่รหัสสินค้า สี ขนาด และราคา) จึงใส่เองใน `src/data/meta.json` ได้ — ใช้รหัสเป็นกุญแจจับคู่:

```json
{
  "WD516":  { "name": "เครื่องกรองน้ำ LG WD516",  "category": "เครื่องกรองน้ำ" },
  "WD516AN": { "name": "เครื่องกรองน้ำ LG WD516AN", "category": "เครื่องกรองน้ำ" }
}
```

- กุญแจเป็น**รุ่นก่อนจุด** (เช่น `WD516AN`) จะครอบคลุมทุกสี variant ของรุ่นนั้น หรือจะใช้โค้ดเต็ม (เช่น `WD516AN.ACNPLMT`) เพื่อเจาะจงเฉพาะตัวก็ได้
- คีย์ที่ขึ้นต้น `_` ใช้สำหรับคำอธิบาย/ตัวอย่าง — ระบบข้ามให้อัตโนมัติ
- ใส่ `name` หรือ `category` หรือทั้งคู่ก็ได้

## ฟีเจอร์เว็บ

- หน้าแรก: รายการสินค้าทั้งหมด + ค้นหา (ชื่อ/รุ่น/รหัส) + กรองตามหมวดหมู่
- หน้า detail แต่ละสินค้า: **แกลเลอรีรูปหลายมุม** (จากเว็บ LG) + ชื่อ + ราคาเริ่มต้น + **คุณสมบัติและสเปคจากเว็บ LG Thailand** (จุดเด่น + ตารางสเปคแยกหมวด)
- ราคาแสดงแบบ "ราคาเริ่มต้นราคาเดียว" ตามที่ตกลงกัน — ราคาทุก policy (5Y/6Y/7Y Visit/Self) อยู่ในข้อมูลสินค้า
- ส่วนท้ายหน้า detail มีลิงก์กลับไปหน้า product ทางการของ LG Thailand (เปิดแท็บใหม่)

## หมายเหตุทางเทคนิค

- อ่าน PDF ด้วย `pdfjs-dist` (Node) — แยกบรรทัดตามตำแหน่ง y แล้วจับคู่แถวราคากับรหัสสินค้า
- **PDF ที่เว็บแสดงเป็นฉบับย่อ**: สคริปต์ตัดเฉพาะหน้าสินค้า (หน้าแรกที่มีสินค้า → หน้าสุดท้ายที่มีสินค้า) ทิ้งหน้าปก/หน้าโปรโมชัน/เงื่อนไขท้ายเล่ม แล้ว remap หมายเลขหน้าอัตโนมัติให้ลิงก์ "ไปที่หน้า X" ยังชี้ถูกต้อง (ไฟล์ต้นฉบับเต็มยังอยู่ใน `pdfs/`)
- **สินค้าที่ไม่มีรหัสใน PDF** (เช่น Sound bar LG xboom Grab / Bounce / STAGE301 — ในเอกสารมีแค่ชื่อ ไม่มีรหัสรุ่น): สคริปต์จับคู่ด้วยชื่อที่ปรากฏ (บรรทัดขึ้นต้น `LG xboom ...` ในหน้าแบบ Advance payment) แล้วสร้างรหัสสังเคราะห์ `XBOOM-xxx` เพื่อใช้ติดตามราคาข้ามเดือน เดือนหน้าถ้าเอกสารยังใช้ชื่อเดิม → เจออัตโนมัติ; ถ้า LG เปลี่ยนชื่อ → รหัสใหม่จะโผล่ใน `scripts/report.txt` เป็น "สินค้าใหม่" ให้ตรวจ (รหัสสังเคราะห์ถูกซ่อนไม่แสดงบนเว็บ)
- ภาษาไทยใน PDF ถูกสกัดแบบมีตำหนิ (สระ/วรรณยุกต์สลับที่) — สคริปต์แก้ให้อัตโนมัติด้วย `thaiJoin` + กฎเฉพาะสำหรับคำที่พบบ่อย
- ราคาที่แสดง = ราคาต่อเดือนจากตารางงวด (รอบบิลที่ X-Y) ซึ่งเป็นตัวเลขที่ตรงกับเอกสารจริงที่สุด
- เว็บเป็น static export (โฟลเดอร์ `dist/`) — โฮสต์ฟรีได้ที่ Vercel / Netlify / GitHub Pages

## Deploy อัตโนมัติ (โฮสต์ฟรี) — เลือกอย่างใดอย่างหนึ่ง

> Build + อัปเดตอัตโนมัติทุกครั้งที่ push ไป GitHub — สคริปต์ `npm run prebuild` (extract) รันก่อน build ให้อัตโนมัติใน CI ดังนั้นแค่ push PDF ใหม่ก็จบ

### วิธีแรก (แนะนำ) — Vercel

1. สร้าง repo บน GitHub (public หรือ private ก็ได้) แล้ว push โปรเจกต์นี้ขึ้นไป
2. เข้า [vercel.com/new](https://vercel.com/new) → Import repository เลือก repo นี้
3. Vercel ตรวจเจอ Astro เอง — กด Deploy ได้เลย (ค่า `vercel.json` มีให้แล้ว)
4. ครั้งต่อไป push อะไรก็ได้ → deploy อัตโนมัติ

### วิธีที่สอง — Netlify

1. push โปรเจกต์ขึ้น GitHub (เหมือนข้อ 1 ข้างบน)
2. เข้า [app.netlify.com](https://app.netlify.com) → Add new site → Import an existing project → เลือก repo
3. Netlify อ่าน `netlify.toml` ให้อัตโนมัติ — กด Deploy

### วิธีที่สาม — GitHub Pages (ฟรี ไม่จำกัด build)

1. push โปรเจกต์ขึ้น GitHub
2. เปิด repo → **Settings → Pages** → Source เลือก **GitHub Actions**
3. workflow `.github/workflows/deploy.yml` จะ build + deploy ให้อัตโนมัติทุกครั้งที่ push ไป `main`
4. ระบบคำนวณ path ให้เอง: repo ชื่อ `xxx.github.io` → อยู่ที่ root, repo ชื่ออื่น (เช่น `lg-subscribe`) → อยู่ที่ `/lg-subscribe/`

### Workflow อัปเดตรายเดือน (หลัง deploy แล้ว)

```bash
# 1. วาง PDF ใหม่ลง pdfs/ (แทนไฟล์เก่า)
# 2. ตรวจผลก่อน push (optional แต่แนะนำ)
npm run extract && cat scripts/report.txt
# 3. (optional) อัปเดตสเปค + รูปหลายมุม + banner โปรโมชันจากเว็บ LG
npm run specs && npm run gallery && npm run banners
# 4. push → deploy อัตโนมัติ
```

## คำสั่ง

| คำสั่ง | ความหมาย |
|---|---|
| `npm run extract` | อ่าน PDF ใน `pdfs/` → เขียน `src/data/products.json` + `scripts/report.txt` |
| `npm run images` | ดึงรูปสินค้าจาก PDF → `public/img/products/` (ต้อง commit) |
| `npm run specs` | ดึงสเปคจากเว็บ LG Thailand → `src/data/lg-specs.json` (ต้อง commit) |
| `npm run pdfspecs` | ดึงสเปคย่อของรุ่นที่ LG ไม่มีหน้าจาก PDF → `src/data/pdf-specs.json` (ต้อง commit) |
| `npm run gallery` | ดึง URL รูปหลายมุมจากเว็บ LG → `src/data/lg-gallery.json` (ต้อง commit) |
| `npm run banners` | ดึง banner โปรโมชันหน้า LG Subscribe → `public/img/banners/` + `src/data/banners.json` (ต้อง commit) |
| `npm run care` | เรนเดอร์รูปบริการดูแลจาก `Care Service 2026.pdf` → `public/img/care/` + จับคู่สินค้า → `src/data/care.json` (ต้อง commit) |

### หมายเหตุ banner โปรโมชัน (หน้าแรก)

- **ข้อความบน banner** (`title`/`subtitle`) ดึงอัตโนมัติจากหน้าโปรโมชันทางการของ LG (`/th/subscribe/promotion_subscription/`) — สคริปต์จับคู่ด้วยชื่อไฟล์รูป แล้วอ่านชื่อแคมเปญ + รายละเอียด + ช่วงเวลา (ถ้าเจอการ์ดโปร) ส่วนสไลด์ที่จับคู่ไม่ได้ (เช่น โปรทั่วไป) จะคงข้อความที่ตั้งไว้เดิม แล้วแจ้งเตือนให้ใส่เอง
- **การคลิก banner → กรองแคตตาล็อก:** สไลด์ที่มี `query` (เช่น `ixy`) จะค้นหาเฉพาะรุ่นที่เกี่ยวข้อง; สไลด์ที่มีแค่ `category` จะกรองหมวดนั้น; สไลด์ที่ว่างทั้งคู่จะแสดงทั้งหมด
- สคริปต์ `npm run banners` คง `title`/`category` เดิมไว้ให้อัตโนมัติ (จับคู่ด้วยชื่อไฟล์ต้นทางของ LG) — แก้เฉพาะสไลด์ใหม่เท่านั้น
- มีสคริปต์ช่วย `npm run bannertext` (OCR ภาษาไทย) อ่านตัวหนังสือจากรูป banner เพื่อเอามาใส่ `title` — ใช้เมื่อสไลด์ใหม่ไม่มีข้อความ |
| `npm run dev` | รัน dev server (localhost:4321) |
| `npm run build` | build เว็บ static ไปที่ `dist/` |
| `npm run preview` | ทดสอบเวอร์ชัน build ที่ `dist/` |
