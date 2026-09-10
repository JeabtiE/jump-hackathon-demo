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

// ── เคส 5: PII ที่ครูเผลอพิมพ์ในช่องบรรยายต่อ domain ต้องถูกล้างก่อนถึง LLM ──
// ⚠️ เคสนี้คือกำแพงของเฟส 4: abilityFreeText เป็น free text ช่องเดียวที่ไหลเข้า
//    generation ได้ ถ้ามันหลุด = ชื่อเด็กออกนอกระบบ ห้ามลบเทสนี้
check("เคส 5: PII ใน abilityFreeText ถูก scrub ครบทุก domain", () => {
  const payload = buildLLMSafePayload({
    disabilityType: "autism",
    gradeLevel: "ป.1",
    abilityLevels: { reading: "cannot_spell_2syllable", behavior: "short_attention" },
    abilityFreeText: {
      reading: "เด็กชายสมชาย ใจดี อ่านคำ 2 พยางค์ไม่ได้ ต้องชี้ทีละตัว",
      behavior: "นั่งได้ไม่เกิน 5 นาที แม่ชื่อนางสมศรี ใจดี โทร 081-234-5678 เลข 1-5799-01234-56-7",
    },
  });

  assertNoPII(payload, "payload ที่มี abilityFreeText"); // ถ้า throw ตรงนี้ = ไม่ผ่าน

  const texts = payload.abilityFreeText ?? {};
  const joined = JSON.stringify(texts);
  console.log(`   หลัง scrub: ${texts.behavior}`);

  assert(!joined.includes("สมชาย"), "ชื่อเด็กยังหลงเหลือใน abilityFreeText");
  assert(!joined.includes("สมศรี"), "ชื่อผู้ปกครองยังหลงเหลือใน abilityFreeText");
  assert(!joined.includes("เด็กชาย"), "คำนำหน้าเด็กยังหลงเหลือใน abilityFreeText");
  assert(!joined.includes("081-234-5678"), "เบอร์โทรยังหลงเหลือใน abilityFreeText");
  assert(
    !joined.includes("1-5799-01234-56-7"),
    "เลขบัตรประชาชนยังหลงเหลือใน abilityFreeText"
  );

  // ล้างเกินก็ไม่ได้ — เนื้อหาที่ครูตั้งใจบอกต้องรอดไปถึง LLM ไม่งั้นเป้าหมายจะกว้างเหมือนเดิม
  assert(
    texts.reading?.includes("อ่านคำ 2 พยางค์ไม่ได้"),
    `เนื้อหาจริงของ reading หายไป (ล้างเกิน): ${texts.reading}`
  );
  assert(
    texts.behavior?.includes("ไม่เกิน 5 นาที"),
    `เนื้อหาจริงของ behavior หายไป (ล้างเกิน): ${texts.behavior}`
  );

  // key ต้องเป็น domain เดิมครบ — ไม่งั้น prompt จับคู่คำบรรยายกับ domain ผิด
  assert(
    JSON.stringify(Object.keys(texts)) === JSON.stringify(["reading", "behavior"]),
    `key ของ abilityFreeText เพี้ยน: ${Object.keys(texts).join(", ")}`
  );
});

// ── เคส 6: ค่าที่ไม่มีเนื้อหาต้องไม่ถูกส่งต่อ (กัน prompt มีหัวข้อว่างเปล่า) ──
check("เคส 6: abilityFreeText ที่ว่าง/ไม่ใช่ string ถูกตัดทิ้ง", () => {
  const base = {
    disabilityType: "autism",
    abilityLevels: { reading: "cannot_spell_2syllable" },
  };

  const withBlanks = buildLLMSafePayload({
    ...base,
    abilityFreeText: { reading: "อ่านคำ 2 พยางค์ไม่ได้", writing: "   ", math: "" },
  });
  assert(
    JSON.stringify(Object.keys(withBlanks.abilityFreeText ?? {})) ===
      JSON.stringify(["reading"]),
    `domain ที่ครูไม่ได้พิมพ์ยังหลุดมา: ${Object.keys(withBlanks.abilityFreeText ?? {}).join(", ")}`
  );

  // ไม่ส่งมาเลย / ส่งมาแต่ว่างทั้งก้อน → undefined ไม่ใช่ {} (prompt จะได้ไม่ขึ้นหัวข้อเปล่า)
  assert(
    buildLLMSafePayload(base).abilityFreeText === undefined,
    "ไม่ส่ง abilityFreeText มาเลย แต่ payload ไม่ได้เป็น undefined"
  );
  assert(
    buildLLMSafePayload({ ...base, abilityFreeText: { reading: "  " } })
      .abilityFreeText === undefined,
    "ส่งมาแต่ว่างทั้งก้อน แต่ payload ไม่ได้เป็น undefined"
  );
});

// ── สรุปผล ──
console.log(`\nสรุป: ผ่าน ${passed}/${passed + failed} เคส`);
if (failed > 0) {
  process.exitCode = 1;
}
