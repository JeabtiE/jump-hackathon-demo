/**
 * scripts/test-curriculum.mjs — unit test ของ curriculum retrieval (rule-based)
 *
 * รันได้เลยไม่ต้องเปิด server / ไม่ต้องมี DB: npm run test:curriculum
 * (Node ≥ 23.6 strip type ของ lib/curriculum-retrieval.ts ให้เอง)
 *
 * เน้น 2 เรื่องที่พังแล้วเอกสารเสียหายจริง:
 * 1. รหัสที่ LLM คิดเองต้องไม่หลุดเข้าระบบ (CLAUDE.md §4)
 * 2. ระดับชั้นจาก StudentPicker ("ป1") ต้องแมปเข้ากับ curriculum.json ("ป.1") ได้
 */

import {
  normalizeGradeLevel,
  subjectsFromAbilityLevels,
  retrieveIndicators,
  resolveIndicatorCodes,
  isKnownIndicatorCode,
  lookupIndicators,
  getAvailableSubjects,
} from "../lib/curriculum-retrieval.ts";

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

console.log("\n── normalizeGradeLevel: รับได้ทุกรูปแบบที่มีในระบบ ──");
check('"ป1" (ค่าจริงจาก StudentPicker)', normalizeGradeLevel("ป1"), "ป.1");
check('"ป.6"', normalizeGradeLevel("ป.6"), "ป.6");
check('"ป. 3" (มีช่องว่าง)', normalizeGradeLevel("ป. 3"), "ป.3");
check('"ประถมศึกษาปีที่ 2"', normalizeGradeLevel("ประถมศึกษาปีที่ 2"), "ป.2");
check('เลขไทย "ป.๔"', normalizeGradeLevel("ป.๔"), "ป.4");
check("นอกขอบเขต ม.1 → null", normalizeGradeLevel("ม.1"), null);
check("ป.7 ไม่มีจริง → null", normalizeGradeLevel("ป.7"), null);
check("ว่าง → null", normalizeGradeLevel(""), null);
check("null → null", normalizeGradeLevel(null), null);

console.log("\n── subjectsFromAbilityLevels: เดากลุ่มสาระจากด้านที่ครูเลือก ──");
check("reading → thai", subjectsFromAbilityLevels({ reading: "cannot_spell_2syllable" }), [
  "thai",
]);
check(
  "reading + writing → thai ไม่ซ้ำ",
  subjectsFromAbilityLevels({ reading: "x", writing: "y" }),
  ["thai"]
);
check(
  "ด้านทักษะล้วน (ออทิสติก) → ไม่มีวิชา",
  subjectsFromAbilityLevels({ communication: "no_speech_gesture_only", behavior: "x" }),
  []
);
check("ค่าว่างไม่นับ", subjectsFromAbilityLevels({ reading: "" }), []);
check(
  "math ยังปิดอยู่ (ข้อความ curriculum.json เสีย) → ไม่คืน math",
  subjectsFromAbilityLevels({ math: "cannot_calculate_carry" }),
  []
);
check("getAvailableSubjects = เฉพาะวิชาที่เปิดจริง", getAvailableSubjects(), ["thai"]);

console.log("\n── retrieveIndicators ──");
const p1 = retrieveIndicators({ subjects: ["thai"], gradeLevel: "ป.1" });
check("ป.1 ไม่มีชั้นต่ำกว่า → 23 ตัวชี้วัด", p1.length, 23);
check("ทุกตัวเป็นชั้น ป.1", [...new Set(p1.map((i) => i.grade))], ["ป.1"]);
check("รหัสตัวแรกถูกต้อง", p1[0].code, "ท 1.1 ป.1/1");

const p4 = retrieveIndicators({ subjects: ["thai"], gradeLevel: "ป.4" });
check(
  "ป.4 รวมชั้นต่ำกว่า cap 3 ชั้น → ป.2, ป.3, ป.4 (ไม่มี ป.1)",
  [...new Set(p4.map((i) => i.grade))],
  ["ป.2", "ป.3", "ป.4"]
);
check("ป.4 = 26+33+34", p4.length, 93);

const p4only = retrieveIndicators({
  subjects: ["thai"],
  gradeLevel: "ป.4",
  includeLowerGrades: false,
});
check("ปิด includeLowerGrades → เฉพาะ ป.4", [...new Set(p4only.map((i) => i.grade))], ["ป.4"]);

