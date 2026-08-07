/**
 * scripts/validate_media_catalog.mjs — ตรวจ data/mediaCatalog2568.json กับของจริง
 *
 * ตรวจ 2 ชุด:
 *
 *   ชุด A — รหัสจากแผน IEP จริง (data/realPlanCodes.json)
 *     A1. รหัสมีอยู่จริงในคู่มือ
 *     A2. ประเภทความพิการที่ "ขอจริง" ต้องอยู่ใน disabilityTypes ของคู่มือ
 *         ← ข้อนี้สำคัญกว่า A1 เพราะรหัสมีอยู่จริงแต่แมปประเภทผิด
 *           = ระบบจะไม่เสนอรายการที่ครูใช้จริง (false negative เงียบ ๆ)
 *
 *   ชุด B — รหัสใน data/mappingTable.json (ชุดที่ระบบเสนอจริง)
 *     B1. รหัสมีอยู่จริงในคู่มือ
 *     B2. ประเภทความพิการที่แมปไว้ ต้องตรงกับสิทธิ์ในคู่มือ
 *     (ซ้ำกับที่ build_mapping.py ตรวจ แต่ที่นี่รันได้โดยไม่ต้องมี Python)
 *
 *   ชุด C — regression check ถาวร (เพิ่ม 7 ส.ค. 2569)
 *     C1. รหัสที่ครูยืนยันว่าขอให้เด็กบกพร่องทางสติปัญญาจริง
 *         (_teacherConfirmedIntellectual) ต้องมี "intellectual" เสมอ
 *     C2. ช่องโหว่จากการสกัด (eligibilityText = null) ต้องไม่งอกใหม่
 *         เทียบกับลิสต์ที่ pin ไว้ใน _knownExtractionGaps
 *
 * 🔑 หลักการของ ชุด A2 + C: แยก "แมปผิด" ออกจาก "สกัดไม่ติด" ให้ชัด
 *
 *    แมปผิด   = คู่มือมีข้อความ "ผู้ที่มีสิทธิ" แต่ข้อความนั้นไม่ครอบคลุมประเภทที่ครูขอจริง
 *               → เป็นบั๊กของ matching logic แก้ได้ที่โค้ด → ❌ fail ทันที
 *
 *    สกัดไม่ติด = eligibilityText = null คือไม่มีข้อความต้นทางให้เทียบเลย
 *               (parse_details() จับ block ไม่ติด) แก้ได้ที่ parse_catalog.py + ต้องมี pdfs/3.txt
 *               ตอนนี้ไม่เหลือรหัสจากแผนจริงที่ติดปัญหานี้แล้ว (ปิดครบ 7 ส.ค. 2569)
 *               → ❌ ห้ามเติม disabilityTypes เองด้วยมือ เพราะจะกลายเป็นข้อมูล
 *                 ที่ไม่มีที่มาจากเอกสารทางการ (ผิดหลัก CLAUDE.md §4)
 *               → จึงรายงานเป็น "ช่องโหว่ที่รู้ตัว" แบบดัง ๆ แต่ไม่ fail
 *                 เพราะถ้า fail ถาวรทุกครั้ง สุดท้ายคนจะเลิกอ่านผลของ validator
 *                 สิ่งที่ fail คือ "ช่องโหว่งอกเพิ่ม" = การสกัดถอยหลัง
 *
 * รัน: npm run validate:media   (exit 1 ถ้าไม่ผ่าน)
 */

import { readFile } from "node:fs/promises";

const load = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), "utf8"));

const catalog = new Map((await load("../data/mediaCatalog2568.json")).map((i) => [i.code, i]));
const real = await load("../data/realPlanCodes.json");
const mapping = await load("../data/mappingTable.json");

let failed = 0;
const fail = (m) => { failed++; console.log("  ❌ " + m); };
const warn = (m) => console.log("  ⚠️  " + m);
const pass = (m) => console.log("  ✅ " + m);
const gap = (m) => console.log("  🕳️  " + m);

/** รหัสนี้ "ไม่มีข้อความต้นทางให้เทียบ" หรือ "มีข้อความแต่แมปพลาด"? */
const isExtractionGap = (item) => !item.eligibilityText;

// ── ชุด A ──────────────────────────────────────────────────────
console.log("── ชุด A: รหัสจากแผน IEP จริง ──────────────────────────");

