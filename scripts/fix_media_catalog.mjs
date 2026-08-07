/**
 * scripts/fix_media_catalog.mjs — ซ่อม data/mediaCatalog2568.json ที่สกัดไว้แล้ว
 *
 * ทำไมต้องมีสคริปต์นี้ ทั้งที่แก้ scripts/parse_catalog.py ไปแล้ว:
 *   ไฟล์ต้นทาง pdfs/3.txt ไม่ได้อยู่ใน repo (ไม่เคย commit) จึงรัน parse_catalog.py
 *   ใหม่ไม่ได้ สคริปต์นี้ใช้ logic ชุดเดียวกับที่แก้ใน parse_catalog.py
 *   มาแก้ JSON ที่สกัดไว้แล้วแทน
 *
 *   ⚠️ ถ้าหา pdfs/3.txt เจอเมื่อไหร่ ให้รัน parse_catalog.py ใหม่แทนสคริปต์นี้
 *      แล้วเทียบผลว่าตรงกัน — ถ้าตรง ลบสคริปต์นี้ทิ้งได้ เหลือ source เดียว
 *
 * แก้ 2 เรื่อง:
 *   1. ราคาที่ค้างอยู่ในชื่อรายการ — regex เดิม anchor ราคาไว้ท้ายสุด แต่ฉบับ 2568
 *      มีคำกำกับการแก้ไข ("ปรับคุณสมบัติ" / "เพิ่มเติม") ห้อยท้ายราคาอีกที
 *   2. disabilityTypes ที่ว่าง — PDF ตัดบรรทัดกลางคำ ทำให้คีย์เวิร์ดขาดเป็น
 *      "บกพร่อง ทางสติปัญญา" การเทียบ substring ตรง ๆ เลยพลาด
 *      ต้อง squash ช่องว่างทั้งสองฝั่งก่อนเทียบ
 *
 * ⚠️ สคริปต์นี้เขียนทับ data/mediaCatalog2568.json — รันซ้ำได้ผลเท่าเดิม (idempotent)
 *    ถ้าเจอรายการที่ยังผิด ให้แก้ที่ HINTS / PRICE_RE ที่นี่ *และ* ที่ parse_catalog.py
 *    อย่าแก้ JSON ด้วยมือ (จะหายตอนรันครั้งถัดไป)
 *
 * รัน: node scripts/fix_media_catalog.mjs
 */

import { readFile, writeFile } from "node:fs/promises";

const CATALOG = new URL("../data/mediaCatalog2568.json", import.meta.url);

// ── 1. ราคา ────────────────────────────────────────────────────
// ต้อง anchor ที่คำว่า "บาท" เสมอ ห้ามจับตัวเลขลอย ๆ ท้ายชื่อ
// เพราะชื่อจริงจำนวนมากลงท้ายด้วยตัวเลขที่เป็นสเปก ไม่ใช่ราคา
// เช่น "ขนาด 500 GB", "ดินน้ำมัน ... ขนาด 1,000 กรัม", "พู่กัน ขนาดเบอร์ 12"
const EDITORIAL_WORDS = "ปรับคุณสมบัติ|ปรับราคา|ปรับรายการ|เพิ่มเติม|รายการใหม่";
const EDITORIAL = `(?:\\s*(?:${EDITORIAL_WORDS}))*`;
const UNIT = "(?:\\s*/\\s*(?:[\\d,]+\\s*)?[^\\s]*)?";
const PRICE_RE = new RegExp(
  `\\s*([\\d,]+(?:\\.\\d+)?\\s*บาท${UNIT})${EDITORIAL}\\s*$`
);

