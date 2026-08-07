/**
 * scripts/fix_math_curriculum_text.mjs — ซ่อมข้อความตัวชี้วัดคณิตศาสตร์ใน data/curriculum.json
 *
 * ปัญหา: font ใน math.pdf ต้นทางแปลงสระ "า" (U+0E32) เป็น "ำ" (U+0E33) ทุกตัว
 *        ตรวจแล้ว: ตัวชี้วัดคณิต 116 รายการ ไม่มี "า" เลยแม้แต่ตัวเดียว
 *        (วิชาภาษาไทยไม่ได้รับผลกระทบ — มี "า" 169/181 รายการ)
 *
 * วิธีซ่อม 2 ขั้น เพราะแทน "ำ"→"า" ตรงๆ ไม่ได้ ("ำ" ของจริงก็มี เช่น จำนวน คำตอบ):
 *   1. แปลง "ำ" → "า" ทั้งหมด
 *   2. คืน "ำ" กลับเฉพาะคำที่มี "ำ" ของจริง ตาม RESTORE ด้านล่าง
 *      (ใช้ pattern ยาวพอที่จะไม่ชนคำอื่น เช่น "นาเสนอ"→"นำเสนอ" แต่ "นาที" ต้องไม่ถูกแตะ)
 *
 * 🚧 ผลลัพธ์ยังไม่ถือว่าถูกต้องจนกว่าครูจะตรวจ docs/math-curriculum-review.md
 *    (ณ 7 ส.ค. 2569 ยังไม่ได้ส่งให้ครู) — ดู TODO ที่ ENABLED_SUBJECTS
 *    ใน lib/curriculum-retrieval.ts ว่าต้องทำอะไรก่อนให้ครูใช้งานจริง
 *
 * ⚠️ สคริปต์นี้เขียนทับ data/curriculum.json — ถ้าเจอคำที่ยังผิดให้แก้ที่ RESTORE
 *    แล้วรันใหม่ อย่าแก้ JSON ด้วยมือ (จะหายตอนรันครั้งถัดไป)
 *    รันซ้ำได้ผลลัพธ์เท่าเดิม แต่ docs/math-curriculum-review.md จะไม่มีของเทียบ
 *    เพราะข้อความ "เดิม" กลายเป็นข้อความที่แก้แล้ว → ถ้าต้องการไฟล์ตรวจใหม่
 *    ให้ git checkout data/curriculum.json กลับไปที่ฉบับดิบก่อน
 *
 * รัน: node scripts/fix_math_curriculum_text.mjs
 */

import { readFile, writeFile } from "node:fs/promises";

const CURRICULUM = new URL("../data/curriculum.json", import.meta.url);
const REVIEW = new URL("../docs/math-curriculum-review.md", import.meta.url);

/**
 * คำที่มี "ำ" ของจริงในคลังศัพท์คณิตศาสตร์
 * เขียนในรูป "หลังแปลงขั้นที่ 1 แล้ว" (คือใช้ า) → รูปที่ถูกต้อง
 * เรียงจากยาวไปสั้น ตอนแทนที่ เพื่อไม่ให้ pattern สั้นกินคำยาว
 */
const RESTORE = [
  // จำ-
  ["จานวน", "จำนวน"],
  ["จาแนก", "จำแนก"],
  ["จาเป็น", "จำเป็น"],
  ["จาลอง", "จำลอง"],
  ["ประจา", "ประจำ"],
  // คำ-
  ["คาตอบ", "คำตอบ"],
  ["คาถาม", "คำถาม"],
  ["คาสั่ง", "คำสั่ง"],
  ["คาอธิบาย", "คำอธิบาย"],
  ["คานวณ", "คำนวณ"],
  ["คาศัพท์", "คำศัพท์"],
  // กำ-
  ["กาหนด", "กำหนด"],
  ["กาลัง", "กำลัง"], // เลขยกกำลัง (ป.6)
  ["กาไร", "กำไร"], // โจทย์ปัญหาร้อยละ กำไร-ขาดทุน (ป.6)
  // นำ-
  ["นาเสนอ", "นำเสนอ"],
  ["นามา", "นำมา"],
  ["นาไป", "นำไป"],
  // สำ-
  ["สาหรับ", "สำหรับ"],
  ["สาคัญ", "สำคัญ"],
  ["สาเร็จ", "สำเร็จ"],
  ["สารวจ", "สำรวจ"],
  // อื่นๆ
  ["ตาแหน่ง", "ตำแหน่ง"], // ทศนิยมไม่เกิน 3 ตำแหน่ง (ป.4-6)
  ["ลาดับ", "ลำดับ"],
  ["น้าหนัก", "น้ำหนัก"],
  ["น้า", "น้ำ"], // ปริมาตรน้ำ — ต้องอยู่หลัง "น้าหนัก" เสมอ
  ["ดาเนิน", "ดำเนิน"],
  ["ชานาญ", "ชำนาญ"],
  ["ทาให้", "ทำให้"],
  ["การทา", "การทำ"],
  ["ซ้า", "ซ้ำ"], // แบบรูปซ้ำ
  ["ต่าสุด", "ต่ำสุด"],
  ["ต่ากว่า", "ต่ำกว่า"],
];

