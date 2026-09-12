/**
 * ABILITY CLASSIFIER — โซน domain/AI (คน A ดูแล)
 *
 * แปลงข้อความอิสระที่ครูพิมพ์ (ความสามารถปัจจุบันของนักเรียน) → ค่า enum
 * ของระดับความสามารถ แบบ constrained: เลือกได้เฉพาะ value ที่มีจริงใน
 * ABILITY_OPTIONS[disabilityType] ของ domain นั้นเท่านั้น
 *
 * 🔑 เส้นที่ห้ามข้าม (CLAUDE.md — AI Architecture)
 *    - ไฟล์นี้ "เสนอ" อย่างเดียว ไม่ตัดสิน ไม่เรียก retrieval ไม่เขียนลง DB
 *    - retrieval ยังวิ่งบน abilityLevels ที่ครูยืนยันแล้วเหมือนเดิมทุกประการ
 *    - ถ้า LLM คืนค่าที่ไม่อยู่ในชุดตัวเลือก → ทิ้ง (null + confidence "low")
 *      แบบเดียวกับที่รหัสสื่อ/ตัวชี้วัดนอก retrieval ถูกทิ้งใน route.ts
 *
 * 🔒 PII: freeText ผ่าน scrubFreeText() → buildLLMSafePayload() → assertNoPII()
 *    ก่อน fetch ทุกครั้ง (ครูอาจเผลอพิมพ์ชื่อเด็กลงช่องบรรยาย)
 *
 * 💡 ไม่มี ANTHROPIC_API_KEY หรือ USE_MOCK=true → คืน mock (เหมือน route.ts)
 */

import { ABILITY_OPTIONS, getDomainLabel } from "./ability-options";
import { assertNoPII, buildLLMSafePayload, scrubFreeText } from "./pii-guard";
import type { AbilityClassification } from "./types";

/** ใช้ model เดียวกับ app/api/plans/route.ts — งานจัดหมวดเข้าชุดปิดไม่ต้องใช้รุ่นใหญ่ */
const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 2000;

/** ตัวเลือกหนึ่งค่าของ dropdown เดิม — คือ "ชุดปิด" ที่ AI เลือกได้ */
export interface AbilityOption {
  value: string;
  label: string;
}

/**
 * ชุดค่าที่อนุญาตของ (ประเภทความพิการ, ด้าน) — แหล่งเดียวคือ ABILITY_OPTIONS
 * ไม่เจอ (ประเภท/ด้านที่ไม่มีในระบบ) → [] แปลว่า "ไม่มีอะไรให้เลือก"
 */
export function getDomainOptions(
  disabilityType: string,
  domain: string
): AbilityOption[] {
  const domainDef = ABILITY_OPTIONS[disabilityType]?.find((d) => d.domain === domain);
  return domainDef?.options ?? [];
}

/** ผลลัพธ์ "ตีความไม่ได้" — ใช้ซ้ำทุกทางออกที่ไม่มั่นใจ */
function unresolved(domain: string, rationale: string): AbilityClassification {
  return { domain, suggestedLevel: null, confidence: "low", rationale };
}

/**
 * system prompt ของ classifier — ชุดตัวเลือกถูกฝังเป็นรายการปิด
 * @param freeText ต้องเป็นค่าที่ผ่าน scrubFreeText() แล้วเท่านั้น
 */
