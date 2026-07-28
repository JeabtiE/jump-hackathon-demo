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
  isSelected: boolean;
};

type MediaRecord = {
  id: string;
  item: string;
  category: string;
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

/** กฎ 2: สื่อที่อนุมัติแล้วแต่ช่องเหตุผลว่าง — แบบฟอร์มขอรับเงินอุดหนุนต้องกรอกทุกรายการ */
function checkApprovedMediaReason(media: MediaRecord[]): string[] {
  return media
    .filter((m) => m.isApproved && m.finalReason.trim() === "")
    .map(
      (m) =>
        `สื่อ "${m.item}" อนุมัติแล้วแต่ยังไม่มีเหตุผลและความจำเป็น — แบบฟอร์มขอรับเงินอุดหนุนต้องกรอกช่องนี้ทุกรายการ`
    );
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
 */
export function buildConsistencyWarnings(
  plan: Pick<PlanWithRelations, "academicYear" | "goals" | "media">
): string[] {
  return [
    ...checkYearMismatch(plan.goals, plan.academicYear),
    ...checkApprovedMediaReason(plan.media),
    ...checkChildNameInGoals(plan.goals),
    ...checkGoalCompleteness(plan.goals),
    ...checkGoalSelected(plan.goals),
    ...checkMediaApproval(plan.goals, plan.media),
    ...checkMeasurableCriterion(plan.goals),
  ];
}

export function toPlanDTO(plan: PlanWithRelations): PlanDTO {
  const warnings = buildConsistencyWarnings(plan);

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
      isSelected: g.isSelected,
      isEdited: g.aiOriginal.trim() !== g.finalText.trim(),
    })),
    media: plan.media.map((m) => ({
      id: m.id,
      item: m.item,
      category: m.category as "ก" | "ข",
      aiReason: m.aiReason,
      finalReason: m.finalReason,
      isApproved: m.isApproved,
      isEdited: m.aiReason.trim() !== m.finalReason.trim(),
    })),
    consistencyWarnings: warnings,
  };
}
