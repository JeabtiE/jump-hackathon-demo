/**
 * scripts/test-api.mjs — ทดสอบ pipeline ทั้งเส้นผ่าน HTTP (mock mode)
 *
 * ต้องเปิด `npm run dev` ค้างไว้ก่อนรัน: npm run test:api
 * และต้องตั้ง TEST_SESSION_TOKEN = ค่าคุกกี้ authjs.session-token จากเบราว์เซอร์ที่ล็อกอินแล้ว
 * (ไม่ตั้ง → script หยุดพร้อมพิมพ์วิธีเอาค่ามา)
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

// ── session ของครูทดสอบ ──────────────────────────────────────
// ทุก route ใน app/api/** เรียก requireUserId() (lib/auth-guard.ts) → ไม่มี session = 401 ทุกขั้น
// ⚠️ ห้ามแก้ด้วยการปิด auth check — ส่งคุกกี้ session จริงจากเบราว์เซอร์มาแทน
//
// ชื่อคุกกี้ = ค่า default ของ Auth.js v5 (auth.config.ts ไม่ได้ override cookies)
//   http  → authjs.session-token
//   https → __Secure-authjs.session-token  (Auth.js เติม prefix เองเมื่อ protocol เป็น https)
const SESSION_TOKEN = process.env.TEST_SESSION_TOKEN?.trim();
const SESSION_COOKIE_NAME = `${BASE.startsWith("https:") ? "__Secure-" : ""}authjs.session-token`;

if (!SESSION_TOKEN) {
  console.error(`❌ ไม่มี TEST_SESSION_TOKEN — API ต้องมี session ของครูที่ล็อกอินแล้ว (ไม่งั้นได้ 401 ทุกขั้น)

วิธีเอาค่ามาจากเบราว์เซอร์:
  1. npm run dev แล้วเปิด ${BASE} → ล็อกอินด้วยบัญชี Google ที่อยู่ในตาราง AllowedEmail
  2. กด F12 เปิด DevTools → แท็บ Application (Chrome/Edge) หรือ Storage (Firefox)
  3. Cookies → ${BASE} → หาแถวชื่อ ${SESSION_COOKIE_NAME}
  4. ดับเบิลคลิกช่อง Value แล้วคัดลอกทั้งหมด (ยาวหลายร้อยตัวอักษร ขึ้นต้นด้วย eyJ)
  5. รันใหม่พร้อมตั้งค่า:
       Git Bash / macOS / Linux:  TEST_SESSION_TOKEN='<ค่า>' npm run test:api
       PowerShell:                $env:TEST_SESSION_TOKEN='<ค่า>'; npm run test:api

⚠️ ค่านี้คือกุญแจเข้าบัญชีครูเต็มสิทธิ์ (อ่าน PII นักเรียนได้)
   ห้าม commit ห้ามใส่ไฟล์ที่แชร์ ห้ามวางในแชทหรือ issue
   ข้อมูลทดสอบ (TEST-01) จะถูกสร้างเป็นของบัญชีนั้น
   ถ้าเห็นคุกกี้แตกเป็น ${SESSION_COOKIE_NAME}.0 / .1 แปลว่า token เกิน 4KB — script นี้ยังไม่รองรับ`);
  process.exit(1);
}

/** fetch + ตรวจ status ถ้าไม่ตรงที่คาดให้หยุดพร้อม body */
async function call(method, urlPath, { body, expect = 200 } = {}) {
  const url = `${BASE}${urlPath}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${SESSION_TOKEN}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    fail(`ต่อ ${url} ไม่ได้ — npm run dev เปิดอยู่หรือเปล่า?`, e.message);
  }
  if (res.status === 401) {
    fail(
      `${method} ${urlPath} ตอบ 401 — TEST_SESSION_TOKEN ใช้ไม่ได้ (หมดอายุ / คัดลอกไม่ครบ / คนละ AUTH_SECRET กับ server) ล็อกอินใหม่แล้วคัดลอกค่า ${SESSION_COOKIE_NAME} อีกครั้ง`
    );
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
  // audit ของ classifier — communication ครูแตะเลือกเองและตรงกับที่ AI เสนอ,
  // behavior ครูแตะแก้เป็นค่าอื่น → abilityOverrideRate ต้องอยู่ระหว่าง 1-99%
  // selfHelp AI เสนอแล้วครูไม่ได้แตะ (ค่าตรงกัน) → ต้องนับเป็น notConfirmedByTeacher ไม่ใช่ "เห็นด้วย"
  abilityLevelsAiSuggested: {
    communication: "no_speech_gesture_only",
    behavior: "difficulty_transition",
    selfHelp: "needs_prompting",
  },
  abilityLevelsConfirmedByTeacher: {
    communication: true,
    behavior: true,
    selfHelp: false,
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

/**
 * เป้าหมายทั้งแผนแบบแบน — PlanDTO เก็บ goals ซ้อนใต้ domainSections
 * (ตั้งแต่ 17 ส.ค. 2569 ที่ PlanGoal ย้ายไปผูกกับ PlanDomainSection)
 */
const goalsOf = (p) => (p.domainSections ?? []).flatMap((sec) => sec.goals);

const planRes = await call("POST", "/api/plans", { body: planReq, expect: 201 });
const plan = await planRes.json();
const planGoals = goalsOf(plan);

console.log(`✅ สร้างแผนสำเร็จ: id=${plan.id} status=${plan.status}`);
console.log(`   domainSections: ${plan.domainSections.length} ด้าน / goals รวม ${planGoals.length} ข้อ`);
planGoals.forEach((g, i) => console.log(`     ${i + 1}. ${g.finalText.slice(0, 70)}...`));
console.log(`   media: ${plan.media.length} รายการ`);
plan.media.forEach((m) => console.log(`     - [บัญชี ${m.category}] ${m.item}`));

// mock ควรได้ media จาก mappingTable: 3 (communication) + 3 (behavior) + 2 (selfHelp) รายการ (ก่อน dedupe)
if (planGoals.length === 0) fail("แผนที่ได้ไม่มี goals เลย");
if (plan.media.length === 0)
  fail("retrieval ไม่เจอสื่อเลย — เช็คว่า abilityLevels key ตรงกับ mappingTable.json ไหม");

// ตรวจว่า goal ไม่มีชื่อเด็กปน (PII boundary)
const allGoalText = planGoals.map((g) => g.finalText).join(" ");
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
  `✅ อ่านกลับสำเร็จ: studentCode=${fetched.studentCode} goals=${goalsOf(fetched).length} media=${fetched.media.length} status=${fetched.status}`
);

// ═════════════ ขั้นที่ 4: แก้ไข + finalize ═════════════

step(`PATCH /api/plans/${plan.id} — แก้ finalText ของ goal แรก + finalize`);

const firstGoal = goalsOf(fetched)[0];
const editedText = firstGoal.finalText + " (ครูแก้ไขแล้ว)";

const patchRes = await call("PATCH", `/api/plans/${plan.id}`, {
  body: {
    goals: [{ id: firstGoal.id, finalText: editedText }],
    status: "finalized",
  },
});
const patched = await patchRes.json();

const patchedGoal = goalsOf(patched).find((g) => g.id === firstGoal.id);
if (!patchedGoal) fail("ไม่เจอ goal ที่แก้ใน response", goalsOf(patched));
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

// /api/stats คืน { mine, all } — แผนที่เพิ่งสร้างเป็นของบัญชีที่ล็อกอิน จึงเช็คที่ mine
const mine = stats.mine;
if (!mine) fail("response ไม่มี stats.mine — contract ของ UsageStats อาจเปลี่ยน", stats);

if (mine.totalPlans < 1) fail("totalPlans ควร ≥ 1", mine);
if (mine.finalizedPlans < 1) fail("finalizedPlans ควร ≥ 1 หลัง finalize", mine);
if (mine.goalEditRate <= 0)
  fail("goalEditRate ยังเป็น 0 ทั้งที่เพิ่งแก้ goal ไป — การนับ isEdited อาจพัง", mine);
if (mine.avgDurationSeconds === null)
  fail("avgDurationSeconds เป็น null ทั้งที่มีแผน finalized แล้ว", mine);
if (typeof mine.abilityOverrideRate !== "number")
  fail(
    "abilityOverrideRate ควรเป็นตัวเลข หลังส่ง domain ที่ครูแตะเองไปแล้ว (null = ไม่เจอ domain ที่ครูแตะเอง)",
    mine
  );
if (mine.abilityOverrideRate < 1 || mine.abilityOverrideRate > 99)
  fail(
    "abilityOverrideRate ควรอยู่ระหว่าง 1-99% (มีทั้ง domain ที่ตรงและที่ครูแก้) — การเทียบ suggested vs confirmed อาจพัง",
    mine
  );

// domain ที่ AI กรอกให้แล้วครูไม่ได้แตะ ต้องแยกกองของตัวเอง ห้ามไหลไปรวมกับ "เห็นด้วย"
const breakdown = mine.abilityConfirmationBreakdown;
if (!breakdown) fail("ไม่มี abilityConfirmationBreakdown ใน stats.mine", mine);
if (breakdown.teacherAgreed < 1) fail("teacherAgreed ควร ≥ 1 (communication)", breakdown);
if (breakdown.teacherOverrode < 1) fail("teacherOverrode ควร ≥ 1 (behavior)", breakdown);
if (breakdown.notConfirmedByTeacher < 1)
  fail("notConfirmedByTeacher ควร ≥ 1 (selfHelp ครูไม่ได้แตะ) — อาจถูกนับรวมเป็นเห็นด้วย", breakdown);
console.log(
  `✅ สถิติขยับถูกต้อง: goalEditRate=${mine.goalEditRate}% avgDurationSeconds=${mine.avgDurationSeconds} abilityOverrideRate=${mine.abilityOverrideRate}% breakdown=${JSON.stringify(breakdown)}`
);

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

// ═════════════ ขั้นที่ 7: consistency warnings ═════════════

step(`PATCH /api/plans/${plan.id} — ยัดข้อมูลผิดเพื่อทดสอบ consistency warnings`);

// แผนใหม่: media ทุกตัว approve มาตั้งแต่สร้าง (isApproved default true — ตั้งใจ ดู CLAUDE.md §6)
// → กฎ "สื่อถูกเอาออกจากการเบิกหมด" ต้องยังไม่ fire
const beforeWarn = (await (await call("GET", `/api/plans/${plan.id}`)).json()).consistencyWarnings;
if (beforeWarn.some((w) => w.includes("ไม่ต้องเบิกสื่อเลยใช่ไหม")))
  fail("แผนใหม่ media approve หมดโดย default — warning ยืนยันการไม่เบิกสื่อ ไม่ควรโผล่", beforeWarn);
console.log("✅ แผนใหม่ (media approve หมดโดย default): ไม่มี warning ยืนยันการไม่เบิกสื่อ ตามคาด");

// ครูเอาสื่อออกจากการเบิกหมดทุกรายการ → กฎต้อง fire เป็นคำถามยืนยัน
const unapproveRes = await call("PATCH", `/api/plans/${plan.id}`, {
  body: { media: fetched.media.map((m) => ({ id: m.id, isApproved: false })) },
});
const unapprovedWarn = (await unapproveRes.json()).consistencyWarnings;
if (!unapprovedWarn.some((w) => w.includes("ไม่ต้องเบิกสื่อเลยใช่ไหม")))
  fail("เอาสื่อออกจากการเบิกหมดแล้ว แต่กฎยืนยันการไม่เบิกสื่อ ไม่ fire", unapprovedWarn);
console.log("✅ เอาสื่อออกหมดทุกรายการ → warning 'ไม่ต้องเบิกสื่อเลยใช่ไหม?' โผล่ตามคาด");

// ยัดข้อมูลผิด 3 แบบในคำขอเดียว:
//   - ปี 2555 (ผิด — แผนนี้ปี 2569) + ปี 2551 (ปีหลักสูตร ต้องไม่โดนเตือน)
//   - คำนำหน้าชื่อเด็ก "เด็กชายทดสอบ"
//   - approve media แต่ล้าง finalReason เป็นค่าว่าง
const badText =
  "เด็กชายทดสอบ ระบบ ทำได้ 3 ใน 5 ครั้ง ภายในวันที่ 31 มีนาคม 2555 ตามหลักสูตรแกนกลาง พ.ศ. 2551";
const badRes = await call("PATCH", `/api/plans/${plan.id}`, {
  body: {
    goals: [{ id: firstGoal.id, finalText: badText }],
    media: [{ id: fetched.media[0].id, isApproved: true, finalReason: "" }],
  },
});
const warns = (await badRes.json()).consistencyWarnings;
warns.forEach((w, i) => console.log(`   ${i + 1}. ${w}`));

if (!warns.some((w) => w.includes("พ.ศ. 2555")))
  fail("กฎปี พ.ศ. ไม่ตรงปีการศึกษา ไม่ fire ทั้งที่ยัดปี 2555 เข้าไป", warns);
if (warns.some((w) => w.includes("2551")))
  fail("ปีหลักสูตร 2551 โดนเตือนทั้งที่อยู่ใน whitelist", warns);
if (!warns.some((w) => w.includes("ยังไม่มีเหตุผลและความจำเป็น")))
  fail("กฎ media อนุมัติแล้วแต่เหตุผลว่าง ไม่ fire", warns);
if (!warns.some((w) => w.includes("คำนำหน้าชื่อเด็ก")))
  fail("กฎชื่อเด็กในข้อความเป้าหมาย ไม่ fire", warns);
if (warns.some((w) => w.includes("ไม่ต้องเบิกสื่อเลยใช่ไหม")))
  fail("approve media กลับไปแล้ว 1 รายการ แต่ warning ยืนยันการไม่เบิกสื่อ ยังอยู่", warns);
if (!warns[0]?.includes("ไม่ตรงกับปีการศึกษา"))
  fail("warning ปีผิด (ร้ายแรงสุด) ควรอยู่บนสุด", warns);

console.log("✅ warnings fire ครบ + whitelist ปีหลักสูตรทำงาน + เรียงร้ายแรงสุดขึ้นก่อน");
console.log("   (กฎเกณฑ์ไม่มีตัวเลข ทดสอบใน test-warnings.mjs — mock criterion มีเลขเสมอเลยยัดผ่าน API ไม่ได้)");

// ═════════════ สรุป ═════════════

console.log(`\n${"═".repeat(60)}`);
console.log("🎉 ผ่านครบทั้ง 7 ขั้น — pipeline ทำงานได้ทั้งเส้นใน mock mode");
console.log("═".repeat(60));
console.log(`\n📌 studentId สำหรับลบข้อมูลทดสอบทีหลัง: ${student.id}`);
// พิมพ์ชื่อตัวแปร ไม่พิมพ์ค่า token จริงลงจอ/log
console.log(
  `   ลบด้วย: curl -X DELETE -H "Cookie: ${SESSION_COOKIE_NAME}=$TEST_SESSION_TOKEN" ${BASE}/api/students/${student.id}`
);
console.log(`   (หรือรัน script นี้ซ้ำ — จะลบ TEST-01 เดิมให้เองก่อนสร้างใหม่)`);
