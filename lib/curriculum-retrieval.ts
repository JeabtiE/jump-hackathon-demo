/**
 * CURRICULUM RETRIEVAL LAYER — คน A ดูแล
 *
 * 🔑 หลักการเดียวกับ lib/retrieval.ts: ชั้นนี้ไม่มี AI เลย เป็นแค่ lookup จาก curriculum.json
 *    รหัสตัวชี้วัดอ้างถึงหลักสูตรแกนกลางฉบับจริง ผิดไปตัวเดียวเอกสารก็ใช้ไม่ได้
 *    LLM เห็นเฉพาะตัวชี้วัดที่ retrieve มาจากที่นี่ และห้ามคิดรหัสเอง (CLAUDE.md §4)
 *
 * ที่มาข้อมูล: data/curriculum.json (สกัดจาก PDF ทางการ สพฐ. ด้วย scripts/parse_curriculum.py)
 * ขอบเขต: ป.1-6 เท่านั้น ตามที่ครูยืนยันว่านักเรียนจริงทั้ง 16 คนอยู่ระดับประถม
 */

import curriculumRaw from "@/data/curriculum.json";
import type { AbilityLevels, CurriculumSubject, IndicatorEntry } from "./types";

type RawStandard = {
  standard: string;
  indicators: { code: string; text: string }[];
  strandText?: string;
};
type RawCurriculum = Record<string, Record<string, RawStandard[]>>;

const curriculum = curriculumRaw as unknown as RawCurriculum;

/**
 * วิชาที่เปิดใช้จริง
 *
 * 🚧 TODO — "math" ยังไม่ผ่านการตรวจจากครู (ณ 7 ส.ค. 2569)
 *
 *    ข้อความตัวชี้วัดคณิตทั้ง 116 รายการเคยเสียจาก font ใน math.pdf ต้นทาง
 *    (สระ "า" กลายเป็น "ำ" ทุกตัว) ซ่อมด้วย scripts/fix_math_curriculum_text.mjs
 *    ไปแล้ว 109 รายการ เทสต์ regression ผ่าน — นั่นคือ "โค้ดพร้อมใช้"
 *
 *    แต่ยังไม่มีครูการศึกษาพิเศษอ่านยืนยันว่าสะกดถูกจริงทุกคำ
 *    (docs/math-curriculum-review.md ยังไม่ได้ส่งให้ครู) = "ข้อมูลยังไม่ได้รับการยืนยัน"
 *    สองเรื่องนี้ไม่เท่ากัน อย่าเอาผลเทสต์ที่ผ่านมาสรุปว่าข้อมูลถูกต้องแล้ว
 *
 *    ก่อนให้ครูใช้งานจริง: ถ้ายังไม่มีคำตอบจากครู ให้ลบ "math" ออกจาก array นี้
 *    (แก้บรรทัดเดียว ระบบกลับไปทำงานเฉพาะภาษาไทยซึ่งข้อมูลสะอาดแน่นอน)
 *    ถ้าครูตรวจแล้วเจอคำผิด: แก้ตาราง RESTORE ในสคริปต์แล้วรันใหม่
 *    อย่าแก้ data/curriculum.json ด้วยมือ เพราะสคริปต์จะเขียนทับ
 */
const ENABLED_SUBJECTS: CurriculumSubject[] = ["thai", "math"];

