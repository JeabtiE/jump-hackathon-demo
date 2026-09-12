/**
 * scripts/eval-classifier.mjs — EVAL HARNESS วัดคุณภาพการจัดระดับความสามารถ
 *
 *   npm run eval:classifier              # mock (ฟรี เร็ว แต่ตัวเลขเชื่อไม่ได้)
 *   LIVE=true npm run eval:classifier    # ยิงโมเดลจริง ← ตัวเลขที่ใช้อ้างอิงได้มีแต่อันนี้
 *
 * ต่างจาก scripts/test-classifier.mjs ตรงเจตนา:
 *   test:classifier = unit test ผ่าน/ไม่ผ่าน กันไม่ให้ของที่เคยถูกกลับมาพัง
 *   eval:classifier = วัด "คุณภาพ" เป็นตัวเลข เอาไว้เทียบก่อน/หลังขยายชุดตัวเลือก
 *
 * ⚠️ mock (classifyByKeyword) จับคู่ด้วย substring จาก label เท่านั้น
 *    ชุดข้อมูลนี้จงใจถอดความไม่ให้ตรงกับ label → mock จะได้ 🟠 เกือบหมดเป็นเรื่องปกติ
 *    ห้ามเอาตัวเลข mock ไปอ้างว่าเป็นคุณภาพของระบบ
 *
 * 🔒 PII: ข้อความในชุดข้อมูลเป็นเคสสมมติ ไม่มีชื่อจริง และยังวิ่งผ่าน
 *    scrubFreeText() → buildLLMSafePayload() → assertNoPII() ตามปกติใน classifyAbility()
 *
 * exit code: 1 ถ้ามี 🔴 แม้แต่เคสเดียว (เสนอค่าผิด = เบิกสื่อผิด) · 2 ถ้าชุดข้อมูลเองพัง
 */

import { readFileSync } from "node:fs";
import { classifyAbility, getDomainOptions } from "../lib/ability-classifier.ts";

const LIVE = process.env.LIVE === "true";
const EVAL_SET = new URL("../data/classifierEvalSet.json", import.meta.url);

/** จำนวนเคสที่ยิงพร้อมกัน — mock ไม่มีต้นทุน ส่วน LIVE เผื่อ rate limit ไว้ */
const CONCURRENCY = LIVE ? 4 : 8;

const { cases } = JSON.parse(readFileSync(EVAL_SET, "utf8"));

// ── โหมดการทำงาน ─────────────────────────────────────────────────────────
if (LIVE) {
  try {
    process.loadEnvFile(".env"); // ไม่มีไฟล์ก็ไม่เป็นไร อาจตั้ง key มาจาก shell แล้ว
  } catch {}
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌ LIVE=true แต่ไม่มี ANTHROPIC_API_KEY — ตั้งค่าใน .env ก่อน");
    process.exit(2);
  }
  process.env.USE_MOCK = "false";
} else {
  process.env.USE_MOCK = "true";
}

// ── ตรวจชุดข้อมูลก่อนเสียเงิน: expected ต้องเป็นค่าที่มีจริงในคู่นั้น ────────
const setErrors = [];
for (const c of cases) {
  if (c.expected === null) continue;
  const allowed = getDomainOptions(c.disabilityType, c.domain).map((o) => o.value);
  if (!allowed.includes(c.expected)) {
    setErrors.push(
      `${c.disabilityType}/${c.domain}: expected "${c.expected}" ไม่มีในชุดตัวเลือกจริง (${allowed.join(", ") || "ว่าง"})`
    );
  }
}
if (setErrors.length) {
  console.error("❌ ชุดข้อมูลทดสอบเองผิด — แก้ data/classifierEvalSet.json ก่อน:");
  for (const e of setErrors) console.error("   ", e);
  process.exit(2);
}

/** รันทีละหลายเคสพร้อมกัน โดยคงลำดับผลลัพธ์ไว้ตามลำดับ input */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * จัดผลหนึ่งเคสลงกลุ่ม
 *   ok      ✅ ได้ค่าตรง expected + confidence high
 *   okNull  🟡 expected=null และได้ null (ปฏิเสธถูกต้อง)
 *   missed  🟠 expected มีค่า แต่ได้ null (พลาดโอกาส — ครูต้องเลือกเอง)
 *   wrong   🔴 ได้ค่าที่ไม่ตรง expected (รวมกรณี expected=null แต่ดันเสนอค่า) ← อันตราย
 *   unsure  ⚪ ได้ค่าตรง expected แต่ confidence low (ถูกแต่ไม่กล้าฟันธง)
 */
function bucketOf(expected, result) {
  const got = result.suggestedLevel;
  if (got === null) return expected === null ? "okNull" : "missed";
  if (got !== expected) return "wrong";
  return result.confidence === "high" ? "ok" : "unsure";
}

const BUCKETS = ["ok", "okNull", "missed", "wrong", "unsure"];
const ICON = { ok: "✅", okNull: "🟡", missed: "🟠", wrong: "🔴", unsure: "⚪" };

console.log(
  `\n🔬 eval classifier — ${cases.length} เคส · โหมด ${LIVE ? "LIVE (โมเดลจริง)" : "MOCK"} · พร้อมกันทีละ ${CONCURRENCY}`
);
if (!LIVE) {
  console.log("   ⚠️ โหมด mock วัดคุณภาพไม่ได้ (substring matching) — ใช้ LIVE=true เวลาต้องการตัวเลขจริง");
}

