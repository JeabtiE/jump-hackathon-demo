/**
 * scripts/test-warnings.mjs — unit test ของ consistency warnings (rule-based)
 *
 * รันได้เลยไม่ต้องเปิด server / ไม่ต้องมี DB: npm run test:warnings
 * (Node ≥ 23.6 strip type ของ lib/serializers.ts ให้เอง)
 *
 * ครอบคลุมทั้งเคสที่กฎต้อง fire และเคสที่ห้าม fire (กัน false positive)
 * ส่วนการทดสอบผ่าน HTTP จริงอยู่ใน test-api.mjs ขั้นที่ 7
 */

import {
  buildConsistencyWarnings,
  findMismatchedYears,
  hasMeasurableNumber,
  findChildNamePrefix,
} from "../lib/serializers.ts";

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     คาด: ${JSON.stringify(expected)}`);
    console.error(`     ได้:  ${JSON.stringify(actual)}`);
  }
}

/** goal/media/plan พื้นฐานที่ "ถูกต้องครบ" — ต้องไม่มี warning เลย */
function makeGoal(overrides = {}) {
  return {
    id: "g1",
    aiOriginal: "นักเรียนสามารถหยิบบัตรพยัญชนะไทยได้ถูกต้องอย่างน้อย 3 ใน 5 ครั้ง",
    finalText: "นักเรียนสามารถหยิบบัตรพยัญชนะไทยได้ถูกต้องอย่างน้อย 3 ใน 5 ครั้ง",
    criterion: "3 ใน 5 ครั้ง",
    timeframe: "ภายในวันที่ 31 มีนาคม 2570",
    isSelected: true,
    ...overrides,
  };
}

function makeMedia(overrides = {}) {
  return {
    id: "m1",
    item: "บัตรภาพสัญลักษณ์ PECS",
    category: "ข",
    aiReason: "ช่วยการสื่อสารทางเลือก",
    finalReason: "ช่วยการสื่อสารทางเลือก",
    isApproved: true,
    ...overrides,
  };
}

function makePlan(overrides = {}) {
  return {
    academicYear: "2569",
    goals: [makeGoal()],
    media: [makeMedia()],
    ...overrides,
  };
}

const warningsOf = (plan) => buildConsistencyWarnings(plan);
const hasWarn = (plan, substr) => warningsOf(plan).some((w) => w.includes(substr));

// ═════════ baseline: แผนถูกต้องครบ ═════════

console.log("\n── baseline ──");
check("แผนถูกต้องครบ → ไม่มี warning เลย", warningsOf(makePlan()), []);

// ═════════ กฎ 1: ปี พ.ศ. ไม่ตรงปีการศึกษา ═════════

console.log("\n── กฎ 1: ปี พ.ศ. ไม่ตรงปีการศึกษา ──");

check(
  "findMismatchedYears: ปี 2568 ในแผนปี 2569 → เจอ",
  findMismatchedYears("ภายในวันที่ 31 มีนาคม 2568", "2569"),
  ["2568"]
);
check(
  "findMismatchedYears: ปี 2569 และ 2570 (ปีแผน+ปีถัดไป) → ไม่เจอ",
  findMismatchedYears("ปีการศึกษา 2569 สิ้นสุด 31 มีนาคม 2570", "2569"),
  []
);
check(
  "findMismatchedYears: ปีหลักสูตร 2551 อยู่ใน whitelist → ไม่เจอ",
  findMismatchedYears("ตามหลักสูตรแกนกลาง พ.ศ. 2551", "2569"),
  []
);
check(
  "findMismatchedYears: เลขไทย ๒๕๖๘ → เจอ (แปลงเป็นอารบิก)",
  findMismatchedYears("ภายในวันที่ ๓๑ มีนาคม ๒๕๖๘", "2569"),
  ["2568"]
);
check(
  "findMismatchedYears: เลขที่ไม่ใช่ปี (12550, 255) → ไม่เจอ",
  findMismatchedYears("รหัส 12550 จำนวน 255 ชิ้น", "2569"),
  []
);
check(
  "แผน: ปีผิดใน finalText → fire",
  hasWarn(
    makePlan({ goals: [makeGoal({ finalText: "ทำได้ 3 ใน 5 ครั้ง ภายในวันที่ 31 มีนาคม 2555" })] }),
    "พ.ศ. 2555"
  ),
  true
);
check(
  "แผน: ปีผิดใน timeframe → fire",
  hasWarn(makePlan({ goals: [makeGoal({ timeframe: "ภายในปีการศึกษา 2555" })] }), "ไม่ตรงกับปีการศึกษา"),
  true
);
check(
  "แผน: ปี 2560 ใน timeframe เป็นปีหลักสูตร (whitelist) → ไม่ fire",
  hasWarn(makePlan({ goals: [makeGoal({ timeframe: "ตามหลักสูตร พ.ศ. 2560" })] }), "ไม่ตรงกับปีการศึกษา"),
  false
);
check(
  "แผน: academicYear ไม่ใช่ตัวเลข → ข้ามกฎ ไม่ crash",
  warningsOf(makePlan({ academicYear: "ไม่ระบุ" })),
  []
);

// ═════════ กฎ 2: อนุมัติสื่อแล้วแต่เหตุผลว่าง ═════════

console.log("\n── กฎ 2: อนุมัติสื่อแล้วแต่เหตุผลว่าง ──");

check(
  "media approve แล้ว + finalReason ว่าง → fire",
  hasWarn(makePlan({ media: [makeMedia({ finalReason: "  " })] }), "ยังไม่มีเหตุผลและความจำเป็น"),
  true
);
check(
  "media ยังไม่ approve + finalReason ว่าง → ไม่ fire (ยังไม่ถึงขั้นเบิก)",
  hasWarn(
    makePlan({ media: [makeMedia({ isApproved: false, finalReason: "" }), makeMedia({ id: "m2" })] }),
    "ยังไม่มีเหตุผลและความจำเป็น"
  ),
  false
);

// ═════════ กฎ 3: ชื่อเด็กในข้อความเป้าหมาย ═════════

console.log("\n── กฎ 3: ชื่อเด็กในข้อความเป้าหมาย ──");

check(
  'findChildNamePrefix: "เด็กชายสมชาย" → เจอ',
  findChildNamePrefix("เด็กชายสมชาย ทำได้ดี"),
  "เด็กชายสมชาย"
);
check('findChildNamePrefix: "ด.ญ.สมหญิง" → เจอ', findChildNamePrefix("ด.ญ.สมหญิง"), "ด.ญ.สมหญิง");
check(
  'findChildNamePrefix: คำว่า "นักเรียน" ปกติ → ไม่เจอ',
  findChildNamePrefix("นักเรียนสามารถอ่านคำได้"),
  null
);
check(
  "แผน: มีชื่อเด็กใน finalText → fire",
  hasWarn(
    makePlan({
      goals: [makeGoal({ finalText: "เด็กชายทดสอบ ระบบ ทำได้ 3 ใน 5 ครั้ง" })],
    }),
    'ควรใช้คำว่า "นักเรียน" แทน'
  ),
  true
);

// ═════════ กฎ 4: เลือกเป้าหมายแล้วแต่ยังไม่อนุมัติสื่อเลย ═════════

console.log("\n── กฎ 4: เลือกเป้าหมายแล้วแต่สื่อถูกเอาออกจากการเบิกหมด ──");

check(
  "goal เลือกแล้ว + สื่อถูกเอาออกหมดทุกรายการ → fire เป็นคำถามยืนยัน",
  hasWarn(makePlan({ media: [makeMedia({ isApproved: false })] }), "ไม่ต้องเบิกสื่อเลยใช่ไหม"),
  true
);
check(
  "goal เลือกแล้ว + ยังเหลือสื่อเบิกอย่างน้อย 1 รายการ → ไม่ fire",
  hasWarn(
    makePlan({ media: [makeMedia(), makeMedia({ id: "m2", isApproved: false })] }),
    "ไม่ต้องเบิกสื่อเลยใช่ไหม"
  ),
  false
);
check(
  "media ว่างเปล่า → ใช้ warning เดิม (ไม่มีรายการสื่อ) ไม่ใช่กฎนี้",
  hasWarn(makePlan({ media: [] }), "ยังไม่มีรายการสื่อที่แนะนำ") &&
    !hasWarn(makePlan({ media: [] }), "ไม่ต้องเบิกสื่อเลยใช่ไหม"),
  true
);
check(
  "ยังไม่ได้เลือก goal เลย → กฎนี้ไม่ fire (warning เดิมครอบคลุมแล้ว)",
  hasWarn(
    makePlan({
      goals: [makeGoal({ isSelected: false })],
      media: [makeMedia({ isApproved: false })],
    }),
    "ไม่ต้องเบิกสื่อเลยใช่ไหม"
  ),
  false
);

// ═════════ กฎ 5: เกณฑ์วัดผลไม่มีตัวเลข (โทนคำถาม) ═════════

console.log("\n── กฎ 5: เกณฑ์วัดผลไม่มีตัวเลข ──");

check("hasMeasurableNumber: '3 ใน 5 ครั้ง' → true", hasMeasurableNumber("3 ใน 5 ครั้ง"), true);
check("hasMeasurableNumber: เลขไทย '๕ ครั้ง' → true", hasMeasurableNumber("๕ ครั้ง"), true);
check("hasMeasurableNumber: 'ร้อยละห้าสิบ' → true (whitelist)", hasMeasurableNumber("ร้อยละห้าสิบ"), true);
check("hasMeasurableNumber: 'ทำได้ทุกครั้ง' → true (whitelist)", hasMeasurableNumber("ทำได้ทุกครั้ง"), true);
check("hasMeasurableNumber: 'ทำได้ดีขึ้น' → false", hasMeasurableNumber("ทำได้ดีขึ้น"), false);

const vagueGoal = makeGoal({
  finalText: "นักเรียนมีพัฒนาการด้านการอ่านดีขึ้น",
  criterion: "สังเกตพฤติกรรม",
});
check(
  "criterion + finalText ไม่มีตัวเลขเลย → fire เป็นคำถาม",
  hasWarn(makePlan({ goals: [vagueGoal] }), "วัดผลปลายปีได้ชัดเจนหรือยัง?"),
  true
);
check(
  "เคสจริงจาก fewShotExamples (intellectual): 'ลดความช่วยเหลือ...ด้วยตนเอง' → ไม่ fire",
  hasWarn(
    makePlan({
      goals: [
        makeGoal({
          finalText: "นักเรียนสามารถรับประทานอาหารเองได้ด้วยตนเองโดยลดความช่วยเหลือจากครูน้อยลง",
          criterion: "สังเกตพฤติกรรม",
        }),
      ],
    }),
    "วัดผลปลายปี"
  ),
  false
);
check(
  "criterion เป็น null → กฎนี้ไม่ fire ซ้ำ (warning เดิม 'ยังไม่มีเกณฑ์วัดผล' ครอบคลุม)",
  (() => {
    const w = warningsOf(
      makePlan({ goals: [makeGoal({ criterion: null, finalText: "นักเรียนอ่านได้ดีขึ้น" })] })
    );
    return w.some((x) => x.includes("ยังไม่มีเกณฑ์วัดผล")) && !w.some((x) => x.includes("วัดผลปลายปี"));
  })(),
  true
);

// ═════════ ลำดับความร้ายแรง ═════════

console.log("\n── ลำดับ warning: ร้ายแรงสุดขึ้นก่อน ──");

// ปีผิดอยู่ใน timeframe (กฎเกณฑ์ตัวเลขสแกนแค่ criterion+finalText จึง fire พร้อมกันได้)
const messyPlan = makePlan({
  goals: [
    makeGoal({
      finalText: "เด็กชายทดสอบ ระบบ ทำกิจกรรมได้ดีขึ้น",
      criterion: "สังเกตพฤติกรรม",
      timeframe: "ภายในวันที่ 31 มีนาคม 2555",
    }),
  ],
  media: [makeMedia({ finalReason: "" })],
});
const order = warningsOf(messyPlan).map((w) =>
  w.includes("ไม่ตรงกับปีการศึกษา")
    ? "ปีผิด"
    : w.includes("เหตุผลและความจำเป็น")
      ? "เหตุผลว่าง"
      : w.includes("คำนำหน้าชื่อเด็ก")
        ? "ชื่อเด็ก"
        : w.includes("วัดผลปลายปี")
          ? "เกณฑ์ไม่มีเลข"
          : "อื่นๆ"
);
check("เรียง: ปีผิด > เหตุผลว่าง > ชื่อเด็ก > เกณฑ์ไม่มีเลข", order, [
  "ปีผิด",
  "เหตุผลว่าง",
  "ชื่อเด็ก",
  "เกณฑ์ไม่มีเลข",
]);

// ═════════ สรุป ═════════

console.log(`\n${"═".repeat(50)}`);
if (failed > 0) {
  console.error(`❌ ผ่าน ${passed} / ตก ${failed}`);
  process.exit(1);
}
console.log(`🎉 ผ่านทั้งหมด ${passed} เคส`);