/**
 * จำนวนชั้นสูงสุดที่ retrieve พร้อมกันเมื่อ includeLowerGrades = true
 * 3 = ชั้นที่เรียนอยู่ + ต่ำกว่า 2 ชั้น (เช่น ป.4 → ป.2, ป.3, ป.4)
 *
 * เหตุผล: แผน IEP จริงมักปรับตัวชี้วัดจากชั้นที่ต่ำกว่าที่นักเรียนลงทะเบียน
 * ถ้าเสนอเฉพาะชั้นที่เรียนอยู่ ครูจะใช้ไม่ได้เลยกับเด็กที่ห่างจากระดับชั้นมาก
 * แต่ถ้าเปิดหมดทุกชั้น prompt จะยาวและ LLM มีตัวเลือกกว้างเกินจนจับคู่มั่ว
 *
 * ⚠️ การย้อนชั้นปีใช้ได้กับ "วิชาที่ใช้สติปัญญา" เท่านั้น — ครูยืนยัน (7 ส.ค. 2569):
 *
 *      "วิชาที่ใช้ความสามารถทางกาย เช่น พละศึกษา จะไม่ค่อยได้ย้อนชั้นปี
 *       จะใช้ชั้นปีจริงเลยเพราะเด็กทำได้ แต่ถ้าเป็นวิชาที่ใช้สติปัญญา
 *       มักจะได้ย้อนชั้นปีตัวชี้วัด"
 *
 *    แปลว่าเด็กที่ตามวิชาการไม่ทัน อาจทำพละ/ศิลปะ/การงานได้ตามชั้นจริงของตัวเอง
 *    การย้อนชั้นให้วิชาพวกนี้เท่ากับประเมินเด็กต่ำกว่าความเป็นจริง
 *
 *    ตอนนี้ระบบยังไม่ผิดกฎข้อนี้ เพราะ ENABLED_SUBJECTS มีแค่ thai/math
 *    ซึ่งเป็นวิชาสติปัญญาทั้งคู่ → ย้อนชั้นได้ถูกต้องแล้ว
 *    การป้องกันชั้นที่สองอยู่ที่ DOMAIN_TO_SUBJECT (ดูคอมเมนต์ตรงนั้น)
 *
 *    🔑 ถ้าจะเพิ่มวิชาที่ใช้ความสามารถทางกาย (พละ ศิลปะ การงาน) เข้ามา
 *       ห้ามใส่แล้วปล่อยให้ใช้ GRADE_SPAN ร่วมกัน ต้องแยกให้วิชากลุ่มนั้น
 *       includeLowerGrades = false เสมอ ไม่ใช่ค่า default ของทั้งระบบ
 */
const GRADE_SPAN = 3;

/**
 * วิชาที่ย้อนชั้นปีได้ (วิชาที่ใช้สติปัญญา ตามคำยืนยันของครูที่ GRADE_SPAN)
 *
 * ตอนนี้เท่ากับ ENABLED_SUBJECTS พอดี — ประกาศแยกไว้เพื่อให้ตอนเพิ่มวิชาใหม่
 * คนเพิ่มต้องตัดสินใจอย่างตั้งใจว่าวิชานั้นอยู่กลุ่มไหน ไม่ใช่ได้ย้อนชั้นไปโดยปริยาย
 */
const GRADE_SPAN_SUBJECTS: readonly CurriculumSubject[] = ["thai", "math"];

/** ลำดับชั้น — index ใช้คำนวณช่วงชั้นใน retrieveIndicators */
const GRADE_ORDER = ["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6"];

/**
 * ด้านความสามารถใน AbilityLevels → กลุ่มสาระ
 *
 * 🔒 ตารางนี้คือด่านแรกที่กัน "ด้านที่ไม่ใช่วิชาการ" ออกจากการอ้างตัวชี้วัด
 *
 *    ยืนยันแล้วว่ามีแค่ 3 key: reading/writing → thai, math → math
 *    ส่วน communication / behavior / selfHelp ตั้งใจไม่ใส่ ไม่ใช่ลืม
 *    → subjectsFromAbilityLevels() คืน [] → retrieveIndicators() คืน []
 *    → เป้าหมายกลุ่มทักษะจึงไม่มีทางแตะ GRADE_SPAN ตั้งแต่ต้นทาง
 *
 *    ตรงกับโครงสร้างแผนจริง: ส่วนที่ 5 แยก "ทักษะ" (ช่วยเหลือตนเอง สื่อสาร
 *    สังคม กล้ามเนื้อ) ออกจาก "วิชาการที่อ้างมาตรฐานตัวชี้วัด" (CLAUDE.md §14)
 *    และตรงกับกฎ "ตัวชี้วัดว่างเป็นคำตอบที่ถูกต้อง" (CLAUDE.md §4)
 *
 *    ⚠️ การเพิ่ม key ที่นี่ = เปิดให้ด้านนั้นดึงตัวชี้วัดได้ ต้องเช็คก่อนว่า
 *       วิชาปลายทางย้อนชั้นปีได้ไหม (ดู GRADE_SPAN_SUBJECTS)
 */
const DOMAIN_TO_SUBJECT: Record<string, CurriculumSubject> = {
  reading: "thai",
  writing: "thai",
  math: "math",
};

