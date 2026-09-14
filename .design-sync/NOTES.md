# design-sync NOTES — iep-gen

## ขอบเขต (ตัดสินใจ 14 ก.ย. 2569)

- sync **เฉพาะ `components/ui/`** (Button, Card, Chip, Field + Input/Textarea/Select) — component เดิมของแอป
  (StudentPicker, AssessmentForm, PlanReview ฯลฯ) ยังผูก fetch/state และใช้สี Tailwind default ยังไม่ผ่าน Phase 5 ของ DESIGN.md
  ถ้า sync เข้าไป design agent จะเห็นของเก่าปน
- preview: เขียนเองครบทั้ง 4 ไฟล์ component (ไม่ใช้ floor card)
- ไม่มี Storybook — package shape

## วิธี build ที่เฉพาะกับ repo นี้

- **แอป Next.js `private: true` ไม่มี `dist/`** → ใช้ `.design-sync/entry.ts` เป็น entry (`cfg.entry`)
  - เหตุผล: synth entry ของ converter ใช้ `export * from "<file>"` ซึ่งไม่ส่งต่อ `export default`
    → Button / Card / Chip จะหายจาก `window.IepGen`
  - เพิ่ม primitive ใหม่ใน `components/ui/` → เพิ่มทั้งใน `entry.ts` และ `componentSrcMap`
- **CSS:** component ใช้ Tailwind class + token ใน `app/globals.css`
  → `buildCmd` compile `.design-sync/ds-input.css` ด้วย Tailwind CLI → `.design-sync/.cache/ds.css` (gitignored) = `cfg.cssEntry`
  - **ต้องรัน `buildCmd` ก่อน converter ทุกครั้ง** ไม่งั้น cssEntry ไม่มีไฟล์หรือเป็นของเก่า
  - content glob รวม `.design-sync/previews/**/*.tsx` ด้วย — class ที่ใช้เฉพาะใน preview ถึงจะถูก generate
  - token ดึงจาก `app/globals.css` ผ่าน `@import` — ห้าม copy ค่าสีมาไว้ใน ds-input.css
- **ฟอนต์:** แอปโหลด IBM Plex Sans Thai Looped ผ่าน `next/font` ใช้นอก Next ไม่ได้
  → ds-input.css `@import` Google Fonts ตอน render (ผู้ใช้เลือก 14 ก.ย. 2569 — ไม่แตะ package.json)
  และตั้ง `--font-plex-looped` เอง เพราะนอก Next ตัวแปรนี้ไม่มีค่า (body ใช้ `var(--font-plex-looped)`)
- **render check:** เครื่องนี้มี Playwright chromium build `1228` ใน cache → ใช้ `playwright@1.61.1` ใน `.ds-sync/`
  (รุ่นล่าสุด 1.63.0 ต้องการ 1243 ซึ่งไม่มี) ติดตั้งด้วย `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`

- **`guidelinesGlob: []` ตั้งใจปิด** — ค่าเริ่มต้นดึง `docs/*.md` ซึ่งเป็นเอกสารภายในทีม (DEV_PLAN, GIT_WORKFLOW,
  math-curriculum-review) ไม่ใช่ design guideline และไม่ควรขึ้น Claude Design
  ถ้าจะส่ง guideline จริงในอนาคต ให้ระบุไฟล์ตรงๆ ห้ามกลับไปใช้ค่าเริ่มต้น
- **`.d.ts` ต้องเขียนเองใน `dtsPropsFor`** — ไม่มี dist/ ให้ extract type → ถ้าไม่ใส่จะได้ stub `[key: string]: unknown`
  แก้ props ใน `components/ui/*.tsx` เมื่อไร ต้องแก้ `dtsPropsFor` ให้ตรงด้วย
- preview ของ Input / Textarea / Select แสดงอยู่ใน `Field` เสมอ เพราะเป็นวิธีใช้จริง (hint บังคับ)

## Known render warns

- `tokens: ... (1 missing, below threshold)` = `--tw-shadow-color` ตัวแปรภายในของ Tailwind ที่ ring utility อ้างถึง ไม่มีผลกับหน้าจอ

## สถานะ

- 14 ก.ย. 2569: `DesignSync` ตอบว่าต้อง design-system authorization — ผู้ใช้ต้องรัน `/design-login` จาก session แบบ interactive
  ยังไม่มี `projectId` / ยังไม่ได้สร้างโปรเจกต์ใน Claude Design

## Re-sync risks

- `.design-sync/.cache/ds.css` เป็นของที่ generate — ถ้าลืมรัน `buildCmd` preview จะใช้ CSS เก่า
- ฟอนต์พึ่ง Google Fonts ตอน render — ออฟไลน์จะเป็นฟอนต์ fallback โดยไม่มีอะไรเตือน
- Playwright pin ผูกกับ chromium ใน cache ของเครื่องนี้ — เครื่องอื่นต้องเช็ค revision ใหม่
