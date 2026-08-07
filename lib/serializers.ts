/**
 * แปลง Prisma model → DTO ที่ส่งให้ frontend
 * รวม logic การคำนวณ isEdited, durationSeconds และ consistency warnings ไว้ที่เดียว
 *
 * ⚠️ consistency warnings เป็น rule-based ล้วน (ห้ามใช้ LLM ตัดสิน)
 *    และเป็นการ "flag เท่านั้น" — ระบบไม่แก้ให้เอง ครูตัดสินใจ (CLAUDE.md §4)
 */

import type { PlanDTO } from "./types";

type GoalRecord = {
  id: string;
  aiOriginal: string;
  finalText: string;
  criterion: string | null;
  timeframe: string | null;
  aiIndicatorCodes: string[];
  finalIndicatorCodes: string[];
  isSelected: boolean;
};

type MediaRecord = {
  id: string;
  item: string;
  category: string;
  code: string | null;
  price: string | null;
  mode: string | null;
  aiReason: string;
  finalReason: string;
  isApproved: boolean;
};

type PlanWithRelations = {
  id: string;
  academicYear: string;
  term: string;
  status: string;
  createdAt: Date;
  finalizedAt: Date | null;
  principalName: string | null;
  responsibleTeacherName: string | null;
  homeroomTeacherName: string | null;
  meetingDate: string | null;
  student: {
    code: string;
    fullName: string | null;
    disabilityType: string;
    gradeLevel: string | null;
  };
  goals: GoalRecord[];
  media: MediaRecord[];
};

// ═════════════════════════════════════════════
// CONSISTENCY RULES — rule-based ล้วน ไม่มี LLM
// ═════════════════════════════════════════════

/** ปีหลักสูตรที่อ้างถึงในเอกสารได้โดยไม่ใช่ปีของแผน เช่น "หลักสูตรแกนกลาง พ.ศ. 2551" */
const CURRICULUM_YEARS = new Set(["2544", "2551", "2560"]);

/** คำที่ถือว่าเป็นเกณฑ์วัดผลได้แม้ไม่มีตัวเลข (เทียบจากแผนจริงใน fewShotExamples) */
const MEASURABLE_WORDS = /ร้อยละ|ทุกครั้ง|ด้วยตนเอง/;

/** คำนำหน้าชื่อเด็ก + ชื่อที่ตามมา — pattern ชุดเดียวกับ scrubFreeText ใน pii-guard */
const CHILD_NAME_PREFIX = /(?:เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.)\s*[ก-ฮเแโใไ]\S*/;

/**
 * เพดานเงินอุดหนุนสื่อ ต่อนักเรียน 1 คน ต่อ "ปีการศึกษา"
 * ยืนยันจาก 2 ทาง: แผนจริงทั้ง 2 ฉบับขอรวมพอดี 2,000 บาท
 * และคู่มือระบบ IEP Online (หน้า 22) เตือนเมื่อยอดเกินจำนวนนี้
 *
 * ⚠️ ระเบียบระบุว่า "แต่ละรายมีวงเงินไม่เกิน ๒,๐๐๐ บาทต่อปี" — หน่วยคือ
 *    นักเรียน 1 คน ต่อ 1 ปีการศึกษา ไม่ใช่ต่อ 1 แผน นักเรียนคนเดียวมีได้
 *    หลายแผนในปีเดียวกัน (เช่น ภาคเรียน 1 และ 2) ยอดต้องรวมข้ามแผน
 *    ไม่งั้นแผนละ 1,500 บาท สองแผนจะผ่านทั้งคู่ทั้งที่รวมแล้ว 3,000 บาท
 *
 *    และเป็น "soft warning" เสมอ เพราะระเบียบต่อท้ายว่า
 *    "เว้นแต่คณะกรรมการ...จะพิจารณาเป็นอย่างอื่น" — คณะกรรมการยกเว้นได้
 */
const MEDIA_BUDGET_CAP_BAHT = 2000;

/** เฉพาะฟิลด์ที่ใช้คิดยอดเงิน — ให้ route select มาแค่นี้พอ ไม่ต้องดึงทั้งแถว */
type PricedMedia = Pick<MediaRecord, "price" | "isApproved">;

