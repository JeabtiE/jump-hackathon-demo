/**
 * scripts/verify_math_text_repair.mjs — พิสูจน์ว่าการซ่อมข้อความคณิต (commit 69fbaa1)
 * แก้เฉพาะตัวอักษรที่ตั้งใจแก้เท่านั้น ไม่ได้แตะอย่างอื่น
 *
 * ทำไมต้องมีไฟล์นี้: การซ่อมใน scripts/fix_math_curriculum_text.mjs แทน "ำ"→"า" ทั้งไฟล์
 * แล้วคืน "ำ" กลับตามตาราง RESTORE — ถ้า pattern ตัวใดกินคำผิด ข้อความจะเพี้ยนแบบเงียบๆ
 * สคริปต์นี้แทนการให้ครูพิสูจน์อักษร 109 บรรทัด (เป็นงาน QA ของทีม ไม่ใช่ของครู)
 *
 * ที่มาของข้อมูล: อ่านจาก git history โดยตรง ไม่แตะ PDF ต้นทาง (ซึ่งไม่ได้อยู่ใน repo)
 *   ก่อนแก้ = git show <commit>^:data/curriculum.json
 *   หลังแก้ = git show <commit>:data/curriculum.json
 *
 * ตรวจ 4 ข้อ ต่อ 1 ตัวชี้วัดที่เปลี่ยน:
 *   a) ความยาวต้องเท่าเดิม        — แทนที่ตัวอักษรตัวต่อตัว ความยาวห้ามเปลี่ยน
 *   b) ลำดับตัวเลขต้องเหมือนเดิม   — เลขคือเกณฑ์/จำนวน ถ้าขยับ = ข้อมูลเสีย ไม่ใช่แก้ font
 *   c) ทุกตำแหน่งที่ต่างต้องเป็น ำ (U+0E33) ↔ า (U+0E32) เท่านั้น
 *   d) ทุกตัว "ำ" ที่เหลืออยู่ในข้อความใหม่ ต้องอธิบายได้ด้วยตาราง RESTORE
 *      (จำลองการแทนที่ซ้ำ แล้วเทียบว่าได้ผลลัพธ์ตรงกับของจริง)
 *
 * exit 0 เมื่อไม่มี failure เท่านั้น — ใช้เป็น gate ก่อนเปิด math ใน ENABLED_SUBJECTS ได้
 *
 * รัน: node scripts/verify_math_text_repair.mjs [commit]
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const COMMIT = process.argv[2] ?? "69fbaa1";
const DATA_FILE = "data/curriculum.json";
const FIX_SCRIPT = fileURLToPath(new URL("./fix_math_curriculum_text.mjs", import.meta.url));

const SARA_AM = "ำ"; // ำ — ตัวที่ font ต้นทางใส่ผิดมาทุกตำแหน่ง
const SARA_AA = "า"; // า — ตัวที่ถูกต้อง
const DIGITS = /[0-9๐-๙]/gu; // อารบิก + ไทย ๐-๙

const failures = [];
const fail = (scope, check, detail) => failures.push({ scope, check, detail });

// ── ดึงไฟล์จาก git ────────────────────────────────────────────────────────────
function readFromGit(rev) {
  const raw = execFileSync("git", ["show", `${rev}:${DATA_FILE}`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

// ── ดึงตาราง RESTORE จาก source ของสคริปต์ซ่อม ────────────────────────────────
// อ่านเป็น text ไม่ import เพราะสคริปต์นั้นเขียนทับ data/curriculum.json ตอน import
function loadRestoreTable() {
  const src = readFileSync(FIX_SCRIPT, "utf8");
  const block = src.match(/const RESTORE = \[([\s\S]*?)\n\];/u);
  if (!block) {
    console.error(`❌ หาตาราง RESTORE ใน ${FIX_SCRIPT} ไม่เจอ — รูปแบบไฟล์เปลี่ยนไป?`);
    process.exit(2);
  }
  const entries = [...block[1].matchAll(/\["([^"]+)",\s*"([^"]+)"\]/gu)].map((m) => [m[1], m[2]]);
  if (entries.length === 0) {
    console.error("❌ ตาราง RESTORE ว่าง — parse ไม่สำเร็จ");
    process.exit(2);
  }
  // ตาราง RESTORE ต้องแทนที่แบบความยาวเท่ากัน ไม่งั้นการติดตาม index ข้างล่างใช้ไม่ได้
  for (const [wrong, right] of entries) {
    if (wrong.length !== right.length) {
      console.error(`❌ RESTORE entry ความยาวไม่เท่ากัน: "${wrong}" → "${right}"`);
      process.exit(2);
    }
    if (right.replaceAll(SARA_AM, SARA_AA) !== wrong) {
      console.error(`❌ RESTORE entry ไม่ใช่การคืน ำ ล้วนๆ: "${wrong}" → "${right}"`);
      process.exit(2);
    }
  }
  return entries;
}

// ── จำลองขั้นตอนซ่อม พร้อมจดว่า "ำ" แต่ละตัวมาจาก RESTORE entry ไหน ──────────
// คืน { text, coveredBy } โดย coveredBy[i] = entry ที่ทำให้ตำแหน่ง i เป็น "ำ" (หรือ null)
function replayFix(before, restore) {
  let chars = [...before.replaceAll(SARA_AM, SARA_AA)]; // ขั้นที่ 1
  const coveredBy = new Array(chars.length).fill(null);

  for (const [wrong, right] of restore) {
    // เลียนแบบ replaceAll: หาซ้ำจากซ้ายไปขวาบนสตริง ณ สถานะปัจจุบัน
    let text = chars.join("");
    let from = 0;
    for (;;) {
      const at = text.indexOf(wrong, from);
      if (at === -1) break;
      for (let k = 0; k < wrong.length; k++) {
        if (right[k] !== wrong[k]) {
          chars[at + k] = right[k];
          coveredBy[at + k] = `${wrong} → ${right}`;
        }
      }
      from = at + wrong.length;
      text = chars.join(""); // entry ถัดไปเห็นผลของ entry ก่อนหน้า (เช่น น้าหนัก ต้องมาก่อน น้า)
    }
  }
  return { text: chars.join(""), coveredBy };
}

const digitsOf = (s) => (s.match(DIGITS) ?? []).join("");

// ── ตรวจ 1 คู่ก่อน/หลัง ───────────────────────────────────────────────────────
function checkPair({ scope, label, before, after, restore }) {
  const problems = [];

  // (a) ความยาว
  if (before.length !== after.length) {
    problems.push(`a) ความยาวเปลี่ยน: ${before.length} → ${after.length} ตัวอักษร`);
  }

  // (b) ลำดับตัวเลข — ตรวจสำคัญที่สุด เลขเพี้ยน = เกณฑ์การประเมินเพี้ยน
  const dBefore = digitsOf(before);
  const dAfter = digitsOf(after);
  if (dBefore !== dAfter) {
    problems.push(`b) ลำดับตัวเลขเปลี่ยน: "${dBefore}" → "${dAfter}"`);
  }

  // (c) ทุกตำแหน่งที่ต่างต้องเป็น ำ ↔ า
  if (before.length === after.length) {
    const bad = [];
    for (let i = 0; i < before.length; i++) {
      if (before[i] === after[i]) continue;
      const pair = [before[i], after[i]];
      const ok = pair.includes(SARA_AM) && pair.includes(SARA_AA);
      if (!ok) {
        bad.push(
          `ตำแหน่ง ${i}: ${describeChar(before[i])} → ${describeChar(after[i])}`,
        );
      }
    }
    if (bad.length) problems.push(`c) มีตัวอักษรอื่นถูกเปลี่ยน:\n       ${bad.join("\n       ")}`);
  } else {
    problems.push("c) ข้ามการเทียบตัวต่อตัว เพราะความยาวไม่เท่ากัน");
  }

  // (d) "ำ" ที่เหลือทุกตัวต้องอธิบายได้ด้วยตาราง RESTORE
  const { text: replayed, coveredBy } = replayFix(before, restore);
  if (replayed !== after) {
    problems.push(
      `d) จำลองด้วยตาราง RESTORE แล้วได้ผลไม่ตรงกับของจริง\n       จำลองได้: ${replayed}`,
    );
  } else {
    const uncovered = [];
    for (let i = 0; i < after.length; i++) {
      if (after[i] === SARA_AM && !coveredBy[i]) uncovered.push(i);
    }
    if (uncovered.length) {
      const words = uncovered.map((i) => `ตำแหน่ง ${i}: "…${after.slice(Math.max(0, i - 4), i + 5)}…"`);
      problems.push(`d) มี "ำ" ที่ไม่มี RESTORE entry รองรับ:\n       ${words.join("\n       ")}`);
    }
  }

  if (problems.length) {
    fail(scope, label, { before, after, problems });
    return false;
  }
  return true;
}

function describeChar(ch) {
  const cp = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
  return `"${ch}" (U+${cp})`;
}

// ── flatten ข้อมูลวิชาหนึ่งให้เทียบง่าย ──────────────────────────────────────
function flattenSubject(data, subject) {
  const indicators = [];
  const strands = [];
  for (const [grade, standards] of Object.entries(data[subject] ?? {})) {
    for (const std of standards) {
      strands.push({ grade, standard: std.standard, text: std.strandText ?? null });
      for (const ind of std.indicators) {
        indicators.push({ grade, standard: std.standard, code: ind.code, text: ind.text });
      }
    }
  }
  return { indicators, strands };
}

// ── main ─────────────────────────────────────────────────────────────────────
const restore = loadRestoreTable();
const before = readFromGit(`${COMMIT}^`);
const after = readFromGit(COMMIT);

const mathBefore = flattenSubject(before, "math");
const mathAfter = flattenSubject(after, "math");

console.log(`ตรวจการซ่อมข้อความคณิตศาสตร์ — commit ${COMMIT}`);
console.log(`ไฟล์: ${DATA_FILE}   ตาราง RESTORE: ${restore.length} คำ`);
console.log("─".repeat(72));

// ── scope check: commit นี้ต้องไม่แตะอย่างอื่นเลย ────────────────────────────
if (JSON.stringify(before.thai) !== JSON.stringify(after.thai)) {
  fail("scope", "วิชาภาษาไทยถูกแก้", { problems: ["ข้อมูล thai ไม่เหมือนเดิม — commit นี้ควรแตะเฉพาะ math"] });
}
const codesBefore = mathBefore.indicators.map((i) => i.code);
const codesAfter = mathAfter.indicators.map((i) => i.code);
if (codesBefore.join("|") !== codesAfter.join("|")) {
  fail("scope", "รหัสตัวชี้วัดเปลี่ยน", {
    problems: ["ลำดับหรือค่าของ code ไม่ตรงกัน — รหัสห้ามถูกแก้"],
  });
}
console.log(`ตัวชี้วัดคณิตทั้งหมด: ${codesAfter.length} รายการ`);
console.log(`ภาษาไทย: ${JSON.stringify(before.thai) === JSON.stringify(after.thai) ? "ไม่ถูกแตะ ✓" : "ถูกแก้ ✗"}`);
console.log(`รหัสตัวชี้วัด: ${codesBefore.join("|") === codesAfter.join("|") ? "ไม่ถูกแตะ ✓" : "ถูกแก้ ✗"}`);
// ยืนยันข้ออ้างตั้งต้นของการซ่อม: ข้อความดิบไม่มี "า" เลยแม้แต่ตัวเดียว
const aaInBefore = mathBefore.indicators.filter((i) => i.text.includes(SARA_AA)).length;
console.log(`ข้อความดิบที่มี "า": ${aaInBefore} รายการ ${aaInBefore === 0 ? "✓ (ตรงกับอาการ font bug)" : "— ผิดคาด"}`);
console.log("");

// ── ตรวจตัวชี้วัดที่เปลี่ยน ──────────────────────────────────────────────────
const changed = [];
const untouched = [];
for (let i = 0; i < mathAfter.indicators.length; i++) {
  const b = mathBefore.indicators[i];
  const a = mathAfter.indicators[i];
  if (b.text === a.text) untouched.push(a);
  else changed.push({ ...a, before: b.text });
}

let passed = 0;
for (const row of changed) {
  const ok = checkPair({
    scope: "indicator",
    label: row.code,
    before: row.before,
    after: row.text,
    restore,
  });
  if (ok) passed++;
}

// ── strandText ก็ถูกซ่อมด้วยฟังก์ชันเดียวกัน ตรวจด้วยเกณฑ์เดียวกัน ───────────
let strandChanged = 0;
let strandPassed = 0;
for (let i = 0; i < mathAfter.strands.length; i++) {
  const b = mathBefore.strands[i];
  const a = mathAfter.strands[i];
  if (b.text === a.text || a.text == null || b.text == null) continue;
  strandChanged++;
  const ok = checkPair({
    scope: "strandText",
    label: `${a.grade} ${a.standard} (strandText)`,
    before: b.text,
    after: a.text,
    restore,
  });
  if (ok) strandPassed++;
}

// ── ตัวชี้วัดที่การซ่อมไม่ได้แตะ ──────────────────────────────────────────────
// "ไม่ถูกแตะ" ไม่ได้แปลว่า "ยังไม่ถูกซ่อม" — ถ้าทุก "ำ" ในบรรทัดนั้นเป็น ำ ของจริง
// (RESTORE คืนกลับครบ) ผลลัพธ์ย่อมเท่าเดิม ซึ่งคือการซ่อมที่ทำงานถูกต้อง
// ที่ต้องระวังคือบรรทัดที่มี "ำ" ซึ่ง RESTORE อธิบายไม่ได้ — นั่นคือของที่ยังดิบจริง
const untouchedRows = untouched.map((u) => {
  const { text: replayed, coveredBy } = replayFix(u.text, restore);
  const raw = replayed !== u.text || [...u.text].some((c, i) => c === SARA_AM && !coveredBy[i]);
  let note;
  if (!u.text.includes(SARA_AM)) note = "ไม่มี ำ เลย — ไม่มีอะไรให้ซ่อม";
  else if (raw) note = '⚠️ มี "ำ" ที่ RESTORE อธิบายไม่ได้ — ยังดิบ';
  else note = 'ทุก "ำ" เป็นของจริงตาม RESTORE — ผลซ่อมเท่าเดิมโดยถูกต้อง';
  if (raw) {
    fail("untouched", u.code, {
      before: u.text,
      after: u.text,
      problems: ['บรรทัดนี้ไม่ถูกแตะ แต่มี "ำ" ที่ตาราง RESTORE ไม่ครอบคลุม'],
    });
  }
  return { ...u, note };
});

// ── รายงาน ───────────────────────────────────────────────────────────────────
const indicatorFailures = failures.filter((f) => f.scope === "indicator");
const strandFailures = failures.filter((f) => f.scope === "strandText");
const scopeFailures = failures.filter((f) => f.scope === "scope");

console.log("ผลตรวจตัวชี้วัด");
console.log(`  เปลี่ยนทั้งหมด:        ${changed.length} รายการ`);
console.log(`  ผ่านครบทั้ง 4 ข้อ:     ${passed} รายการ`);
console.log(`  ไม่ผ่าน:               ${indicatorFailures.length} รายการ`);
console.log("");
console.log("ผลตรวจ strandText (สาระการเรียนรู้แกนกลาง — ซ่อมด้วยฟังก์ชันเดียวกัน)");
console.log(`  เปลี่ยนทั้งหมด: ${strandChanged}   ผ่าน: ${strandPassed}   ไม่ผ่าน: ${strandFailures.length}`);
console.log("");

if (failures.length) {
  console.log("─".repeat(72));
  console.log(`❌ รายการที่ไม่ผ่าน (${failures.length})`);
  for (const f of failures) {
    console.log("");
    console.log(`  [${f.scope}] ${f.check}`);
    for (const p of f.detail.problems) console.log(`    - ${p}`);
    if (f.detail.before !== undefined) {
      console.log(`    เดิม:    ${f.detail.before}`);
      console.log(`    แก้เป็น: ${f.detail.after}`);
    }
  }
  console.log("");
}

console.log("─".repeat(72));
console.log(`ตัวชี้วัดที่การซ่อมไม่ได้แตะ: ${untouchedRows.length} รายการ (${codesAfter.length} - ${changed.length})`);
for (const u of untouchedRows) {
  console.log(`  ${u.code} — ${u.note}`);
  console.log(`    ${u.text}`);
}
console.log("");

const total = failures.length;
if (total === 0) {
  console.log("✅ ผ่านทั้งหมด — การซ่อมเปลี่ยนเฉพาะ ำ ↔ า และอธิบายได้ด้วยตาราง RESTORE ทุกตัว");
} else {
  console.log(`❌ ไม่ผ่าน ${total} รายการ — ต้องให้คนตัดสิน อย่าแก้ข้อมูลให้ผ่านเอง`);
  if (scopeFailures.length) console.log("   (มี scope failure — commit นี้แตะข้อมูลนอกขอบเขตที่ตั้งใจ)");
}

process.exit(total === 0 ? 0 : 1);
