/**
 * ทดสอบ lib/pii-guard.ts — รันตรงด้วย node (Node >= 23.6 strip type ได้ในตัว)
 *
 *   npm run test:pii
 */
import {
  PII_FIELDS,
  buildLLMSafePayload,
  assertNoPII,
  scrubFreeText,
  personalizeForExport,
} from "../lib/pii-guard.ts";

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✅ ผ่าน  — ${name}`);
  } catch (err) {
    failed++;
    console.log(`❌ ไม่ผ่าน — ${name}`);
    console.log(`   ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ── เคส 1: spread student ทั้งก้อนจาก DB → assertNoPII ต้อง throw ──
const fakeStudentFromDB = {
  id: "stu_001",
  code: "S001",
  fullName: "เด็กชายสมมติ ทดสอบ",
  nationalId: "1579901234567",
  birthDate: "2015-01-01",
  guardianName: "นางสมมติ ทดสอบ",
  phone: "0812345678",
  address: "1 หมู่ 1 ต.ทดสอบ",
  disabilityType: "autism",
  gradeLevel: "ป.1",
};

check("เคส 1: spread student object ทั้งก้อน → assertNoPII ต้อง throw", () => {
  let threw = false;
  try {
    assertNoPII({ ...fakeStudentFromDB });
  } catch (err) {
    threw = true;
    assert(
      err.message.includes("PII GUARD"),
      `throw จริงแต่ไม่ใช่ error ของ PII GUARD: ${err.message}`
    );
  }
  assert(threw, "assertNoPII ไม่ throw ทั้งที่ payload มี PII เต็มก้อน");
});

// ── เคส 2: payload จาก buildLLMSafePayload → ไม่ throw + ไม่มี key ที่เป็น PII ──
check("เคส 2: buildLLMSafePayload → ไม่ throw และไม่มี PII field", () => {
  const payload = buildLLMSafePayload({
    disabilityType: fakeStudentFromDB.disabilityType,
    gradeLevel: fakeStudentFromDB.gradeLevel,
    abilityLevels: { reading: "low", writing: "medium" },
    strengths: "ชอบวาดภาพ",
  });

  assertNoPII(payload); // ถ้า throw ตรงนี้ = ไม่ผ่าน

  const leaked = Object.keys(payload).filter((k) => PII_FIELDS.includes(k));
  assert(
    leaked.length === 0,
    `พบ key ที่อยู่ใน PII_FIELDS หลุดมาใน payload: ${leaked.join(", ")}`
  );
});

// ── เคส 3: scrubFreeText ต้องล้างชื่อ เบอร์โทร เลขบัตร ครบ ──
check("เคส 3: scrubFreeText ล้างชื่อ/เบอร์โทร/เลขบัตรครบ", () => {
  const dirty =
    "เด็กชายสมชาย ใจดี ชอบวาดภาพ โทร 081-234-5678 เลข 1-5799-01234-56-7";
  const clean = scrubFreeText(dirty);
  console.log(`   ก่อน: ${dirty}`);
  console.log(`   หลัง: ${clean}`);

  assert(!clean.includes("สมชาย"), "ชื่อ 'สมชาย' ยังหลงเหลืออยู่");
  assert(!clean.includes("ใจดี"), "นามสกุล 'ใจดี' ยังหลงเหลืออยู่");
  assert(!clean.includes("เด็กชาย"), "คำนำหน้า 'เด็กชาย' ยังหลงเหลืออยู่");
  assert(!/081[\s-]?234[\s-]?5678/.test(clean), "เบอร์โทรยังหลงเหลืออยู่");
  assert(
    !/1[\s-]?5799[\s-]?01234[\s-]?56[\s-]?7/.test(clean),
    "เลขบัตรประชาชนยังหลงเหลืออยู่"
  );
  assert(clean.includes("ชอบวาดภาพ"), "ข้อความปกติ 'ชอบวาดภาพ' หายไป (ล้างเกิน)");
});

// ── เคส 4: personalizeForExport แทน "นักเรียน" ด้วยชื่อจริง ──
check('เคส 4: personalizeForExport แทนที่ "นักเรียน" ด้วยชื่อจริง', () => {
  const result = personalizeForExport(
    "นักเรียนสามารถอ่านคำพื้นฐานได้ และนักเรียนเขียนตามแบบได้",
    "ด.ช.ทดสอบ ระบบ"
  );
  console.log(`   ผลลัพธ์: ${result}`);

  assert(!result.includes("นักเรียน"), 'ยังมีคำว่า "นักเรียน" ที่ไม่ถูกแทนที่');
  assert(
    result.startsWith("ด.ช.ทดสอบ ระบบสามารถ"),
    `แทนที่ผิดตำแหน่ง: ${result}`
  );
  assert(
    (result.match(/ด\.ช\.ทดสอบ ระบบ/g) ?? []).length === 2,
    "ต้องแทนที่ทุกตำแหน่ง (2 จุด) ไม่ใช่แค่จุดแรก"
  );
});

// ── สรุปผล ──
console.log(`\nสรุป: ผ่าน ${passed}/${passed + failed} เคส`);
if (failed > 0) {
  process.exitCode = 1;
}
