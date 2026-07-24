/**
 * PII BOUNDARY GUARD — คน A ดูแล
 *
 * 🔒 ไฟล์นี้คือกำแพงที่กั้นไม่ให้ข้อมูลส่วนบุคคลของนักเรียนหลุดไปยัง LLM API
 *
 * หลักการ: เราเก็บ PII ใน DB ได้ (จำเป็นสำหรับ export เอกสารทางการ)
 *          แต่ต้องไม่มี PII แม้แต่ field เดียวที่ถูกส่งออกไปนอกระบบเรา
 *
 * ⚠️ อย่าใช้วิธี "จำไว้ว่าอย่าส่ง" — ให้โค้ดบังคับเสมอ
 *    ทุกจุดที่จะเรียก LLM ต้องผ่าน buildLLMSafePayload() เท่านั้น
 */

/**
 * รายชื่อ field ที่เป็น PII — ต้องตรงกับบล็อก "PII ZONE" ใน prisma/schema.prisma
 * ถ้าเพิ่ม field PII ใหม่ใน schema ต้องมาเพิ่มที่นี่ด้วย
 */
export const PII_FIELDS = [
  "fullName",
  "nationalId",
  "disabilityCardNo",
  "birthDate",
  "religion",
  "disabilityDetail",
  "fatherName",
  "motherName",
  "guardianName",
  "guardianRelation",
  "address",
  "phone",
  "schoolName",
  "affiliation",
  "medicalNote",
  "educationHistory",
] as const;

/**
 * ข้อมูลที่อนุญาตให้ส่งไป LLM ได้ (whitelist)
 * ทุกอย่างที่ไม่อยู่ในนี้ถือว่าห้ามส่ง
 */
export interface LLMSafePayload {
  disabilityType: string;
  gradeLevel?: string;
  abilityLevels: Record<string, string>;
  /** จุดเด่น/บริบทเพิ่มเติม — ครูพิมพ์เอง มีคำเตือนใน UI ว่าห้ามใส่ชื่อ */
  strengths?: string;
}

/**
 * สร้าง payload ที่ปลอดภัยสำหรับส่งไป LLM
 *
 * ใช้ whitelist (ไม่ใช่ blacklist) เพื่อให้ field ใหม่ที่เพิ่มใน schema
 * ไม่หลุดออกไปโดยอัตโนมัติ
 */
export function buildLLMSafePayload(input: {
  disabilityType: string;
  gradeLevel?: string | null;
  abilityLevels?: Record<string, string>;
  strengths?: string | null;
}): LLMSafePayload {
  return {
    disabilityType: input.disabilityType,
    gradeLevel: input.gradeLevel ?? undefined,
    abilityLevels: input.abilityLevels ?? {},
    strengths: input.strengths ? scrubFreeText(input.strengths) : undefined,
  };
}

/**
 * ตรวจจับ pattern ที่น่าจะเป็น PII ในข้อความอิสระที่ครูพิมพ์เอง
 * (ช่อง "จุดเด่น/บริบทเพิ่มเติม" ที่เป็น free text)
 *
 * ไม่ใช่การป้องกันแบบสมบูรณ์ แต่เป็นตาข่ายกันพลาดชั้นสุดท้าย
 */
export function scrubFreeText(text: string): string {
  return (
    text
      // เลขบัตรประชาชน 13 หลัก (มีหรือไม่มีขีดคั่น)
      .replace(/\b\d[\s-]?\d{4}[\s-]?\d{5}[\s-]?\d{2}[\s-]?\d\b/g, "[ลบข้อมูลระบุตัวตน]")
      // เบอร์โทรศัพท์ไทย
      .replace(/\b0\d{1,2}[\s-]?\d{3}[\s-]?\d{4}\b/g, "[ลบข้อมูลระบุตัวตน]")
      // คำนำหน้าชื่อเด็ก + ชื่อที่ตามมา
      .replace(/(เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.)\s*\S+(\s+\S+)?/g, "นักเรียน")
      // คำนำหน้าชื่อผู้ใหญ่ + ชื่อที่ตามมา
      .replace(/(นาย|นาง|นางสาว|น\.ส\.)\s*\S+(\s+\S+)?/g, "[ลบข้อมูลระบุตัวตน]")
  );
}

/**
 * ตรวจสอบว่า object ที่กำลังจะส่งออกไปข้างนอก ไม่มี PII field ปนมา
 * เรียกก่อน fetch() ไป LLM API ทุกครั้ง — throw ถ้าเจอ
 *
 * ป้องกันกรณี dev เผลอ spread object จาก DB เข้าไปตรงๆ
 */
export function assertNoPII(payload: unknown, context = "LLM payload"): void {
  const serialized = JSON.stringify(payload ?? {});
  const found = PII_FIELDS.filter((f) =>
    new RegExp(`"${f}"\\s*:`).test(serialized)
  );

  if (found.length > 0) {
    throw new Error(
      `[PII GUARD] พบข้อมูลส่วนบุคคลใน ${context}: ${found.join(", ")} — ` +
        `ห้ามส่งข้อมูลนี้ออกนอกระบบ ใช้ buildLLMSafePayload() แทน`
    );
  }
}

/**
 * แทนที่คำว่า "นักเรียน" ในข้อความที่ AI สร้าง ด้วยชื่อจริงของเด็ก
 * ใช้ตอน export เอกสารเท่านั้น — ทำงานฝั่งเราหลังจาก LLM คืนผลแล้ว
 *
 * LLM ถูกสั่งให้ใช้คำว่า "นักเรียน" เสมอ (ดู lib/prompts.ts)
 * ทำให้เราเติมชื่อจริงตอนท้ายได้โดยที่ชื่อไม่เคยออกจากระบบ
 */
export function personalizeForExport(text: string, fullName?: string | null): string {
  if (!fullName?.trim()) return text;
  return text.replace(/นักเรียน/g, fullName.trim());
}