const started = Date.now();
const results = await mapLimit(cases, CONCURRENCY, async (c) => {
  const result = await classifyAbility(c.disabilityType, c.domain, c.text);
  return { ...c, result, bucket: bucketOf(c.expected, result) };
});
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

// ── ตารางแยกตาม (ประเภท × ด้าน) ──────────────────────────────────────────
const byPair = new Map();
for (const r of results) {
  const key = `${r.disabilityType}/${r.domain}`;
  if (!byPair.has(key)) byPair.set(key, { total: 0, ok: 0, okNull: 0, missed: 0, wrong: 0, unsure: 0 });
  const row = byPair.get(key);
  row.total++;
  row[r.bucket]++;
}

console.log("\n── ผลแยกตาม (ประเภท × ด้าน) ──");
console.log(
  "ประเภท/ด้าน".padEnd(28) +
    "เคส".padStart(4) +
    "  ✅".padStart(6) +
    "  🟡".padStart(6) +
    "  🟠".padStart(6) +
    "  🔴".padStart(6) +
    "  ⚪".padStart(6)
);
console.log("─".repeat(62));
for (const [pair, row] of byPair) {
  console.log(
    pair.padEnd(28) +
      String(row.total).padStart(4) +
      String(row.ok).padStart(6) +
      String(row.okNull).padStart(6) +
      String(row.missed).padStart(6) +
      String(row.wrong).padStart(6) +
      String(row.unsure).padStart(6)
  );
}

// ── สรุปรวม ──────────────────────────────────────────────────────────────
const total = Object.fromEntries(BUCKETS.map((b) => [b, results.filter((r) => r.bucket === b).length]));
const hasAnswer = results.filter((r) => r.expected !== null).length;
const shouldBeNull = results.length - hasAnswer;
const pct = (n, d) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(0)}%`);

console.log("\n── สรุปรวม ──");
console.log(`  ✅ ถูก (ตรง + high)        ${String(total.ok).padStart(3)} / ${hasAnswer} เคสที่มีคำตอบ  (${pct(total.ok, hasAnswer)})`);
console.log(`  ⚪ ถูกแต่ confidence low   ${String(total.unsure).padStart(3)}`);
console.log(`  🟡 null ที่ถูกต้อง         ${String(total.okNull).padStart(3)} / ${shouldBeNull} เคสที่ควร null  (${pct(total.okNull, shouldBeNull)})`);
console.log(`  🟠 พลาดโอกาส (ควรได้ค่า แต่ได้ null) ${String(total.missed).padStart(3)}`);
console.log(`  🔴 ผิด (เสนอค่าที่ไม่ควรเสนอ)        ${String(total.wrong).padStart(3)}`);
console.log(`  ⏱  ${elapsed}s`);

// ── ด้านที่อ่อนที่สุด = ควรขยายระดับก่อน ──────────────────────────────────
const weak = [...byPair.entries()].filter(([, r]) => r.missed > 0).sort((a, b) => b[1].missed - a[1].missed);
console.log("\n── 🟠 มากที่สุด (คู่ที่ควรขยาย/ปรับ label ก่อน) ──");
if (weak.length === 0) {
  console.log("  ไม่มี 🟠 เลย — ทุกคู่จับคู่ได้ครบ");
} else {
  for (const [pair, row] of weak.slice(0, 5)) console.log(`  ${pair.padEnd(28)} 🟠 ${row.missed}/${row.total}`);
}

// เคสที่ครูพิมพ์อาการซึ่ง "มีระดับรองรับในประเภทอื่นแล้ว แต่ประเภทนี้ยังไม่มี"
const silo = results.filter((r) => r.note?.startsWith("[ไซโล]"));
console.log(
  `\n  🧩 เคสช่องว่างจากไซโล ${silo.length} เคส — ตอนนี้ระบบตอบ null ถูกต้อง ${silo.filter((r) => r.bucket === "okNull").length} เคส` +
    ` (ถ้าขยายระดับแล้ว เคสกลุ่มนี้ควรกลายเป็น ✅ แทน)`
);

// ── รายละเอียดเคสที่ต้องดูด้วยตา ─────────────────────────────────────────
for (const [bucket, title] of [
  ["wrong", "🔴 เสนอค่าผิด — ต้องเป็น 0"],
  ["missed", "🟠 พลาดโอกาส"],
  ["unsure", "⚪ ถูกแต่ไม่มั่นใจ"],
]) {
  const rows = results.filter((r) => r.bucket === bucket);
  if (rows.length === 0) continue;
  console.log(`\n── ${title} (${rows.length}) ──`);
  for (const r of rows) {
    console.log(`  ${r.disabilityType}/${r.domain}: "${r.text}"`);
    console.log(`     คาด: ${r.expected ?? "null"}  ได้: ${r.result.suggestedLevel ?? "null"} (${r.result.confidence})`);
    if (bucket === "wrong") console.log(`     เหตุผลที่ AI ให้: ${r.result.rationale}`);
  }
}

const failed = total.wrong > 0;
console.log(
  `\n${failed ? "❌" : "✅"} ${failed ? `พบเคสที่เสนอค่าผิด ${total.wrong} เคส` : "ไม่มีเคสที่เสนอค่าผิด"}` +
    `${LIVE ? "" : " (โหมด mock — ตัวเลขนี้ไม่ใช่คุณภาพจริง)"}\n`
);
process.exit(failed ? 1 : 0);