const entries = real.codes ?? [];
let aPass = 0;
const gapCodes = [];   // รหัสที่ตรวจไม่ได้เพราะไม่มีข้อความต้นทาง
for (const e of entries) {
  const item = catalog.get(e.code);
  if (!item) {
    fail(`${e.code} (${e.item}) — ไม่พบรหัสนี้ในคู่มือ`);
    continue;
  }
  const allowed = item.disabilityTypes ?? [];
  const want = e.disabilityTypes ?? [];

  if (!want.length) {
    warn(`${e.code} — รหัสมีจริง แต่ยังไม่ได้บันทึกประเภทความพิการที่ขอจริง (ตรวจได้แค่ครึ่งเดียว)`);
    continue;
  }
  const missing = want.filter((t) => !allowed.includes(t));
  if (missing.length) {
    // แยก 2 สาเหตุ — วิธีแก้คนละทางกันโดยสิ้นเชิง (ดูหัวไฟล์)
    if (isExtractionGap(item)) {
      gapCodes.push(e.code);
      gap(
        `${e.code} (${item.name}) — แผนจริงขอให้ [${want.join(", ")}] ` +
        `แต่คู่มือไม่มีข้อความ "ผู้ที่มีสิทธิ" ให้เทียบเลย (สกัดไม่ติด) ` +
        `→ ตรวจไม่ได้ ไม่ใช่ว่าคู่มือห้าม | ห้ามเติม disabilityTypes เองด้วยมือ`
      );
    } else {
      fail(
        `${e.code} (${item.name}) — แผนจริงขอให้ [${want.join(", ")}] ` +
        `แต่คู่มือแมปไว้แค่ [${allowed.join(", ") || "ว่าง"}] ขาด: [${missing.join(", ")}] ` +
        `(มีข้อความต้นทางแต่ matching logic จับไม่ได้ = บั๊กที่แก้ได้ที่โค้ด)`
      );
    }
    continue;
  }
  aPass++;
  pass(`${e.code} — มีจริง + ประเภท [${want.join(", ")}] ตรงกับคู่มือ`);
}

const expected = 13;
const recorded = entries.filter((e) => (e.disabilityTypes ?? []).length).length;
console.log(
  `\nชุด A: ผ่าน ${aPass}/${recorded} ที่บันทึกประเภทไว้ ` +
  `(บันทึกแล้ว ${recorded}/${expected} รหัส, ตรวจไม่ได้เพราะสกัดไม่ติด ${gapCodes.length})`
);
if (recorded < expected) {
  warn(
    `ยังบันทึกไม่ครบ — มี ${recorded}/${expected} รหัส ` +
    `เติมที่ data/realPlanCodes.json แล้วรันใหม่`
  );
}

// ── ชุด B ──────────────────────────────────────────────────────
console.log("\n── ชุด B: รหัสใน mappingTable.json ─────────────────────");

let bTotal = 0, bPass = 0;
for (const [disType, levels] of Object.entries(mapping)) {
  if (disType.startsWith("_")) continue;
  for (const [level, picks] of Object.entries(levels)) {
    for (const p of picks) {
      bTotal++;
      const item = catalog.get(p.code);
      if (!item) {
        fail(`${disType}/${level}: ไม่พบรหัส ${p.code} ในคู่มือ`);
        continue;
      }
      const allowed = item.disabilityTypes ?? [];
      if (!allowed.length) {
        warn(`${disType}/${level}: ${p.code} (${item.name}) — คู่มือไม่มีข้อมูลสิทธิ์ ตรวจไม่ได้`);
        bPass++;
        continue;
      }
      if (!allowed.includes(disType)) {
        fail(
          `${disType}/${level}: ${p.code} (${item.name}) — ` +
          `คู่มือระบุสิทธิ์เฉพาะ [${allowed.join(", ")}] ไม่รวม ${disType}`
        );
        continue;
      }
      bPass++;
    }
  }
}
console.log(`\nชุด B: ผ่าน ${bPass}/${bTotal}`);

// ── ชุด C: regression check ถาวร ───────────────────────────────
console.log("\n── ชุด C: regression check ถาวร ────────────────────────");

// C1 — รหัสที่ครูยืนยันว่าใช้กับเด็กบกพร่องทางสติปัญญาจริง ต้องมี "intellectual"
// การสกัดรอบหน้าทำให้หลุดเมื่อไหร่ = ระบบเลิกเสนอรายการที่ครูใช้จริง (เงียบ ๆ)
const confirmed = real._teacherConfirmedIntellectual?.codes ?? [];
console.log(`C1: ต้องมี "intellectual" เสมอ (${confirmed.length} รหัส)`);
for (const code of confirmed) {
  const item = catalog.get(code);
  if (!item) {
    fail(`C1 ${code} — หายไปจากคู่มือ`);
    continue;
  }
  if ((item.disabilityTypes ?? []).includes("intellectual")) {
    pass(`C1 ${code} (${item.name}) — มี intellectual`);
  } else if (isExtractionGap(item)) {
    gap(
      `C1 ${code} (${item.name}) — ยังไม่มี intellectual เพราะไม่มีข้อความ "ผู้ที่มีสิทธิ" ให้เทียบ ` +
      `(ต้องแก้ที่ parse_catalog.py + มี pdfs/3.txt) | ครูยืนยันแล้วว่าใช้จริง — ห้ามเติมเองด้วยมือ`
    );
  } else {
    fail(
      `C1 ${code} (${item.name}) — มีข้อความต้นทางแล้วแต่ยังไม่ได้ intellectual ` +
      `[${(item.disabilityTypes ?? []).join(", ") || "ว่าง"}] = matching logic ถอยหลัง`
    );
  }
}