/**
 * ยอดสื่อที่อนุมัติแล้วของ "แผนอื่น" ในปีการศึกษาเดียวกัน (ไม่รวมแผนที่กำลัง serialize)
 *
 * ตั้งใจให้ caller เป็นคนหามาให้ ไม่ query เองใน serializer เพราะ:
 *   - GET /api/plans โหลดแผนทั้งหมดของนักเรียนพร้อม media อยู่แล้ว → จัดกลุ่มในหน่วยความจำได้ ไม่ต้อง query เพิ่มเลย
 *   - ถ้า query ในนี้จะกลายเป็น N+1 (1 query ต่อ 1 แผนในลิสต์) และต้อง import prisma
 *     เข้ามาในไฟล์นี้ ทำให้ test-warnings.mjs ที่เป็น unit test ล้วนต้องมี DB
 */
export type AnnualMediaContext = {
  /** ยอดบาทรวมของแผนอื่นในปีเดียวกัน */
  otherPlansApprovedBaht: number;
  /** จำนวนแผนอื่นที่นับรวมมา — ใช้บอกครูว่ายอดมาจากกี่แผน */
  otherPlanCount: number;
  /** รายการที่อนุมัติแล้วแต่ไม่มีราคาในแผนอื่น (บัญชี ก / ขอยืม) */
  otherUncounted: number;
};

/** ค่าเริ่มต้น = ไม่มีแผนอื่น → พฤติกรรมเท่าเดิมทุกประการ (ใช้ใน unit test ที่ไม่มี DB) */
export const EMPTY_ANNUAL: AnnualMediaContext = {
  otherPlansApprovedBaht: 0,
  otherPlanCount: 0,
  otherUncounted: 0,
};

/** ยอดบาทของสื่อที่อนุมัติแล้ว + จำนวนรายการที่ไม่มีราคา (ไม่นับเข้ายอด) */
export function sumApprovedMedia(media: PricedMedia[]): {
  baht: number;
  uncounted: number;
} {
  const approved = media.filter((m) => m.isApproved);
  const prices = approved
    .map((m) => parsePriceBaht(m.price))
    .filter((n): n is number => n !== null);
  return {
    baht: prices.reduce((sum, n) => sum + n, 0),
    uncounted: approved.length - prices.length,
  };
}

/**
 * รวมแผนอื่นในปีการศึกษาเดียวกันให้เป็น AnnualMediaContext
 * ผู้เรียกต้องกรองมาแล้วว่าเป็น "นักเรียนคนเดียวกัน + ปีเดียวกัน + ไม่ใช่แผนนี้"
 */
export function buildAnnualContext(
  otherPlansSameYear: { media: PricedMedia[] }[]
): AnnualMediaContext {
  let baht = 0;
  let uncounted = 0;
  for (const p of otherPlansSameYear) {
    const s = sumApprovedMedia(p.media);
    baht += s.baht;
    uncounted += s.uncounted;
  }
  return {
    otherPlansApprovedBaht: baht,
    otherPlanCount: otherPlansSameYear.length,
    otherUncounted: uncounted,
  };
}

/**
 * จัดกลุ่มแผนที่โหลดมาแล้ว → AnnualMediaContext ของแต่ละแผน (คีย์ = plan.id)
 *
 * ใช้ใน GET /api/plans ซึ่งโหลดแผนทั้งหมดพร้อม media มาแล้ว จึงคิดยอดทั้งปี
 * ได้ในหน่วยความจำ ไม่ต้อง query เพิ่มต่อแผน (ถ้า query ในลูป = N+1)
 *
 * จับคู่ด้วย studentId + academicYear — คนละนักเรียนหรือคนละปีจะไม่ถูกรวมกัน
 * แยกเป็นฟังก์ชัน pure เพื่อให้ test-warnings.mjs พิสูจน์ข้อนั้นได้โดยไม่ต้องมี DB
 */
export function buildAnnualContextsByPlan<
  T extends { id: string; studentId: string; academicYear: string; media: PricedMedia[] }
>(plans: T[]): Map<string, AnnualMediaContext> {
  const key = (p: T) => `${p.studentId}::${p.academicYear}`;

  const groups = new Map<string, T[]>();
  for (const p of plans) {
    const group = groups.get(key(p));
    if (group) group.push(p);
    else groups.set(key(p), [p]);
  }

  return new Map(
    plans.map((p) => [
      p.id,
      buildAnnualContext((groups.get(key(p)) ?? []).filter((o) => o.id !== p.id)),
    ])
  );
}