export const SUBJECT_LABEL: Record<CurriculumSubject, string> = {
  thai: "ภาษาไทย",
  math: "คณิตศาสตร์",
};

/** ๑๒๓ → 123 (dropdown บางที่กรอกเลขไทย) */
function thaiDigitsToArabic(text: string): string {
  return text.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
}

/**
 * รับได้ทุกรูปแบบที่มีในระบบ → คืน key ที่ตรงกับ curriculum.json
 * "ป1" (ค่าจาก StudentPicker) | "ป.1" | "ป. ๑" | "ประถมศึกษาปีที่ 1" → "ป.1"
 *
 * ทำฝั่งเราแทนที่จะให้คน B แก้ dropdown — ข้อมูลนักเรียนที่บันทึกไปแล้วจะได้ไม่ต้อง migrate
 */
export function normalizeGradeLevel(raw?: string | null): string | null {
  if (!raw) return null;
  const s = thaiDigitsToArabic(raw).replace(/\s/g, "");
  const m = s.match(/^(?:ป\.?|ประถมศึกษาปีที่)([1-6])$/);
  return m ? `ป.${m[1]}` : null;
}

/** วิชาที่ระบบมีข้อมูลพร้อมใช้จริง — ให้ UI สร้างตัวเลือกตรงกับข้อมูล */
export function getAvailableSubjects(): CurriculumSubject[] {
  return [...ENABLED_SUBJECTS];
}

/**
 * เดากลุ่มสาระจากด้านความสามารถที่ครูเลือกอยู่แล้ว
 * → ไม่ต้องเพิ่มช่องในฟอร์มประเมิน (ครูกรอกเท่าเดิม แต่ได้ตัวชี้วัดเพิ่ม)
 */
export function subjectsFromAbilityLevels(abilityLevels: AbilityLevels): CurriculumSubject[] {
  const found = new Set<CurriculumSubject>();

  for (const [domain, level] of Object.entries(abilityLevels)) {
    if (!level) continue;
    const subject = DOMAIN_TO_SUBJECT[domain];
    if (subject) found.add(subject);
  }

  // เรียงตาม ENABLED_SUBJECTS เสมอ เพื่อให้ลำดับใน prompt คงที่ทุกครั้ง
  return ENABLED_SUBJECTS.filter((s) => found.has(s));
}

/**
 * 🔑 RETRIEVAL — ตัวชี้วัดที่ใช้อ้างอิงได้ ตัดสินด้วยกฎล้วน ไม่มี AI
 *
 * @returns ตัวชี้วัดเรียงตามวิชา → ชั้น (ต่ำ→สูง) → ลำดับในหลักสูตร ไม่มีรหัสซ้ำ
 */
export function retrieveIndicators(params: {
  subjects: CurriculumSubject[];
  gradeLevel: string;
  /** รวมชั้นที่ต่ำกว่าด้วย (สูงสุด GRADE_SPAN ชั้น) — default true */
  includeLowerGrades?: boolean;
  /** จำกัดเฉพาะบางมาตรฐาน เช่น ["ท 1.1"] — ไม่ระบุ = ทุกมาตรฐาน */
  standards?: string[];
}): IndicatorEntry[] {
  const { subjects, gradeLevel, includeLowerGrades = true, standards } = params;

  const grade = normalizeGradeLevel(gradeLevel);
  if (!grade) return [];

  const gradeIndex = GRADE_ORDER.indexOf(grade);
  if (gradeIndex < 0) return [];

  const standardFilter = standards?.length ? new Set(standards) : null;
  const results: IndicatorEntry[] = [];
  const seen = new Set<string>();

  for (const subject of ENABLED_SUBJECTS) {
    if (!subjects.includes(subject)) continue;
    const bySubject = curriculum[subject];
    if (!bySubject) continue;

    // ช่วงชั้นคิดแยกรายวิชา ไม่ใช่ค่าเดียวใช้ร่วมกันทั้งแผน
    // วิชาที่ใช้ความสามารถทางกายต้องใช้ชั้นจริงเสมอแม้ผู้เรียกขอย้อนชั้นมา
    // (ดูเหตุผลและคำยืนยันของครูที่ GRADE_SPAN)
    const spanAllowed = includeLowerGrades && GRADE_SPAN_SUBJECTS.includes(subject);
    const from = spanAllowed ? Math.max(0, gradeIndex - (GRADE_SPAN - 1)) : gradeIndex;
    const grades = GRADE_ORDER.slice(from, gradeIndex + 1);

    for (const g of grades) {
      for (const std of bySubject[g] ?? []) {
        if (standardFilter && !standardFilter.has(std.standard)) continue;

        for (const ind of std.indicators) {
          // ตรวจแล้วว่าไม่มีรหัสซ้ำในช่วง ป.1-6 แต่กันไว้เหมือน retrieveMedia
          if (seen.has(ind.code)) continue;
          seen.add(ind.code);
          results.push({
            code: ind.code,
            text: ind.text,
            standard: std.standard,
            subject,
            grade: g,
          });
        }
      }
    }
  }

  return results;
}