check("รหัสไม่ซ้ำ", p4.length, new Set(p4.map((i) => i.code)).size);
check(
  'รับ "ป1" ได้ตรงๆ (ค่าจาก StudentPicker)',
  retrieveIndicators({ subjects: ["thai"], gradeLevel: "ป1" }).length,
  23
);
check(
  "ไม่ระบุวิชา → ไม่มีตัวชี้วัด (ระบบทำงานเหมือนเดิม)",
  retrieveIndicators({ subjects: [], gradeLevel: "ป.1" }).length,
  0
);
check(
  "ชั้นนอกขอบเขต → ไม่ throw คืน []",
  retrieveIndicators({ subjects: ["thai"], gradeLevel: "ม.2" }).length,
  0
);
check(
  "math ปิดอยู่ → ขอมาก็ไม่ให้",
  retrieveIndicators({ subjects: ["math"], gradeLevel: "ป.1" }).length,
  0
);
check(
  "กรองด้วย standards",
  [
    ...new Set(
      retrieveIndicators({
        subjects: ["thai"],
        gradeLevel: "ป.1",
        standards: ["ท 1.1"],
      }).map((i) => i.standard)
    ),
  ],
  ["ท 1.1"]
);

console.log("\n── resolveIndicatorCodes: 🔒 gate กันรหัสที่ LLM คิดเอง ──");
const eligible = retrieveIndicators({ subjects: ["thai"], gradeLevel: "ป.1" });
check(
  "รหัสที่อยู่ในรายการ → ผ่าน",
  resolveIndicatorCodes(["ท 1.1 ป.1/1"], eligible).map((i) => i.code),
  ["ท 1.1 ป.1/1"]
);
check(
  "รหัสที่ไม่มีในโลก → ทิ้ง",
  resolveIndicatorCodes(["ท 9.9 ป.1/99"], eligible).map((i) => i.code),
  []
);
check(
  "รหัสมีจริงแต่ไม่ได้ส่งไปให้ (ป.5) → ทิ้ง",
  resolveIndicatorCodes(["ท 1.1 ป.5/1"], eligible).map((i) => i.code),
  []
);
check(
  "เว้นวรรคไม่ตรง → ยังจับคู่ได้",
  resolveIndicatorCodes(["ท1.1ป.1/2"], eligible).map((i) => i.code),
  ["ท 1.1 ป.1/2"]
);
check(
  "รหัสซ้ำ → เหลือตัวเดียว",
  resolveIndicatorCodes(["ท 1.1 ป.1/1", "ท 1.1 ป.1/1"], eligible).map((i) => i.code),
  ["ท 1.1 ป.1/1"]
);
check(
  "ปนของจริงกับของปลอม → เหลือเฉพาะของจริง",
  resolveIndicatorCodes(["ท 1.1 ป.1/1", "ท 0.0 ป.1/1"], eligible).map((i) => i.code),
  ["ท 1.1 ป.1/1"]
);
check("undefined → []", resolveIndicatorCodes(undefined, eligible), []);
check("[] → []", resolveIndicatorCodes([], eligible), []);
check("ค่าที่ไม่ใช่ string → ไม่ throw", resolveIndicatorCodes([null, 5], eligible), []);

console.log("\n── isKnownIndicatorCode / lookupIndicators ──");
check("รหัสข้ามชั้นครูเลือกเองได้", isKnownIndicatorCode("ท 2.1 ป.6/1"), true);
check("รหัสมั่ว → false", isKnownIndicatorCode("ท 9.9 ป.1/1"), false);
check("รหัสคณิต (ยังปิดอยู่) → false", isKnownIndicatorCode("ค 1.1 ป.1/1"), false);
check(
  "lookupIndicators คืนข้อความเต็ม",
  lookupIndicators(["ท 1.1 ป.1/1"])[0].text,
  "อ่านออกเสียงคำ คำคล้องจอง และข้อความสั้นๆ"
);
check("lookupIndicators ข้ามรหัสที่หาไม่เจอ", lookupIndicators(["ไม่มีจริง"]).length, 0);
check(
  "lookupIndicators ตัดรหัสซ้ำ",
  lookupIndicators(["ท 1.1 ป.1/1", "ท 1.1 ป.1/1"]).length,
  1
);

console.log("\n── ข้อมูลต้นทาง: ข้อความภาษาไทยต้องไม่เพี้ยน ──");
const allThai = retrieveIndicators({
  subjects: ["thai"],
  gradeLevel: "ป.6",
  includeLowerGrades: true,
});
check("ข้อความไม่ว่าง", allThai.every((i) => i.text.trim().length > 0), true);
check(
  "รูปแบบรหัสถูกต้องทุกตัว",
  allThai.every((i) => /^ท \d\.\d ป\.[1-6]\/\d+$/.test(i.code)),
  true
);

console.log(`\n${failed === 0 ? "✅" : "❌"} ผ่าน ${passed} / ล้มเหลว ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