export function buildClassifierPrompt(params: {
  domainLabel: string;
  options: AbilityOption[];
  freeText: string;
}): string {
  const optionLines = params.options
    .map((o) => `- value: "${o.value}"  → "${o.label}"`)
    .join("\n");

  return `คุณคือตัวช่วยจัดหมวดข้อมูลสำหรับครูการศึกษาพิเศษ
งานของคุณ: อ่านคำบรรยาย "ความสามารถปัจจุบันของนักเรียน" ในด้าน "${params.domainLabel}" ที่ครูพิมพ์มา
แล้วตัดสินว่า "มีตัวเลือกใดในรายการปิดด้านล่าง ที่บรรยายความสามารถเดียวกันกับข้อความของครูหรือไม่"

⚠️ นี่ไม่ใช่งานเลือก "ตัวเลือกที่ใกล้เคียงที่สุดในรายการ"
เลือกได้ก็ต่อเมื่อ label นั้นบรรยาย "ความสามารถเดียวกัน" กับข้อความของครูจริง ๆ
ถ้าไม่มี label ไหนเท่ากัน คำตอบที่ถูกต้องคือ null — ไม่ใช่อันที่ใกล้ที่สุด
เพราะค่าที่เลือกจะถูกนำไปเบิกสื่อและงบประมาณจริง เลือกผิด = เด็กได้สื่อผิด
การคืน null แล้วให้ครูเลือกเอง เสียหายน้อยกว่าการเดาผิดเสมอ

ตัวเลือกที่เลือกได้ (ห้ามสร้างค่าใหม่นอกเหนือจากนี้):
${optionLines}

ขั้นตอนที่ต้องทำก่อนตอบ (คิดในใจ ไม่ต้องเขียนออกมา):
1. สรุปสั้น ๆ ก่อนว่า ข้อความของครูกำลังบรรยาย "ความสามารถอะไร" ในมิติไหน
   (เช่น พูดได้กี่คำ / ออกเสียงชัดหรือไม่ / นั่งอยู่กับที่ได้หรือไม่ / ทำเองได้หรือต้องมีคนช่วย)
2. ไล่ดูทีละตัวเลือก แล้วถามว่า label นี้บรรยายความสามารถ "เดียวกัน" กับข้อ 1 หรือไม่
   — ต้อง "เท่ากัน" ไม่ใช่ "ใกล้เคียง" ไม่ใช่ "อยู่ด้านเดียวกัน"
3. ถ้าไม่มีตัวเลือกใดเท่ากัน → suggestedLevel = null, confidence = "low"

กฎกันสับสนข้ามมิติ (ผิดบ่อยที่สุด):
- ความสามารถคนละมิติห้ามจับคู่กัน แม้จะอยู่ในด้านเดียวกัน เช่น
  · "ปริมาณ/ความซับซ้อนของคำพูด" (พูดได้กี่คำ ต่อประโยคได้ไหม)
    เป็นคนละมิติกับ "ความชัดของการออกเสียง" (ออกเสียงถูกต้อง/ชัดเจนไหม)
  · "ทำได้เองหรือไม่" เป็นคนละมิติกับ "ทำได้ถูกต้องแค่ไหน"
- ข้อความที่บอกว่านักเรียน "ทำได้ แต่ทำได้ไม่ดี" ห้ามจับคู่กับ label ที่แปลว่า "ทำไม่ได้เลย"

ตัวอย่างที่คำตอบถูกต้องคือ null:
  สมมติตัวเลือกมีแค่ "ไม่พูด ใช้ท่าทางสื่อสาร" กับ "พูดได้เป็นคำเดี่ยว ยังไม่ต่อประโยค"
  ครูพิมพ์ว่า "ออกเสียงไม่ชัด"
  → ข้อความครูอยู่ในมิติ "ความชัดของการออกเสียง" (นักเรียนพูดได้ แต่ออกเสียงไม่ถูก)
    ส่วนตัวเลือกทั้งสองอยู่ในมิติ "ปริมาณคำพูด" → คนละมิติ ไม่มีอันไหนเท่ากัน
  → ต้องตอบ {"suggestedLevel": null, "confidence": "low", "rationale": "ครูบรรยายความชัดของการออกเสียง ซึ่งไม่ตรงกับตัวเลือกที่มีอยู่ กรุณาเลือกเอง"}
  (ห้ามตอบ "ไม่พูด ใช้ท่าทางสื่อสาร" เพียงเพราะเป็นอันที่ใกล้ที่สุดในรายการ)

กฎ:
1. เลือก value ได้เพียงหนึ่งค่าจากรายการข้างบนเท่านั้น หรือคืน null ถ้าไม่มีค่าใดบรรยายความสามารถเดียวกัน หรือข้อความกำกวมเกินจะตัดสิน
2. ห้ามเดา ห้ามสร้าง value ใหม่ ห้ามเลือกค่าที่ใกล้เคียงถ้าไม่มั่นใจ — ความปลอดภัยสำคัญกว่าการตอบให้ได้
3. confidence = "high" เมื่อข้อความชี้ชัดว่าเป็นความสามารถเดียวกับ label ค่านั้น, = "low" เมื่อคลุมเครือ ตีความได้หลายทาง หรือข้อมูลไม่พอ
   ถ้า suggestedLevel เป็น null ต้องเป็น "low" เสมอ
4. rationale = เหตุผลสั้น 1 ประโยคภาษาไทย ว่าทำไมเลือกค่านี้ (หรือทำไมถึง null)
5. ห้ามคัดลอกชื่อคน เลขบัตร หรือข้อมูลส่วนตัวใด ๆ ลงใน rationale — อ้างถึงเด็กว่า "นักเรียน" เท่านั้น
6. ตอบเป็น JSON อย่างเดียว ไม่มีข้อความอื่น:
   { "suggestedLevel": "<value หรือ null>", "confidence": "high" | "low", "rationale": "<ข้อความไทยสั้น>" }

คำบรรยายจากครู:
"""${params.freeText}"""`;
}

