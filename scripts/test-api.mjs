/**
 * scripts/test-api.mjs — ทดสอบ pipeline ทั้งเส้นผ่าน HTTP (mock mode)
 *
 * ต้องเปิด `npm run dev` ค้างไว้ก่อนรัน: npm run test:api
 * ขั้นไหน fail จะหยุดทันทีพร้อมรายละเอียด response
 *
 * ⚠️ ข้อมูลนักเรียนที่สร้างเป็นข้อมูลปลอมทั้งหมด (code TEST-01)
 *    ท้าย script จะพิมพ์ studentId ไว้สำหรับลบทีหลัง
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let stepNo = 0;
function step(title) {
  stepNo++;
  console.log(`\n${"─".repeat(60)}`);
  console.log(`ขั้นที่ ${stepNo}: ${title}`);
  console.log("─".repeat(60));
}

function fail(msg, detail) {
  console.error(`\n❌ FAIL: ${msg}`);
  if (detail !== undefined) {
    console.error("รายละเอียด:", typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
  }
  process.exit(1);
}

/** fetch + ตรวจ status ถ้าไม่ตรงที่คาดให้หยุดพร้อม body */
async function call(method, urlPath, { body, expect = 200 } = {}) {
  const url = `${BASE}${urlPath}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    fail(`ต่อ ${url} ไม่ได้ — npm run dev เปิดอยู่หรือเปล่า?`, e.message);
  }
  const expected = Array.isArray(expect) ? expect : [expect];
  if (!expected.includes(res.status)) {
    let detail;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text().catch(() => "(อ่าน body ไม่ได้)");
    }
    fail(`${method} ${urlPath} ตอบ ${res.status} (คาด ${expected.join("/")})`, detail);
  }
  return res;
}

// ═════════════ ขั้นที่ 1: สร้างนักเรียนทดสอบ ═════════════

step("POST /api/students — สร้างนักเรียนทดสอบ TEST-01 (autism)");

// รันซ้ำได้: ถ้า TEST-01 ค้างจากรอบก่อน ลบทิ้งก่อนสร้างใหม่
{
  const listRes = await call("GET", "/api/students");
  const existing = (await listRes.json()).find((s) => s.code === "TEST-01");
  if (existing) {
    console.log(`พบ TEST-01 ค้างจากรอบก่อน (id=${existing.id}) → ลบก่อนสร้างใหม่`);
    await call("DELETE", `/api/students/${existing.id}`, { expect: [200, 204] });
  }
}

const fakePII = {
  code: "TEST-01",
  disabilityType: "autism",
  gradeLevel: "ป.1",
  // ── PII ปลอมครบทุก field — ทดสอบว่าเก็บได้และไม่รั่วไป LLM ──
  fullName: "เด็กชายทดสอบ ระบบ",
  nationalId: "1234567890123",
  disabilityCardNo: "TEST-CARD-001",
  birthDate: "5 ต.ค. 2561",
  religion: "พุทธ",
  disabilityDetail: "ออทิสติก (ข้อมูลทดสอบ)",
  fatherName: "นายทดสอบ ระบบ",
  motherName: "นางทดสอบ ระบบ",
  guardianName: "นางทดสอบ ระบบ",
  guardianRelation: "มารดา",
  address: "99/9 หมู่ 9 ต.ทดสอบ อ.เมือง จ.เชียงราย 57000",
  phone: "0812345678",
  schoolName: "โรงเรียนทดสอบระบบ",
  affiliation: "สพป.ทดสอบ เขต 1",
  medicalNote: "ไม่มีโรคประจำตัว (ข้อมูลทดสอบ)",
  educationHistory: "อนุบาล 3 โรงเรียนทดสอบระบบ (ข้อมูลทดสอบ)",
};

const studentRes = await call("POST", "/api/students", { body: fakePII, expect: 201 });
const student = await studentRes.json();
console.log(`✅ สร้างสำเร็จ: id=${student.id} code=${student.code} fullName=${student.fullName}`);

// ═════════════ ขั้นที่ 2: สร้างแผน ═════════════

step("POST /api/plans — สร้างแผน (mock LLM) + ทดสอบ scrubFreeText");

// key ตรงกับ data/mappingTable.json → autism:
//   communication.no_speech_gesture_only / behavior.frequent_off_task / selfHelp.needs_prompting
const planReq = {
  studentId: student.id,
  abilityLevels: {
    communication: "no_speech_gesture_only",
    behavior: "frequent_off_task",
    selfHelp: "needs_prompting",
  },
  // จงใจใส่ชื่อเด็ก (คำนำหน้า "เด็กชาย") + เบอร์โทร เพื่อดูว่า scrubFreeText กรองออก
  strengths:
    "เด็กชายทดสอบ ระบบ ชอบฟังเพลงและมีสมาธิดีเมื่อทำกิจกรรมศิลปะ ติดต่อ 0812345678",
  academicYear: "2569",
  term: "1",
  principalName: "นายผู้บริหาร ทดสอบ",
  responsibleTeacherName: "นางครูผู้รับผิดชอบ ทดสอบ",
  homeroomTeacherName: "นางครูประจำชั้น ทดสอบ",
  meetingDate: "2026-07-28",
};

const planRes = await call("POST", "/api/plans", { body: planReq, expect: 201 });
const plan = await planRes.json();

console.log(`✅ สร้างแผนสำเร็จ: id=${plan.id} status=${plan.status}`);
console.log(`   goals: ${plan.goals.length} ข้อ`);
plan.goals.forEach((g, i) => console.log(`     ${i + 1}. ${g.finalText.slice(0, 70)}...`));
console.log(`   media: ${plan.media.length} รายการ`);
plan.media.forEach((m) => console.log(`     - [บัญชี ${m.category}] ${m.item}`));

// mock ควรได้ media จาก mappingTable: 3 (communication) + 3 (behavior) + 2 (selfHelp) รายการ (ก่อน dedupe)
if (plan.goals.length === 0) fail("แผนที่ได้ไม่มี goals เลย");
if (plan.media.length === 0)
  fail("retrieval ไม่เจอสื่อเลย — เช็คว่า abilityLevels key ตรงกับ mappingTable.json ไหม");

// ตรวจว่า goal ไม่มีชื่อเด็กปน (PII boundary)
const allGoalText = plan.goals.map((g) => g.finalText).join(" ");
if (allGoalText.includes("ทดสอบ ระบบ")) {
  fail("พบชื่อเด็กใน goal text — PII หลุดผ่าน boundary!");
}
console.log(`   ✅ ไม่พบชื่อเด็กใน goal text (PII boundary ทำงาน)`);

// ═════════════ ขั้นที่ 3: อ่านแผนกลับ ═════════════

step(`GET /api/plans/${plan.id}`);

const getRes = await call("GET", `/api/plans/${plan.id}`);
const fetched = await getRes.json();
if (fetched.id !== plan.id) fail("id ที่อ่านกลับไม่ตรงกับที่สร้าง", fetched);
console.log(
  `✅ อ่านกลับสำเร็จ: studentCode=${fetched.studentCode} goals=${fetched.goals.length} media=${fetched.media.length} status=${fetched.status}`
);

// ═════════════ ขั้นที่ 4: แก้ไข + finalize ═════════════

step(`PATCH /api/plans/${plan.id} — แก้ finalText ของ goal แรก + finalize`);

const firstGoal = fetched.goals[0];
const editedText = firstGoal.finalText + " (ครูแก้ไขแล้ว)";

const patchRes = await call("PATCH", `/api/plans/${plan.id}`, {
  body: {
    goals: [{ id: firstGoal.id, finalText: editedText }],
    status: "finalized",
  },
});
const patched = await patchRes.json();

const patchedGoal = patched.goals.find((g) => g.id === firstGoal.id);
if (!patchedGoal) fail("ไม่เจอ goal ที่แก้ใน response", patched.goals);
if (patchedGoal.finalText !== editedText)
  fail("finalText ไม่ถูกอัปเดต", { expected: editedText, got: patchedGoal.finalText });
if (patchedGoal.aiOriginal === patchedGoal.finalText)
  fail("aiOriginal เท่ากับ finalText หลังแก้ — aiOriginal อาจโดนเขียนทับ (ห้ามเกิด!)");
if (!patchedGoal.isEdited) fail("isEdited ควรเป็น true หลังครูแก้ข้อความ", patchedGoal);
if (patched.status !== "finalized") fail("status ไม่เปลี่ยนเป็น finalized", patched.status);
if (!patched.finalizedAt) fail("finalizedAt ยังเป็น null ทั้งที่ finalize แล้ว");

console.log(`✅ แก้ไขสำเร็จ:`);
console.log(`   aiOriginal คงเดิม: "${patchedGoal.aiOriginal.slice(0, 50)}..."`);
console.log(`   finalText ใหม่:    "${patchedGoal.finalText.slice(0, 50)}..."`);
console.log(`   isEdited=${patchedGoal.isEdited} status=${patched.status}`);
console.log(`   finalizedAt=${patched.finalizedAt} durationSeconds=${patched.durationSeconds}`);

// ═════════════ ขั้นที่ 5: สถิติ ═════════════

step("GET /api/stats — เช็ค goalEditRate และ avgDurationSeconds");

const statsRes = await call("GET", "/api/stats");
const stats = await statsRes.json();
console.log(JSON.stringify(stats, null, 2));

if (stats.totalPlans < 1) fail("totalPlans ควร ≥ 1", stats);
if (stats.finalizedPlans < 1) fail("finalizedPlans ควร ≥ 1 หลัง finalize", stats);
if (stats.goalEditRate <= 0)
  fail("goalEditRate ยังเป็น 0 ทั้งที่เพิ่งแก้ goal ไป — การนับ isEdited อาจพัง", stats);
if (stats.avgDurationSeconds === null)
  fail("avgDurationSeconds เป็น null ทั้งที่มีแผน finalized แล้ว", stats);
console.log(`✅ สถิติขยับถูกต้อง: goalEditRate=${stats.goalEditRate}% avgDurationSeconds=${stats.avgDurationSeconds}`);

// ═════════════ ขั้นที่ 6: export .docx ═════════════

step(`GET /api/plans/${plan.id}/export — ดาวน์โหลด .docx`);

const exportRes = await call("GET", `/api/plans/${plan.id}/export`);
const contentType = exportRes.headers.get("content-type") || "";
if (!contentType.includes("officedocument.wordprocessingml")) {
  console.warn(`⚠️ content-type ไม่ใช่ docx: ${contentType} (ไปต่อแต่ควรเช็ค)`);
}

const buf = Buffer.from(await exportRes.arrayBuffer());
if (buf.length < 1000) fail(`ไฟล์เล็กผิดปกติ (${buf.length} bytes) — น่าจะไม่ใช่ docx จริง`);
// docx คือ zip → ต้องขึ้นต้นด้วย PK
if (buf[0] !== 0x50 || buf[1] !== 0x4b) fail("ไฟล์ไม่ใช่ zip/docx (ไม่ขึ้นต้นด้วย PK)");

const outDir = path.join(__dirname, "output");
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, `test-plan-${plan.id}.docx`);
await writeFile(outFile, buf);
console.log(`✅ เซฟแล้ว: ${outFile}`);
console.log(`   ขนาดไฟล์: ${(buf.length / 1024).toFixed(1)} KB (${buf.length} bytes)`);

// ═════════════ สรุป ═════════════

console.log(`\n${"═".repeat(60)}`);
console.log("🎉 ผ่านครบทั้ง 6 ขั้น — pipeline ทำงานได้ทั้งเส้นใน mock mode");
console.log("═".repeat(60));
console.log(`\n📌 studentId สำหรับลบข้อมูลทดสอบทีหลัง: ${student.id}`);
console.log(`   ลบด้วย: curl -X DELETE ${BASE}/api/students/${student.id}`);
console.log(`   (หรือรัน script นี้ซ้ำ — จะลบ TEST-01 เดิมให้เองก่อนสร้างใหม่)`);
