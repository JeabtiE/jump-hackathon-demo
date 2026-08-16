/**
 * ⚠️ ไฟล์นี้คือ CONTRACT ระหว่าง Frontend (คน B) กับ API (คน A)
 *
 * ถ้าจะแก้ไฟล์นี้ → ต้องบอกอีกคนก่อนเสมอ ห้ามแก้เงียบๆ
 * ทั้งคู่ยึด type ในนี้เป็นหลัก จะได้ทำงานคู่ขนานได้โดยไม่ต้องรอกัน
 */

// ═════════════════════════════════════════════
// DOMAIN TYPES
// ═════════════════════════════════════════════

/** ประเภทความพิการ 9 ประเภทตาม สพฐ. */
export type DisabilityType =
  | "visual" // บกพร่องทางการเห็น
  | "hearing" // บกพร่องทางการได้ยิน
  | "intellectual" // บกพร่องทางสติปัญญา
  | "physical" // บกพร่องทางร่างกาย/การเคลื่อนไหว/สุขภาพ
  | "learning" // บกพร่องทางการเรียนรู้ (LD)
  | "speech" // บกพร่องทางการพูดและภาษา
  | "behavioral" // บกพร่องทางพฤติกรรมหรืออารมณ์
  | "autism" // ออทิสติก
  | "multiple"; // พิการซ้อน

/** ด้านความสามารถที่ประเมิน — value ต้องตรงกับ key ใน data/mappingTable.json */
export interface AbilityLevels {
  reading?: string;
  writing?: string;
  math?: string;
  communication?: string;
  behavior?: string;
  selfHelp?: string;
}

/** กลุ่มสาระที่ระบบมีข้อมูลตัวชี้วัด (data/curriculum.json) — ขอบเขต ป.1-6 */
export type CurriculumSubject = "thai" | "math";

/** บัญชี ก = ขอยืม (ไม่มีราคา) | ข = ขอรับเงินอุดหนุน | ค = รับบริการ */
export type MediaCategory = "ก" | "ข" | "ค";

/** วิธีการได้มาตามคู่มือ 2568 — ตรงกับช่อง "วิธีการ" ในแบบฟอร์มส่วนที่ 6 */
export type MediaMode = "ขอรับ" | "ขอยืม" | "รับบริการ";
export type PlanStatus = "draft" | "finalized";

// ═════════════════════════════════════════════
// API: นักเรียน
// ═════════════════════════════════════════════

/**
 * ข้อมูลส่วนบุคคลของนักเรียน
 *
 * 🔒 PII ZONE — เก็บใน DB ได้ ใช้ตอน export เอกสารเท่านั้น
 *    ห้ามส่ง field ในนี้ไป LLM API เด็ดขาด (บังคับโดย lib/pii-guard.ts)
 */
export interface StudentPII {
  /** ชื่อ-นามสกุลจริง เช่น "เด็กชายสมชาย ใจดี" */
  fullName?: string;
  /** เลขประจำตัวประชาชน 13 หลัก */
  nationalId?: string;
  /** เลขทะเบียนคนพิการ */
  disabilityCardNo?: string;
  /** วันเดือนปีเกิด เช่น "5 ต.ค. 2561" */
  birthDate?: string;
  religion?: string;
  /** ลักษณะความพิการแบบละเอียด */
  disabilityDetail?: string;
  fatherName?: string;
  motherName?: string;
  guardianName?: string;
  /** ความเกี่ยวข้อง เช่น "มารดา" */
  guardianRelation?: string;
  address?: string;
  phone?: string;
  schoolName?: string;
  /** สังกัด เช่น "สพป.ชร.เขต1" */
  affiliation?: string;
  /** ข้อมูลทางการแพทย์ */
  medicalNote?: string;
  /** ประวัติการศึกษาที่ผ่านมา */
  educationHistory?: string;
}

