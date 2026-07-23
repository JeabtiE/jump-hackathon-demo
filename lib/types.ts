/**
 * ⚠️ ไฟล์นี้คือ CONTRACT ระหว่าง Frontend (คน B) กับ API (คน A)
 *
 * ถ้าจะแก้ไฟล์นี้ → ต้องบอกอีกคนก่อนเสมอ ห้ามแก้เงียบๆ
 * ทั้งคู่ยึด type ในนี้เป็นหลัก จะได้ทำงานคู่ขนานได้โดยไม่ต้องรอกัน
 */

// ─────────────────────────────────────────────
// ประเภทความพิการ 9 ประเภทตาม สพฐ.
// รอบ MVP ทำเฉพาะที่แม่ต้องใช้จริง — ที่เหลือใส่ไว้เผื่ออนาคต
// ─────────────────────────────────────────────
export type DisabilityType =
  | "visual"        // บกพร่องทางการเห็น
  | "hearing"       // บกพร่องทางการได้ยิน
  | "intellectual"  // บกพร่องทางสติปัญญา
  | "physical"      // บกพร่องทางร่างกาย/การเคลื่อนไหว/สุขภาพ
  | "learning"      // บกพร่องทางการเรียนรู้ (LD)
  | "speech"        // บกพร่องทางการพูดและภาษา
  | "behavioral"    // บกพร่องทางพฤติกรรมหรืออารมณ์
  | "autism"        // ออทิสติก
  | "multiple";     // พิการซ้อน

// ─────────────────────────────────────────────
// ด้านความสามารถที่ประเมิน
// value เป็น string key ที่ต้องตรงกับ key ใน data/mappingTable.json
// ─────────────────────────────────────────────
export interface AbilityLevels {
  reading?: string;        // การอ่าน
  writing?: string;        // การเขียน
  math?: string;           // การคำนวณ
  communication?: string;  // การสื่อสาร
  behavior?: string;       // พฤติกรรม
  selfHelp?: string;       // การช่วยเหลือตนเอง
}

// ─────────────────────────────────────────────
// REQUEST: Frontend → POST /api/generate
// ─────────────────────────────────────────────
export interface GenerateRequest {
  disabilityType: DisabilityType;
  abilityLevels: AbilityLevels;
  /** จุดเด่น/สิ่งที่เด็กทำได้ (optional, free text สั้นๆ) */
  strengths?: string;
  /** ระดับชั้น เช่น "ป.2" */
  gradeLevel?: string;
}

// ─────────────────────────────────────────────
// RESPONSE: API → Frontend
// ─────────────────────────────────────────────

/** เป้าหมายเชิงพฤติกรรม — ระบบเสนอ 2-3 ตัวเลือกให้ครูเลือก */
export interface IEPGoal {
  id: string;
  /** ข้อความเป้าหมายเต็ม พร้อมใช้ copy ไปวางในระบบ SET */
  text: string;
  /** เกณฑ์วัดผล เช่น "8 ใน 10 ครั้ง" */
  criterion: string;
  /** กรอบเวลา เช่น "ภายในภาคเรียนนี้" */
  timeframe: string;
}

/** สื่อ/สิ่งอำนวยความสะดวกที่แนะนำ — มาจาก mappingTable เท่านั้น ไม่ใช่ LLM คิดเอง */
export interface MediaRecommendation {
  /** ชื่อรายการสื่อ */
  item: string;
  /** บัญชี ก หรือ ข */
  category: "ก" | "ข";
  /** เหตุผลประกอบการขอเบิก (LLM เขียน โดยอ้างอิงจากเป้าหมาย IEP) */
  reason: string;
}

/** วิธีสอน IIP — nice to have ทำถ้าเวลาเหลือ */
export interface IIPMethod {
  id: string;
  text: string;
  /** เชื่อมกับเป้าหมาย IEP ข้อไหน */
  linkedGoalId: string;
}

export interface GenerateResponse {
  iepGoals: IEPGoal[];
  mediaRecommendations: MediaRecommendation[];
  iipMethods?: IIPMethod[];
  /** จุดที่ระบบตรวจพบว่าอาจไม่สอดคล้องกัน — flag ให้ครูตัดสินใจ ไม่ auto-fix */
  consistencyWarnings?: string[];
}

/** เมื่อเกิด error ฝั่ง server */
export interface ErrorResponse {
  error: string;
  detail?: string;
}

// ─────────────────────────────────────────────
// โครงสร้าง mappingTable.json (คน A ใช้)
// ─────────────────────────────────────────────
export interface MediaEntry {
  item: string;
  category: "ก" | "ข";
  /** หลักการทางวิชาการสั้นๆ ว่าทำไมสื่อนี้ถึงเหมาะ — ใช้เป็น context ให้ LLM */
  rationale: string;
}

/** mappingTable[disabilityType][abilityKey] = MediaEntry[] */
export type MappingTable = Record<string, Record<string, MediaEntry[]>>;