// C2 — ช่องโหว่จากการสกัดต้องไม่งอกใหม่
// pin ไว้เท่าที่รู้ตัว ณ ตอนบันทึก ถ้ามีรหัสใหม่หลุดเข้ามา = การสกัดถอยหลัง
const pinnedGaps = new Set(real._knownExtractionGaps?.codes ?? []);
const newGaps = gapCodes.filter((c) => !pinnedGaps.has(c));
console.log(`\nC2: ช่องโหว่จากการสกัดต้องไม่งอกใหม่ (pin ไว้ ${pinnedGaps.size} รหัส)`);
if (newGaps.length) {
  fail(
    `C2 มีช่องโหว่ใหม่ ${newGaps.length} รหัส: ${newGaps.join(", ")} — ` +
    `การสกัดถอยหลัง ตรวจ parse_catalog.py / fix_media_catalog.mjs ก่อน commit`
  );
} else {
  pass(`C2 ไม่มีช่องโหว่ใหม่ (ที่รู้ตัวอยู่: ${[...pinnedGaps].join(", ") || "ไม่มี"})`);
}

// C3 — คำกำกับการแก้ไข / "/" ต้องไม่ค้างในชื่อรายการ (คู่กับ "ราคาค้างในชื่อ")
const tailNoise = [...catalog.values()].filter((i) =>
  /(?:ปรับคุณสมบัติ|ปรับราคา|ปรับรายการ|ปรับรหัส|เพิ่มเติม|รายการใหม่)\s*$|\/\s*$/.test(i.name)
);
console.log(`\nC3: คำกำกับการแก้ไข/"/" ต้องไม่ค้างท้ายชื่อรายการ`);
if (tailNoise.length) {
  fail(`C3 ยังค้างอยู่ ${tailNoise.length} รายการ: ${tailNoise.map((i) => i.code).join(", ")} — รัน npm run fix:media`);
} else {
  pass("C3 ไม่มีคำกำกับ/\"/\" ค้างท้ายชื่อ");
}

// ── สรุปคุณภาพ catalog ─────────────────────────────────────────
const all = [...catalog.values()];
console.log("\n── สรุป data/mediaCatalog2568.json ────────────────────");
console.log(`  รายการทั้งหมด          : ${all.length}`);
console.log(`  มีราคา                : ${all.filter((i) => i.price).length}`);
console.log(`  แมปประเภทความพิการได้  : ${all.filter((i) => i.disabilityTypes?.length).length}`);
const noTypes = all.filter((i) => !i.disabilityTypes?.length);
const underMatched = noTypes.filter((i) => i.eligibilityText);
console.log(`  ยังว่าง                : ${noTypes.length}`);
console.log(`    - ไม่มีข้อความต้นทาง (สกัดไม่ติด) : ${noTypes.length - underMatched.length}`);
console.log(`    - มีข้อความแต่แมปไม่ได้ (บั๊ก)    : ${underMatched.length}`);
if (underMatched.length) {
  fail(
    `มีข้อความ "ผู้ที่มีสิทธิ" แต่แมปประเภทไม่ได้ ${underMatched.length} รายการ: ` +
    `${underMatched.map((i) => i.code).join(", ")} — เพิ่มคีย์เวิร์ดใน DISABILITY_HINTS ` +
    `(แก้ทั้ง parse_catalog.py และ fix_media_catalog.mjs)`
  );
} else {
  pass("ทุกรายการที่มีข้อความ \"ผู้ที่มีสิทธิ\" แมปประเภทได้ครบ (matching logic ไม่ under-match)");
}
const leaked = all.filter((i) => /บาท/.test(i.name));
if (leaked.length) {
  fail(`ยังมีราคาค้างในชื่อรายการ ${leaked.length} รายการ: ${leaked.map((i) => i.code).join(", ")}`);
} else {
  pass("ไม่มีราคาค้างในชื่อรายการ");
}

console.log(failed ? `\n❌ ไม่ผ่าน ${failed} ข้อ` : "\n✅ ผ่านทั้งหมด");
process.exit(failed ? 1 : 0);