/** POST /api/students */
export interface CreateStudentRequest extends StudentPII {
  /** รหัสอ้างอิงที่ครูตั้งเอง เช่น "A-01" */
  code: string;
  disabilityType: DisabilityType;
  gradeLevel?: string;
  note?: string;
}

/** PATCH /api/students/[id] */
export type UpdateStudentRequest = Partial<CreateStudentRequest>;

/** GET /api/students — รายการนักเรียน (ไม่รวม PII เพื่อลดการส่งข้อมูลโดยไม่จำเป็น) */
export interface StudentSummary {
  id: string;
  code: string;
  /** ชื่อจริง — ส่งมาเพื่อให้ครูเลือกนักเรียนได้สะดวก */
  fullName: string | null;
  disabilityType: DisabilityType;
  gradeLevel: string | null;
  planCount: number;
  latestPlanAt: string | null;
}

/** GET /api/students/[id] — รายละเอียดเต็มรวม PII (ใช้ตอนแก้ไขข้อมูลนักเรียน) */
export interface StudentDetail extends StudentPII {
  id: string;
  code: string;
  disabilityType: DisabilityType;
  gradeLevel: string | null;
  note: string | null;
}

// ═════════════════════════════════════════════
// API: สร้างแผน
// ═════════════════════════════════════════════

/**
 * POST /api/plans
 * flow: บันทึก assessment → retrieve สื่อจาก mappingTable → เรียก LLM → บันทึกลง DB
 */
export interface CreatePlanRequest {
  studentId: string;
  abilityLevels: AbilityLevels;
  strengths?: string;
  /** กลุ่มสาระที่ต้องการอ้างตัวชี้วัด — ไม่ระบุ = ระบบดูจาก abilityLevels ให้เอง */
  subjects?: CurriculumSubject[];
  /**
   * ระดับหลักสูตรที่ใช้ปรับตัวชี้วัด เช่น "ป.1" — ไม่ระบุ = ใช้ Student.gradeLevel
   * (เด็กพิเศษมักปรับเป้าหมายจากชั้นที่ต่ำกว่าชั้นที่ลงทะเบียนเรียน)
   */
  curriculumGrade?: string;
  academicYear: string;
  term: string;
  principalName?: string;
  responsibleTeacherName?: string;
  homeroomTeacherName?: string;
  meetingDate?: string; // ISO date string เช่น "2025-07-27"
}

export interface PlanGoalDTO {
  id: string;
  /** ข้อความที่ AI ร่างครั้งแรก (read-only ใช้เทียบว่าครูแก้อะไร) */
  aiOriginal: string;
  /** ข้อความปัจจุบัน (ครูแก้ได้) */
  finalText: string;
  criterion: string | null;
  timeframe: string | null;
  /** รหัสตัวชี้วัดที่ AI เลือกครั้งแรก (read-only) — คัดจาก data/curriculum.json เท่านั้น */
  aiIndicatorCodes: string[];
  /** รหัสตัวชี้วัดปัจจุบัน (ครูแก้ได้) เช่น ["ท 1.1 ป.1/1"] — [] = ไม่ได้อ้างตัวชี้วัด */
  finalIndicatorCodes: string[];
  isSelected: boolean;
  /** true ถ้าครูแก้ไขจากต้นฉบับ AI แล้ว */
  isEdited: boolean;
}

export interface PlanMediaDTO {
  id: string;
  /** รหัสตามคู่มือ — null ได้ในแผนเก่าที่สร้างก่อนมีคู่มือ 2568 */
  code: string | null;
  item: string;
  category: MediaCategory;
  /** ราคาตามคู่มือ (null = บัญชี ก / ไม่ระบุ) — ใช้กรอกช่องจำนวนเงินที่ขออุดหนุน */
  price: string | null;
  /** ขอรับ / ขอยืม / รับบริการ — ใช้กรอกช่อง "วิธีการ" */
  mode: MediaMode | null;
  aiReason: string;
  finalReason: string;
  isApproved: boolean;
  isEdited: boolean;
}

