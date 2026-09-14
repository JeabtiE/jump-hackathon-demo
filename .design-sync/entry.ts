/**
 * .design-sync/entry.ts — entry ของ bundle ที่ส่งเข้า Claude Design
 *
 * แอปนี้ไม่มี dist/ และ converter จะสร้าง entry เองด้วย `export * from "<ไฟล์>"`
 * ซึ่งไม่ส่งต่อ `export default` → Button / Card / Chip จะหายจาก window.<global>
 * ไฟล์นี้จึงแปลง default export เป็น named export โดยไม่แตะโค้ดแอป
 *
 * ขอบเขต: เฉพาะ components/ui/ (ตัดสินใจ 14 ก.ย. 2569) — component เดิมยังไม่ผ่าน Phase 5
 * เพิ่ม primitive ใหม่ใน components/ui/ → เพิ่มบรรทัดที่นี่ และใน componentSrcMap ของ config.json
 */

export { default as Button } from "../components/ui/Button";
export { default as Card } from "../components/ui/Card";
export { default as Chip } from "../components/ui/Chip";
export { Field, Input, Textarea, Select } from "../components/ui/Field";