const goalPreview = (g: GoalRecord) => g.finalText.slice(0, 30);

function thaiDigitsToArabic(text: string): string {
  return text.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
}

/**
 * หาปี พ.ศ. (25xx) ในข้อความที่ไม่ตรงกับปีการศึกษาของแผน
 * ปีที่ยอมรับ: ปีการศึกษาเอง และปีถัดไป (แผนปี 2568 สิ้นสุด 31 มี.ค. 2569)
 * ยกเว้นปีหลักสูตรใน CURRICULUM_YEARS
 */
export function findMismatchedYears(text: string, academicYear: string): string[] {
  const ay = Number(academicYear);
  if (!Number.isInteger(ay)) return [];
  const allowed = new Set([String(ay), String(ay + 1)]);
  const years = thaiDigitsToArabic(text).match(/(?<!\d)25\d{2}(?!\d)/g) ?? [];
  return Array.from(new Set(years)).filter((y) => !allowed.has(y) && !CURRICULUM_YEARS.has(y));
}

/** ข้อความมีตัวเลข (อารบิก/ไทย) หรือคำเกณฑ์ที่ยอมรับได้ไหม */
export function hasMeasurableNumber(text: string): boolean {
  return /[0-9๐-๙]/.test(text) || MEASURABLE_WORDS.test(text);
}

/** หาคำนำหน้าชื่อเด็ก+ชื่อ ในข้อความเป้าหมาย — คืน string ที่เจอ หรือ null */
export function findChildNamePrefix(text: string): string | null {
  const m = text.match(CHILD_NAME_PREFIX);
  return m ? m[0] : null;
}

/**
 * ราคาจากคู่มือเป็น string มีหน่วยห้อยท้าย → ตัวเลขบาท
 *   "250 บาท" → 250 | "1,250 บาท/ชุด" → 1250 | "110 บาท / เล่ม" → 110
 *   null / รูปแบบที่อ่านไม่ออก → null (ไม่นับเข้ายอดรวม)
 *
 * ⚠️ anchor ที่ต้นสตริงเสมอ — หน่วยท้ายราคามีตัวเลขปนได้ ("23 บาท/12 แท่ง")
 *    ถ้าจับตัวเลขลอย ๆ จะได้จำนวนแท่งมาแทนราคา
 */