export interface PlanDTO {
  id: string;
  studentCode: string;
  /** ชื่อจริง — ใช้แสดงผลใน UI และ export (ไม่เคยส่งไป LLM) */
  studentFullName: string | null;
  disabilityType: DisabilityType;
  gradeLevel: string | null;
  academicYear: string;
  term: string;
  status: PlanStatus;
  createdAt: string;
  finalizedAt: string | null;
  /** เวลาที่ใช้ทำแผน (วินาที) — คำนวณจาก createdAt → finalizedAt */
  durationSeconds: number | null;
  goals: PlanGoalDTO[];
  media: PlanMediaDTO[];
  consistencyWarnings: string[];
  principalName?: string;
  responsibleTeacherName?: string;
  homeroomTeacherName?: string;
  meetingDate?: string; // ISO date string เช่น "2025-07-27"
}

// ═════════════════════════════════════════════
// API: แก้ไข / ยืนยันแผน
// ═════════════════════════════════════════════

/** PATCH /api/plans/[id] */
export interface UpdatePlanRequest {
  goals?: {
    id: string;
    finalText?: string;
    isSelected?: boolean;
    /** รหัสที่ไม่มีอยู่จริงในหลักสูตรจะถูกทิ้ง (ข้ามชั้นได้ — ครูตัดสินใจเอง) */
    finalIndicatorCodes?: string[];
  }[];
  media?: { id: string; finalReason?: string; isApproved?: boolean }[];
  /** ตั้งเป็น "finalized" เมื่อครูกดยืนยัน → ระบบบันทึก finalizedAt ให้ */
  status?: PlanStatus;
  principalName?: string;
  responsibleTeacherName?: string;
  homeroomTeacherName?: string;
  meetingDate?: string; // ISO date string เช่น "2025-07-27"
}

// ═════════════════════════════════════════════
// API: สถิติสำหรับเก็บหลักฐาน (ใช้ตอนทำใบสมัคร)
// ═════════════════════════════════════════════

/** GET /api/stats */
export interface UsageStats {
  totalPlans: number;
  finalizedPlans: number;
  avgDurationSeconds: number | null;
  goalEditRate: number;
  mediaEditRate: number;
  /** แบ่งละเอียดจาก goalEditRate เดิม — สัดส่วน % ของเป้าหมายทั้งหมด รวมกัน = 100 */
  goalEditBreakdown: {
    uneditedPct: number;
    minorEditPct: number;
    majorEditPct: number;
  };
}

// ═════════════════════════════════════════════
// INTERNAL: mappingTable.json
// ═════════════════════════════════════════════

export interface MediaEntry {
  /** รหัสรายการตามคู่มือ พ.ศ. 2568 เช่น "BE1784" — ใช้กรอกช่อง "รหัส" ในแบบฟอร์ม */
  code: string;
  item: string;
  category: MediaCategory;
  /** ราคาตามคู่มือ เช่น "2,000 บาท" — null สำหรับบัญชี ก (ขอยืม ไม่มีราคา) */
  price: string | null;
  /** วิธีการได้มา — null ถ้าคู่มือไม่ได้ระบุไว้ในรายการนั้น */
  mode: MediaMode | null;
  /** หลักการทางวิชาการสั้นๆ — ใช้เป็น context ให้ LLM */
  rationale: string;
}

/** mappingTable[disabilityType][`${domain}.${level}`] = MediaEntry[] */
export type MappingTable = Record<string, Record<string, MediaEntry[]>>;

// ═════════════════════════════════════════════
// INTERNAL: curriculum.json
// ═════════════════════════════════════════════