/**
 * ✅ ชั้นป้องกันสำคัญ: แปลงข้อความดิบจาก LLM → AbilityClassification ที่เชื่อถือได้
 *
 * ค่าที่ไม่อยู่ในชุดตัวเลือกจริง (AI มั่ว / สะกดเพี้ยน / คืน label แทน value)
 * ถูกบังคับเป็น null + confidence "low" เสมอ — export ไว้ให้ test ยิงตรงได้
 */
export function parseClassification(
  rawText: string,
  options: AbilityOption[],
  domain: string
): AbilityClassification {
  const cleaned = (rawText ?? "").replace(/```json|```/g, "").trim();

  let parsed: { suggestedLevel?: unknown; confidence?: unknown; rationale?: unknown };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("classifier: JSON parse failed. Raw output:", rawText);
    return unresolved(domain, "ระบบอ่านผลลัพธ์ของ AI ไม่สำเร็จ กรุณาเลือกระดับเอง");
  }

  const rationale =
    typeof parsed.rationale === "string" && parsed.rationale.trim()
      ? // กันครูเผลอพิมพ์ชื่อแล้ว AI คัดลอกกลับมาใน rationale
        scrubFreeText(parsed.rationale.trim())
      : "";

  const allowed = new Set(options.map((o) => o.value));
  const suggested =
    typeof parsed.suggestedLevel === "string" ? parsed.suggestedLevel.trim() : null;

  if (!suggested || !allowed.has(suggested)) {
    if (suggested) {
      console.warn("ทิ้งค่าระดับความสามารถที่ไม่อยู่ในตัวเลือกจริง:", suggested);
    }
    return unresolved(
      domain,
      rationale || "ข้อความยังไม่ชัดพอจะจับคู่กับระดับใดได้ กรุณาเลือกเอง"
    );
  }

  return {
    domain,
    suggestedLevel: suggested,
    // ค่าอื่นนอกจาก "high" ถือเป็น low ไว้ก่อน — ครูต้องยืนยัน
    confidence: parsed.confidence === "high" ? "high" : "low",
    rationale,
  };
}

/** ความยาวขั้นต่ำของคำที่ยอมให้ mock ใช้จับคู่ — สั้นกว่านี้กำกวมเกินไป */
const MIN_TOKEN_LENGTH = 5;

/** ตัดคำจาก label ไทยแบบหยาบๆ — ใช้เฉพาะ mock ไม่เกี่ยวกับของจริง */
function labelTokens(label: string): string[] {
  return label
    .split(/[\s/()]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= MIN_TOKEN_LENGTH);
}