export function parsePriceBaht(price: string | null): number | null {
  if (!price) return null;
  const m = thaiDigitsToArabic(price).match(/^\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** 1250 → "1,250" — เขียนเองแทน toLocaleString เพื่อให้ผลเท่ากันทุก environment */
function formatBaht(n: number): string {
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** กฎ 1 (ร้ายแรงสุด): ปี พ.ศ. ในเป้าหมายไม่ตรงกับปีการศึกษาของแผน — มักติดมาจากแผนปีก่อน */
function checkYearMismatch(goals: GoalRecord[], academicYear: string): string[] {
  const warnings: string[] = [];
  for (const g of goals) {
    const text = [g.finalText, g.criterion, g.timeframe].filter(Boolean).join(" ");
    for (const year of findMismatchedYears(text, academicYear)) {
      warnings.push(
        `เป้าหมาย "${goalPreview(g)}..." ระบุปี พ.ศ. ${year} ไม่ตรงกับปีการศึกษา ${academicYear} ของแผน — อาจติดมาจากแผนปีก่อน`
      );
    }
  }
  return warnings;
}

/**
 * กฎ 1.5 (ร้ายแรงรองจากปีผิด): ยอดสื่อที่อนุมัติ "รวมทั้งปีการศึกษา" เกิน 2,000 บาท/คน/ปี
 *
 * อยู่สูงเพราะเป็น "กฎแข็ง" ของระบบต้นทาง ไม่ใช่ดุลยพินิจ — ยอดเกินแล้วระบบ
 * IEP Online เตือนและเบิกไม่ผ่าน ครูต้องรู้ก่อนพิมพ์เอกสารให้คณะกรรมการเซ็น
 *
 * ⚠️ นับรวมทุกแผนของนักเรียนคนนี้ในปีการศึกษาเดียวกัน ไม่ใช่แค่แผนนี้แผนเดียว
 *    (ดูเหตุผลที่ MEDIA_BUDGET_CAP_BAHT) ยอดของแผนอื่นมาทาง annual ซึ่ง route
 *    เป็นคนหามาให้ ค่าเริ่มต้นคือ 0 = ไม่มีแผนอื่น
 *
 * แต่ยังใช้โทนคำถามตาม CLAUDE.md §4 — ระบบไม่ตัดรายการให้เอง
 * เพราะ "ตัดอันไหนออก" เป็นการตัดสินใจเชิงวิชาชีพของครู ไม่ใช่ของระบบ
 * และคณะกรรมการยกเว้นเพดานได้ จึงเป็น warning ไม่ใช่ block
 *
 * รายการที่ price = null ไม่นับเข้ายอด (บัญชี ก / ขอยืม = ไม่ได้ขอเงินอุดหนุน)
 * แต่บอกจำนวนไว้ในข้อความ ครูจะได้รู้ว่ายอดนี้ยังไม่ครบทุกรายการ
 */
function checkMediaBudgetCap(
  media: MediaRecord[],
  annual: AnnualMediaContext
): string[] {
  const here = sumApprovedMedia(media);
  const total = here.baht + annual.otherPlansApprovedBaht;
  if (total <= MEDIA_BUDGET_CAP_BAHT) return [];

  const uncounted = here.uncounted + annual.otherUncounted;
  const note =
    uncounted > 0 ? ` (ยังไม่รวมอีก ${uncounted} รายการที่ไม่มีราคา เช่น บัญชี ก / ขอยืม)` : "";

  // มีแผนอื่นในปีเดียวกัน → บอกที่มาของยอดให้ครูตรวจได้ว่ามาจากไหนบ้าง
  const scope =
    annual.otherPlanCount > 0
      ? `รวมราคาสื่อที่อนุมัติแล้วทั้งปีการศึกษา ${formatBaht(total)} บาท ` +
        `(แผนนี้ ${formatBaht(here.baht)} บาท + อีก ${annual.otherPlanCount} แผนในปีเดียวกัน ` +
        `${formatBaht(annual.otherPlansApprovedBaht)} บาท)`
      : `รวมราคาสื่อที่อนุมัติแล้ว ${formatBaht(total)} บาท`;

  return [
    `${scope} เกินเพดาน ${formatBaht(MEDIA_BUDGET_CAP_BAHT)} บาท/คน/ปี ของระบบ IEP Online ` +
      `อยู่ ${formatBaht(total - MEDIA_BUDGET_CAP_BAHT)} บาท${note} — ` +
      `เพดานนี้นับรวมทั้งปีการศึกษา ไม่ใช่ต่อแผน (คณะกรรมการพิจารณายกเว้นได้) ` +
      `ตัดรายการออก หรือเปลี่ยนบางรายการเป็นขอยืมก่อนสรุปแผนไหม?`,
  ];
}

/** กฎ 2: สื่อที่อนุมัติแล้วแต่ช่องเหตุผลว่าง — แบบฟอร์มขอรับเงินอุดหนุนต้องกรอกทุกรายการ */
function checkApprovedMediaReason(media: MediaRecord[]): string[] {
  return media
    .filter((m) => m.isApproved && m.finalReason.trim() === "")
    .map(
      (m) =>
        `สื่อ "${m.item}" อนุมัติแล้วแต่ยังไม่มีเหตุผลและความจำเป็น — แบบฟอร์มขอรับเงินอุดหนุนต้องกรอกช่องนี้ทุกรายการ`
    );
}

/**
 * กฎ 2.5: สื่อที่อนุมัติแล้วแต่ไม่มีรหัสตามคู่มือ
 * เกิดกับแผนที่สร้างก่อนระบบอ้างอิงคู่มือ 2568 (PlanMedia.code เป็น null)
 * รวมเป็น warning เดียวไม่แยกรายการ — ไม่งั้นแผนเก่าจะขึ้นเตือนท่วมหน้าจอ
 */
function checkMediaCode(media: MediaRecord[]): string[] {
  const missing = media.filter((m) => m.isApproved && !m.code?.trim());
  if (missing.length === 0) return [];
  return [
    `สื่อ ${missing.length} รายการยังไม่มีรหัสตามคู่มือ พ.ศ. 2568 (${missing[0].item}${missing.length > 1 ? " ฯลฯ" : ""}) — แผนนี้สร้างก่อนระบบอ้างอิงคู่มือ ต้องกรอกช่องรหัสด้วยมือในแบบฟอร์มเบิก`,
  ];
}

/** กฎ 3: มีชื่อเด็กในข้อความเป้าหมาย — ระบบเติมชื่อจริงให้ตอน export อยู่แล้ว ควรใช้คำว่า "นักเรียน" */
function checkChildNameInGoals(goals: GoalRecord[]): string[] {
  const warnings: string[] = [];
  for (const g of goals) {
    const found = findChildNamePrefix(g.finalText);
    if (found) {
      warnings.push(
        `เป้าหมาย "${goalPreview(g)}..." มีคำนำหน้าชื่อเด็ก ("${found.slice(0, 20)}") — ควรใช้คำว่า "นักเรียน" แทน ระบบจะเติมชื่อจริงให้เองตอน export`
      );
    }
  }
  return warnings;
}

/** กฎเดิม: เป้าหมายที่ยังไม่มี criterion / timeframe */
function checkGoalCompleteness(goals: GoalRecord[]): string[] {
  const warnings: string[] = [];
  for (const g of goals) {
    if (!g.criterion) warnings.push(`เป้าหมาย "${goalPreview(g)}..." ยังไม่มีเกณฑ์วัดผล`);
    if (!g.timeframe) warnings.push(`เป้าหมาย "${goalPreview(g)}..." ยังไม่มีกรอบเวลา`);
  }
  return warnings;
}

/** กฎเดิม: ยังไม่ได้เลือกเป้าหมายที่จะใช้จริง */
function checkGoalSelected(goals: GoalRecord[]): string[] {
  return goals.some((g) => g.isSelected) ? [] : ["ยังไม่ได้เลือกเป้าหมายที่จะใช้จริง"];
}

/**
 * กฎเดิม (ไม่มีสื่อเลย) + กฎใหม่ (เลือกเป้าหมายแล้วแต่สื่อถูกเอาออกจากการเบิกหมด)
 * isApproved default = true โดยตั้งใจ (ดู CLAUDE.md §6) — สื่อมาจาก retrieval
 * ที่ verified แล้วจึงเสนอแบบพร้อมเบิก กฎนี้จึง fire เฉพาะตอนครูเอาออกเอง
 * ครบทุกรายการ = การกระทำที่ตั้งใจ → โทนคำถามยืนยัน ไม่ใช่โทน "ลืมทำ"
 */
function checkMediaApproval(goals: GoalRecord[], media: MediaRecord[]): string[] {
  if (media.length === 0) {
    return ["ยังไม่มีรายการสื่อที่แนะนำ — ตรวจสอบว่าเลือกระดับความสามารถครบหรือยัง"];
  }
  if (goals.some((g) => g.isSelected) && !media.some((m) => m.isApproved)) {
    return [
      "สื่อถูกเอาออกจากการเบิกครบทุกรายการ — แผนนี้ไม่ต้องเบิกสื่อเลยใช่ไหม? ถ้ายังต้องใช้ เลือกกลับก่อนสรุปแผน",
    ];
  }
  return [];
}

/**
 * กฎ 5 (เบาสุด — โทนคำถาม ไม่ใช่โทนผิดพลาด):
 * เกณฑ์วัดผลไม่มีตัวเลขทั้งใน criterion และ finalText
 * เป้าหมายเชิงคุณภาพบางแบบถูกต้องโดยไม่มีตัวเลข (เช่น "ลดความช่วยเหลือ...น้อยลง")
 * จึงตั้งเป็นคำถามให้ครูทบทวน ไม่ใช่บอกว่าผิด
 * ข้าม goal ที่ criterion เป็น null — กฎเดิม (ยังไม่มีเกณฑ์วัดผล) ครอบคลุมอยู่แล้ว
 */
function checkMeasurableCriterion(goals: GoalRecord[]): string[] {
  const warnings: string[] = [];
  for (const g of goals) {
    if (!g.criterion) continue;
    if (!hasMeasurableNumber(`${g.criterion} ${g.finalText}`)) {
      warnings.push(
        `เป้าหมาย "${goalPreview(g)}..." — เกณฑ์วัดผลยังไม่มีตัวเลข (แผนจริงมักเขียนเช่น "3 ใน 5 ครั้ง", "ร้อยละ 50") เกณฑ์นี้วัดผลปลายปีได้ชัดเจนหรือยัง?`
      );
    }
  }
  return warnings;
}

/**
 * รวม warning ทุกกฎ เรียงจากร้ายแรงสุด → เบาสุด (ครูอ่านจากบนลงล่าง)
 * export ไว้ให้ scripts/test-warnings.mjs ทดสอบตรงได้โดยไม่ต้องเปิด server
 *
 * annual = ยอดสื่อของแผนอื่นในปีการศึกษาเดียวกัน (route เป็นคนหามาให้)
 * ไม่ส่งมา = ไม่มีแผนอื่น → ผลลัพธ์เท่าเดิมทุกประการ
 */
export function buildConsistencyWarnings(
  plan: Pick<PlanWithRelations, "academicYear" | "goals" | "media">,
  annual: AnnualMediaContext = EMPTY_ANNUAL
): string[] {
  return [
    ...checkYearMismatch(plan.goals, plan.academicYear),
    ...checkMediaBudgetCap(plan.media, annual),
    ...checkApprovedMediaReason(plan.media),
    ...checkMediaCode(plan.media),
    ...checkChildNameInGoals(plan.goals),
    ...checkGoalCompleteness(plan.goals),
    ...checkGoalSelected(plan.goals),
    ...checkMediaApproval(plan.goals, plan.media),
    ...checkMeasurableCriterion(plan.goals),
  ];
}

export function toPlanDTO(
  plan: PlanWithRelations,
  annual: AnnualMediaContext = EMPTY_ANNUAL
): PlanDTO {
  const warnings = buildConsistencyWarnings(plan, annual);

  const durationSeconds = plan.finalizedAt
    ? Math.round((plan.finalizedAt.getTime() - plan.createdAt.getTime()) / 1000)
    : null;

  return {
    id: plan.id,
    studentCode: plan.student.code,
    studentFullName: plan.student.fullName,
    disabilityType: plan.student.disabilityType as PlanDTO["disabilityType"],
    gradeLevel: plan.student.gradeLevel,
    academicYear: plan.academicYear,
    term: plan.term,
    status: plan.status as PlanDTO["status"],
    createdAt: plan.createdAt.toISOString(),
    finalizedAt: plan.finalizedAt?.toISOString() ?? null,
    durationSeconds,
    // DTO ประกาศเป็น optional (string | undefined) แต่ Prisma คืน null → แปลงให้ตรงกัน
    principalName: plan.principalName ?? undefined,
    responsibleTeacherName: plan.responsibleTeacherName ?? undefined,
    homeroomTeacherName: plan.homeroomTeacherName ?? undefined,
    meetingDate: plan.meetingDate ?? undefined,
    goals: plan.goals.map((g) => ({
      id: g.id,
      aiOriginal: g.aiOriginal,
      finalText: g.finalText,
      criterion: g.criterion,
      timeframe: g.timeframe,
      // ?? [] — แผนที่สร้างก่อนมีฟีเจอร์นี้ไม่มีค่า (Prisma คืน [] อยู่แล้ว แต่กันข้อมูลเก่าที่ dump มาจากที่อื่น)
      aiIndicatorCodes: g.aiIndicatorCodes ?? [],
      finalIndicatorCodes: g.finalIndicatorCodes ?? [],
      isSelected: g.isSelected,
      isEdited: g.aiOriginal.trim() !== g.finalText.trim(),
    })),
    media: plan.media.map((m) => ({
      id: m.id,
      code: m.code,
      item: m.item,
      category: m.category as PlanDTO["media"][number]["category"],
      price: m.price,
      mode: m.mode as PlanDTO["media"][number]["mode"],
      aiReason: m.aiReason,
      finalReason: m.finalReason,
      isApproved: m.isApproved,
      isEdited: m.aiReason.trim() !== m.finalReason.trim(),
    })),
    consistencyWarnings: warnings,
  };
}