/** ตัวชี้วัด 1 ตัวตามหลักสูตรแกนกลาง — คืนจาก lib/curriculum-retrieval.ts */
export interface IndicatorEntry {
  /** รหัสทางการ เช่น "ท 1.1 ป.1/1" — ใช้อ้างในเอกสารส่วนที่ 5 */
  code: string;
  text: string;
  /** มาตรฐานที่ตัวชี้วัดนี้สังกัด เช่น "ท 1.1" */
  standard: string;
  subject: CurriculumSubject;
  /** ชั้นของตัวชี้วัด เช่น "ป.1" — อาจต่ำกว่าชั้นที่นักเรียนเรียนอยู่ */
  grade: string;
}

// ═════════════════════════════════════════════
// INTERNAL: สิ่งที่ LLM ต้องคืนมา
// ═════════════════════════════════════════════

export interface LLMOutput {
  /**
   * ⚠️ indicatorCodes ที่ LLM คืนมาใช้แค่ "จับคู่กลับ" ไปหาตัวชี้วัดที่ retrieve มา
   *    รหัสที่ไม่อยู่ในรายการที่ส่งไปให้จะถูกทิ้ง (ดู resolveIndicatorCodes)
   */
  iepGoals: {
    text: string;
    criterion: string;
    timeframe: string;
    indicatorCodes?: string[];
  }[];
  /**
   * ⚠️ code/item/category ที่ LLM คืนมาใช้แค่ "จับคู่กลับ" ไปหารายการที่ retrieve มา
   *    ไม่ใช่แหล่งความจริง — รหัส/บัญชี/ราคา/วิธีการ ยึดจาก mappingTable เท่านั้น
   *    รายการที่จับคู่ไม่ได้จะถูกทิ้ง (ดู app/api/plans/route.ts)
   *
   * 🔑 ตั้งแต่ 8 ส.ค. 2569 LLM "เลือกไม่ครบ" ได้ — คืนเฉพาะรายการที่สนับสนุนเป้าหมายในแผนนี้
   *    รายการที่เหลือระบบยังบันทึกไว้ทั้งหมด แต่ตั้ง isApproved = false ให้ครูติ๊กกลับเองได้
   *    (ยังคงเลือกได้เฉพาะจากรายการที่ retrieve มาเท่านั้น — คิดรหัสเองไม่ได้ CLAUDE.md §4)
   */
  mediaRecommendations: {
    code?: string;
    item: string;
    category?: MediaCategory;
    reason: string;
    /**
     * เป้าหมายที่สื่อชิ้นนี้สนับสนุน เช่น "goal_1" — เป็นแค่ "คำใบ้" ไม่ใช่ข้อบังคับ
     *
     * ⚠️ ห้ามเขียน validation ที่บังคับว่าสื่อทุกชิ้นต้องผูกกับเป้าหมายข้อใดข้อหนึ่ง
     *    แผนจริงมีรายการที่ไม่ผูกกับเป้าหมายใดเลยเป็นเรื่องปกติ (กาว พลาสติกเคลือบ
     *    กระดาษโปสเตอร์ = วัสดุสำหรับผลิตสื่ออื่น) และครูเขียน "เหตุผลและความจำเป็น"
     *    เป็นข้อความรวมของทั้งคำขอ ไม่ได้เขียนแยกทีละคู่เป้าหมาย-สื่อ
     *    (ดู data/goalMediaPairs.json _keyFindings ข้อ 1 และ 2)
     */
    goalRef?: string;
  }[];
}

export interface ErrorResponse {
  error: string;
  detail?: string;
}

// ═════════════════════════════════════════════
// API: ประวัติพัฒนาการนักเรียน (Track A)
// ═════════════════════════════════════════════

/** GET /api/students/[id]/history */
export interface StudentHistoryEntry {
  assessmentId: string;
  assessedAt: string; // ISO date
  abilityLevels: AbilityLevels;
  strengths: string | null;
  plans: {
    id: string;
    academicYear: string;
    term: string;
    status: PlanStatus;
    finalizedAt: string | null;
    goalCount: number;
    selectedGoalCount: number;
  }[];
}

export interface StudentHistoryDTO {
  studentId: string;
  code: string;
  fullName: string | null;
  history: StudentHistoryEntry[];
}