/** index รหัส → ตัวชี้วัด สร้างครั้งเดียวตอน import (เฉพาะวิชาที่เปิดใช้) */
const INDICATOR_INDEX: Map<string, IndicatorEntry> = (() => {
  const index = new Map<string, IndicatorEntry>();
  for (const subject of ENABLED_SUBJECTS) {
    for (const [grade, standardList] of Object.entries(curriculum[subject] ?? {})) {
      for (const std of standardList) {
        for (const ind of std.indicators) {
          index.set(canonicalCode(ind.code), {
            code: ind.code,
            text: ind.text,
            standard: std.standard,
            subject,
            grade,
          });
        }
      }
    }
  }
  return index;
})();

/** ตัดช่องว่างทั้งหมดออกก่อนเทียบ — LLM/ครูพิมพ์เว้นวรรคไม่เหมือนกัน ("ท 1.1 ป.1/1" = "ท1.1ป.1/1") */
function canonicalCode(code: string): string {
  return thaiDigitsToArabic(code).replace(/\s/g, "");
}

/**
 * 🔒 GATE — กรองรหัสที่ LLM คืนมาให้เหลือเฉพาะที่ระบบส่งไปให้จริง
 *    คู่แฝดของ resolveMediaRecommendations ใน app/api/plans/route.ts
 *    รหัสที่ไม่อยู่ใน eligible ถูกทิ้ง = LLM คิดรหัสเองไม่ได้เลย
 */
export function resolveIndicatorCodes(
  llmCodes: string[] | undefined,
  eligible: IndicatorEntry[]
): IndicatorEntry[] {
  if (!llmCodes?.length) return [];

  const byCode = new Map(eligible.map((e) => [canonicalCode(e.code), e]));
  const resolved: IndicatorEntry[] = [];
  const used = new Set<string>();

  for (const raw of llmCodes) {
    if (typeof raw !== "string") continue;
    const key = canonicalCode(raw);
    const entry = byCode.get(key);
    if (!entry) {
      console.warn("ทิ้งรหัสตัวชี้วัดที่ไม่อยู่ใน retrieval:", raw);
      continue;
    }
    if (used.has(entry.code)) continue;
    used.add(entry.code);
    resolved.push(entry);
  }

  return resolved;
}

/**
 * ใช้ตอน PATCH — ตรวจว่ารหัสมีอยู่จริงในหลักสูตรไหม
 *
 * ⚠️ ตั้งใจไม่ตรวจกับ eligible set ของแผนนั้น: ครูมีสิทธิ์เลือกตัวชี้วัดข้ามชั้น
 *    ด้วยดุลยพินิจของตัวเอง ระบบตรวจแค่ว่า "มีรหัสนี้จริง" ไม่ตัดสินแทนครู (CLAUDE.md §4)
 */
export function isKnownIndicatorCode(code: string): boolean {
  return INDICATOR_INDEX.has(canonicalCode(code));
}

/**
 * รหัส → ตัวชี้วัดเต็ม สำหรับกางข้อความในเอกสาร export
 * รหัสที่หาไม่เจอถูกข้าม (ผู้เรียกยังพิมพ์รหัสดิบได้อยู่แล้ว)
 */
export function lookupIndicators(codes: string[]): IndicatorEntry[] {
  const found: IndicatorEntry[] = [];
  const seen = new Set<string>();

  for (const code of codes) {
    const entry = INDICATOR_INDEX.get(canonicalCode(code));
    if (!entry || seen.has(entry.code)) continue;
    seen.add(entry.code);
    found.push(entry);
  }

  return found;
}
