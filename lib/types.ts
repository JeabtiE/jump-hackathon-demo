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

export type MediaCategory = "ก" | "ข";
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
  isSelected: boolean;
  /** true ถ้าครูแก้ไขจากต้นฉบับ AI แล้ว */
  isEdited: boolean;
}

export interface PlanMediaDTO {
  id: string;
  item: string;
  category: MediaCategory;
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
  goals?: { id: string; finalText?: string; isSelected?: boolean }[];
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
  /** เวลาเฉลี่ยที่ใช้ทำแผน 1 ฉบับ (วินาที) */
  avgDurationSeconds: number | null;
  /** สัดส่วนเป้าหมายที่ครูแก้จากต้นฉบับ AI (%) */
  goalEditRate: number;
  /** สัดส่วนเหตุผลเบิกสื่อที่ครูแก้ (%) */
  mediaEditRate: number;
}

// ═════════════════════════════════════════════
// INTERNAL: mappingTable.json
// ═════════════════════════════════════════════

export interface MediaEntry {
  item: string;
  category: MediaCategory;
  /** หลักการทางวิชาการสั้นๆ — ใช้เป็น context ให้ LLM */
  rationale: string;
}

/** mappingTable[disabilityType][`${domain}.${level}`] = MediaEntry[] */
export type MappingTable = Record<string, Record<string, MediaEntry[]>>;

// ═════════════════════════════════════════════
// INTERNAL: สิ่งที่ LLM ต้องคืนมา
// ═════════════════════════════════════════════

export interface LLMOutput {
  iepGoals: { text: string; criterion: string; timeframe: string }[];
  mediaRecommendations: {
    item: string;
    category: MediaCategory;
    reason: string;
  }[];
}

export interface ErrorResponse {
  error: string;
  detail?: string;
}