function fixText(text) {
  let out = text.replaceAll("ำ", "า"); // ขั้นที่ 1
  for (const [wrong, right] of RESTORE) out = out.replaceAll(wrong, right); // ขั้นที่ 2
  return out;
}

const data = JSON.parse(await readFile(CURRICULUM, "utf8"));
const rows = [];

for (const [grade, standards] of Object.entries(data.math)) {
  for (const std of standards) {
    if (std.strandText) std.strandText = fixText(std.strandText);
    for (const ind of std.indicators) {
      const before = ind.text;
      const after = fixText(before);
      ind.text = after;
      if (before !== after) rows.push({ grade, code: ind.code, before, after });
    }
  }
}

await writeFile(CURRICULUM, JSON.stringify(data, null, 2) + "\n", "utf8");

// ── ไฟล์ให้ครูตรวจ — ทุกบรรทัดที่เปลี่ยน เทียบก่อน/หลัง ──
const review = [
  "# ตรวจข้อความตัวชี้วัดคณิตศาสตร์ (ป.1-6)",
  "",
  "ไฟล์ math.pdf ต้นทางมีปัญหา font: สระ **า** ถูกแสดงเป็น **ำ** ทุกตัว",
  "ระบบแก้กลับให้อัตโนมัติแล้ว แต่ต้องมีคนอ่านยืนยันก่อนเปิดใช้จริง",
  "",
  "**รหัสตัวชี้วัดไม่ได้ถูกแก้** — รหัสถูกต้องมาตั้งแต่ต้น แก้เฉพาะข้อความ",
  "",
  `แก้ทั้งหมด ${rows.length} รายการ`,
  "",
  "## สิ่งที่ยังผิดอยู่และ**ไม่ใช่**ประเด็นของการตรวจรอบนี้",
  "",
  "- ช่องว่างกลางประโยคที่ดูแปลกๆ — ติดมาจากการขึ้นบรรทัดใหม่ใน PDF",
  '- ข้อความหัวตาราง เช่น "สาระการเรียนรู้แกนกลาง" หรือ "ป.2 (ต่อ)" ที่หลุดมาต่อท้ายตัวชี้วัดบางข้อ',
  "",
  "ทั้งสองอย่างมีมาตั้งแต่ตอนสกัดจาก PDF รอบตรวจนี้ดู**ตัวสะกดผิด**อย่างเดียวก่อน",
  "",
  "> ⚠️ ไฟล์นี้ระบบสร้างให้อัตโนมัติ ห้ามแก้ด้วยมือ",
  "> ถ้าเจอคำที่ยังผิด ให้แก้ที่ตาราง RESTORE ใน `scripts/fix_math_curriculum_text.mjs` แล้วรันสคริปต์ใหม่",
  "",
  "---",
  "",
];

let currentGrade = "";
for (const r of rows) {
  if (r.grade !== currentGrade) {
    currentGrade = r.grade;
    review.push(`## ${currentGrade}`, "");
  }
  review.push(`### ${r.code}`, "", `- ❌ เดิม: ${r.before}`, `- ✅ แก้เป็น: ${r.after}`, "");
}

await writeFile(REVIEW, review.join("\n"), "utf8");

const remaining = rows.filter((r) => r.after.includes("ำ"));
console.log(`✅ แก้แล้ว ${rows.length} รายการ`);
console.log(`   ยังมี "ำ" เหลืออยู่ใน ${remaining.length} รายการ (ควรเป็นคำที่มี ำ จริง เช่น จำนวน)`);
console.log(`   รายละเอียดให้ครูตรวจ: docs/math-curriculum-review.md`);