// คำกำกับการแก้ไขที่ห้อยท้าย "ชื่อรายการ" โดยไม่มีราคาตามมา
// PRICE_RE ตัดให้เฉพาะตอนที่ห้อยหลังราคา แต่รายการที่ไม่มีราคาในตารางสรุป
// (เช่น AC0505 "…ระบบปฏิบัติการไอโอเอส ปรับคุณสมบัติ") ไม่มีอะไรไปตัด คำเลยค้างในชื่อ
// รวม "/" ที่ค้างจากหน่วยราคาที่ขาดหาย (AR0105 "…(OCR) ปรับคุณสมบัติ/") ไว้ด้วย
//
// anchor ท้ายสุดเสมอ และเทียบเป็นคำเต็ม — ชื่อจริงมีคำว่า "ปรับ" อยู่กลางชื่อได้
// (เช่น "รถเข็นแบบปรับพนักพิงเอนไปด้านหลัง") ห้ามไปตัดโดน
const NAME_TAIL_RE = new RegExp(`(?:\\s*(?:${EDITORIAL_WORDS})|\\s*/)+\\s*$`);

// ── 2. ประเภทความพิการ ─────────────────────────────────────────
const ALL_TYPES = [
  "visual", "hearing", "intellectual", "physical", "learning",
  "speech", "behavioral", "autism", "multiple",
];

const HINTS = [
  ["บกพร่องทางการเห็น", "visual"],
  ["บกพร่องทางการได้เห็น", "visual"], // คู่มือใช้ทั้ง "การเห็น" และ "การได้เห็น"
  ["ตาบอด", "visual"],
  ["เห็นเลือนราง", "visual"],
  ["บกพร่องทางการได้ยิน", "hearing"],
  ["หูหนวก", "hearing"],
  ["หูตึง", "hearing"],
  ["บกพร่องทางสติปัญญา", "intellectual"],
  ["บกพร่องทางร่างกาย", "physical"],
  ["การเคลื่อนไหว", "physical"],
  ["บกพร่องทางการเรียนรู้", "learning"],
  ["บกพร่องทางการพูดและภาษา", "speech"],
  ["บกพร่องทางการพูด", "speech"],
  ["บกพร่องทางภาษา", "speech"],
  ["บกพร่องทางพฤติกรรม", "behavioral"],
  ["บกพร่องทางอารมณ์", "behavioral"],
  ["บกพร่องด้านพฤติกรรม", "behavioral"], // คู่มือใช้ทั้ง "ทาง" และ "ด้าน"
  ["บกพร่องด้านอารมณ์", "behavioral"],
  ["พฤติกรรมหรืออารมณ์", "behavioral"],
  ["ออทิสติก", "autism"],
  ["พิการซ้อน", "multiple"],
];

// วลีที่ระบุ "ทุกประเภท" อย่างชัดเจน — ชนะเสมอ แม้มีวลีเจาะจงอยู่ด้วย
// เช่น "บกพร่องทางการเรียนรู้และบุคคลทุกประเภทความพิการ" = ทุกประเภทจริง
const ALL_TYPE_PHRASES = [
  "ทุกประเภทความพิการ",
  "พิการทุกประเภท",
  "ความพิการประเภทอื่น",
  "พิการประเภทอื่น",
];

// วลีร่ม: ใช้ต่อเมื่อไม่มีวลีเจาะจงเลย
// เพราะส่วนใหญ่เป็น "คำขยาย" ของประเภทที่ระบุไว้ก่อนหน้า ไม่ใช่วลีครอบจักรวาล
//   "บุคคลที่มีความบกพร่องทางร่างกาย ที่มีความต้องการจำเป็นพิเศษ ที่ต้องใช้โต๊ะ..." -> physical เท่านั้น
//   "บุคคลที่มีความต้องการจำเป็นพิเศษ ที่จำเป็นต้องใช้สื่อที่ต้องจัดทำขึ้นพิเศษ..."  -> ทุกประเภท
const FALLBACK_ANY_PHRASES = ["ความต้องการจำเป็นพิเศษ", "ความต้องการพิเศษ"];