/**
 * mock ของ classifier — จับคู่คำจาก label แบบตรงตัว (ไม่มี AI)
 *
 * ใช้ตอน dev/test ที่ไม่มี API key เท่านั้น เจตนาให้ "ขี้ระแวง":
 * ต้องมีตัวเลือกเดียวที่ชนะขาดถึงจะกล้าเสนอ เสมอกัน/ไม่โดนเลย → null + low
 */
function classifyByKeyword(
  options: AbilityOption[],
  freeText: string,
  domain: string
): AbilityClassification {
  const haystack = freeText.replace(/\s+/g, "");

  const scored = options.map((o) => ({
    option: o,
    score: labelTokens(o.label).filter((t) => haystack.includes(t)).length,
  }));

  const ranked = [...scored].sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const runnerUp = ranked[1];

  if (!best || best.score === 0) {
    return unresolved(domain, "[MOCK] ข้อความยังไม่ชี้ชัดว่าตรงกับระดับใด กรุณาเลือกเอง");
  }
  if (runnerUp && runnerUp.score === best.score) {
    return unresolved(domain, "[MOCK] ข้อความเข้าได้หลายระดับพอๆ กัน กรุณาเลือกเอง");
  }

  return {
    domain,
    suggestedLevel: best.option.value,
    confidence: "high",
    rationale: `[MOCK] คำบรรยายของครูตรงกับลักษณะ "${best.option.label}" ของนักเรียน`,
  };
}

/**
 * แปลงข้อความอิสระ → ค่า enum ระดับความสามารถ (ข้อเสนอเท่านั้น ครูตัดสิน)
 *
 * รับประกัน: suggestedLevel เป็นค่าใน ABILITY_OPTIONS[disabilityType] ของ domain นั้น
 * หรือ null เสมอ — ไม่มีทางคืนค่าที่ retrieval ไม่รู้จัก
 */
export async function classifyAbility(
  disabilityType: string,
  domain: string,
  freeText: string
): Promise<AbilityClassification> {
  const options = getDomainOptions(disabilityType, domain);
  if (options.length === 0) {
    return unresolved(domain, "ยังไม่มีตัวเลือกระดับความสามารถของด้านนี้ในระบบ");
  }
  if (!freeText?.trim()) {
    return unresolved(domain, "ยังไม่มีข้อความให้ตีความ");
  }

  // 🔒 PII ชั้นที่ 1: ล้าง pattern ที่น่าจะเป็นชื่อ/เลขบัตร/เบอร์ ออกจากข้อความครู
  const scrubbed = scrubFreeText(freeText.trim());

  // 🔒 PII ชั้นที่ 2: ประกอบ payload ตาม whitelist (ข้อความครูอยู่ในช่อง strengths)
  const safePayload = buildLLMSafePayload({
    disabilityType,
    abilityLevels: {},
    strengths: scrubbed,
  });
  const safeText = safePayload.strengths ?? "";

  const prompt = buildClassifierPrompt({
    domainLabel: getDomainLabel(disabilityType, domain),
    options,
    // ใช้ค่าจาก safePayload เท่านั้น — การันตีว่าเป็นข้อความที่ผ่าน guard แล้ว
    freeText: safeText,
  });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (process.env.USE_MOCK === "true" || !apiKey) {
    await new Promise((r) => setTimeout(r, 300)); // จำลอง latency ให้เห็น loading state
    return classifyByKeyword(options, safeText, domain);
  }

  const body = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: prompt,
    messages: [{ role: "user", content: "ตอบเป็น JSON ตามรูปแบบที่กำหนดเท่านั้น" }],
  };

  // 🔒 PII ชั้นที่ 3: ตรวจ body จริงที่กำลังจะออกนอกระบบ — throw ถ้าเจอ PII field
  assertNoPII(body, "ability classifier request payload");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("classifier API error:", res.status, detail);
    throw new Error("LLM_ERROR");
  }

  const data = await res.json();
  // thinking block อาจมาก่อน — หยิบ text block ตัวแรกเสมอ ไม่ยึด content[0]
  const rawText: string =
    (data.content ?? []).find((b: { type?: string }) => b?.type === "text")?.text ?? "";

  return parseClassification(rawText, options, domain);
}