/** ตัดช่องว่างและ zero-width joiner ออกทั้งหมด ก่อนเทียบ substring */
const squash = (s) => s.replace(/[\s‌]+/g, "");

function parseDisability(text) {
  if (!text) return [];
  const t = squash(text);

  if (ALL_TYPE_PHRASES.some((p) => t.includes(squash(p)))) return [...ALL_TYPES];

  const out = [];
  for (const [kw, key] of HINTS) {
    if (t.includes(squash(kw)) && !out.includes(key)) out.push(key);
  }
  if (out.length) return out;

  if (FALLBACK_ANY_PHRASES.some((p) => t.includes(squash(p)))) return [...ALL_TYPES];
  return [];
}

// ── main ───────────────────────────────────────────────────────
const items = JSON.parse(await readFile(CATALOG, "utf8"));

const priceFixed = [];
const nameTailFixed = [];
const typesFixed = [];
let stillEmpty = 0;

for (const item of items) {
  // 1. แยกราคาออกจากชื่อ
  const m = item.name.match(PRICE_RE);
  if (m) {
    const price = m[1].replace(/\s+/g, " ").replace(/\s*\/\s*$/, "").trim();
    const name = item.name.slice(0, m.index).trim();
    if (name) {
      priceFixed.push(`${item.code} | "${item.name}" -> "${name}" + price="${price}"`);
      item.name = name;
      // ราคาที่สกัดมาถูกอยู่แล้วมีน้ำหนักกว่า — ทับเฉพาะตอนที่ยังว่าง
      if (!item.price) item.price = price;
    }
  }

  // 1.5 ตัดคำกำกับการแก้ไข / "/" ที่ค้างท้ายชื่อ (เคสที่ไม่มีราคาตามมา)
  const trimmed = item.name.replace(NAME_TAIL_RE, "").trim();
  if (trimmed && trimmed !== item.name) {
    nameTailFixed.push(`${item.code} | "${item.name}" -> "${trimmed}"`);
    item.name = trimmed;
  }

  // 2. เติม/แก้ประเภทความพิการ
  const before = item.disabilityTypes ?? [];
  const after = parseDisability(item.eligibilityText);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    typesFixed.push(
      `${item.code} | [${before.join(",")}] -> [${after.join(",")}]`
    );
    item.disabilityTypes = after;
  }
  if (!item.disabilityTypes.length) stillEmpty++;
}

await writeFile(CATALOG, JSON.stringify(items, null, 2) + "\n", "utf8");

// ── รายงาน ─────────────────────────────────────────────────────
console.log(`เขียน data/mediaCatalog2568.json (${items.length} รายการ)\n`);

console.log(`── แยกราคาออกจากชื่อ: ${priceFixed.length} รายการ ──`);
priceFixed.forEach((l) => console.log("  " + l));

console.log(`\n── ตัดคำกำกับ/"/" ท้ายชื่อ: ${nameTailFixed.length} รายการ ──`);
nameTailFixed.forEach((l) => console.log("  " + l));

console.log(`\n── แก้ประเภทความพิการ: ${typesFixed.length} รายการ ──`);
typesFixed.forEach((l) => console.log("  " + l));

console.log(`\nสรุป:`);
console.log(`  มีราคา                : ${items.filter((i) => i.price).length}`);
console.log(`  แมปประเภทความพิการได้  : ${items.length - stillEmpty}`);
console.log(`  ยังว่าง                : ${stillEmpty}`);

const emptyNoText = items.filter(
  (i) => !i.disabilityTypes.length && !i.eligibilityText
).length;
if (stillEmpty) {
  console.log(
    `\n⚠️ ที่ยังว่าง ${stillEmpty} รายการ: ${emptyNoText} รายการไม่มีข้อความ "ผู้มีสิทธิ" เลย`
  );
  console.log(
    `   (parse_details() ใน parse_catalog.py จับ block ไม่ติด — แก้ได้ต่อเมื่อมี pdfs/3.txt)`
  );
}
