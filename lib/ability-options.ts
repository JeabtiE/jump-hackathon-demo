/**
 * lib/ability-options.ts — คน A ดูแล
 *
 * Single source of truth ของตัวเลือก dropdown "ระดับความสามารถปัจจุบัน"
 * เดิมค่าพวกนี้ประกาศซ้ำอยู่ใน components/AssessmentForm.tsx (คน B ดูแล)
 * ย้ายมารวมที่นี่เพื่อให้ทั้ง UI และเอกสาร export แปล enum code เป็นข้อความ
 * ไทยตรงกันเสมอ — ไม่ต้องแก้สองที่เวลาเพิ่ม option ใหม่
 *
 * ⚠️ value ต้องตรงกับ key ใน data/mappingTable.json เหมือนเดิม
 *    ถ้าเพิ่ม key ใหม่ แก้ที่นี่ที่เดียว ทั้ง dropdown และเอกสาร export จะอัปเดตตาม
 */

export const ABILITY_OPTIONS: Record<
  string,
  {
    domain: string;
    label: string;
    hint?: string;
    options: { value: string; label: string }[];
  }[]
> = {
  autism: [
    {
      domain: "communication",
      label: "การสื่อสาร",
      hint: "เด็กพูดคุยสื่อสารกับคนอื่นได้แค่ไหนตอนนี้",
      options: [
        { value: "no_speech_gesture_only", label: "ไม่พูด ใช้ท่าทางสื่อสาร" },
        {
          value: "single_word_only",
          label: "พูดได้เป็นคำเดี่ยว ยังไม่ต่อประโยค",
        },
      ],
    },
    {
      domain: "behavior",
      label: "พฤติกรรม",
      hint: "เด็กมีพฤติกรรมที่ส่งผลต่อการเรียนแบบไหนบ้าง",
      options: [
        { value: "frequent_off_task", label: "วอกแวกบ่อย ลุกจากที่นั่ง" },
        {
          value: "difficulty_transition",
          label: "ปรับตัวยากเมื่อเปลี่ยนกิจกรรม",
        },
      ],
    },
    {
      domain: "selfHelp",
      label: "การช่วยเหลือตนเอง",
      hint: "เด็กทำกิจวัตรประจำวัน (แต่งตัว/กินข้าว/เข้าห้องน้ำ) ได้เองแค่ไหน",
      options: [{ value: "needs_prompting", label: "ต้องมีคนเตือนทุกขั้นตอน" }],
    },
    {
      domain: "math",
      label: "การคำนวณ",
      hint: "เด็กนับเลข/คำนวณพื้นฐานได้แค่ไหนตอนนี้",
      options: [
        {
          value: "needs_concrete_visual_support",
          label: "ต้องใช้ของจริง/สื่อรูปธรรมช่วยนับ",
        },
      ],
    },
    {
      domain: "readiness",
      label: "ความพร้อมทางการเรียนรู้",
      hint: "เด็กพร้อมสำหรับการเรียนพื้นฐาน (จับปากกา จับคู่ เรียงลำดับ) แค่ไหน",
      options: [
        {
          value: "needs_prewriting_practice",
          label: "ยังลากเส้น/คุมมือเขียนไม่ได้",
        },
        {
          value: "needs_cognitive_readiness",
          label: "ยังจับคู่/จำแนก/เรียงลำดับไม่ได้",
        },
      ],
    },
  ],
  learning: [
    {
      domain: "reading",
      label: "การอ่าน",
      hint: "เด็กอ่าน สะกดคำ ได้ตามระดับชั้นไหม",
      options: [
        { value: "cannot_spell_2syllable", label: "สะกดคำ 2 พยางค์ไม่ได้" },
      ],
    },
    {
      domain: "writing",
      label: "การเขียน",
      hint: "เด็กเขียนหนังสือ คุมลายมือ ได้แค่ไหน",
      options: [
        {
          value: "poor_handwriting",
          label: "เขียนไม่เป็นระเบียบ กล้ามเนื้อมือไม่แข็งแรง",
        },
      ],
    },
    {
      domain: "math",
      label: "การคำนวณ",
      hint: "เด็กบวกลบคูณหาร ตามระดับชั้นได้ไหม",
      options: [
        { value: "cannot_calculate_carry", label: "คำนวณการทดเลขไม่ได้" },
      ],
    },
  ],
  intellectual: [
    {
      domain: "reading",
      label: "การเรียนรู้ / การรับรู้",
      hint: "เด็กเข้าใจ/รับรู้เนื้อหาที่สอนได้แค่ไหน ต้องช่วยแบบไหน",
      options: [
        {
          value: "needs_concrete_visual_support",
          label: "ต้องใช้สื่อรูปธรรมและภาพประกอบ",
        },
      ],
    },
    {
      domain: "math",
      label: "การคำนวณ",
      hint: "เด็กนับเลข/คำนวณพื้นฐานได้แค่ไหนตอนนี้",
      options: [
        {
          value: "needs_concrete_visual_support",
          label: "ต้องใช้ของจริง/สื่อรูปธรรมช่วยนับ",
        },
      ],
    },
    {
      domain: "selfHelp",
      label: "การช่วยเหลือตนเอง",
      hint: "เด็กทำกิจวัตรประจำวันได้เองแค่ไหน ต้องมีโครงสร้าง/ขั้นตอนช่วยไหม",
      options: [
        {
          value: "needs_routine_structure",
          label: "ต้องมีโครงสร้างกิจวัตรที่ชัดเจน",
        },
      ],
    },
    {
      domain: "behavior",
      label: "พฤติกรรม",
      hint: "เด็กเข้าใจและทำตามคำสั่งในห้องเรียนได้แค่ไหน",
      options: [
        {
          value: "needs_simple_instruction",
          label: "สับสนกับคำสั่งที่ซับซ้อน ต้องการคำสั่งง่าย",
        },
      ],
    },
  ],
  speech: [
    {
      domain: "communication",
      label: "การสื่อสาร",
      hint: "เด็กพูดและออกเสียงได้ชัดเจนแค่ไหนตอนนี้",
      options: [
        {
          value: "limited_expressive_language",
          label: "พูดได้จำกัด ใช้คำ/ประโยคสั้นมาก",
        },
        { value: "unclear_articulation", label: "พูดได้แต่ออกเสียงไม่ชัด" },
      ],
    },
  ],
};

/**
 * โดเมน + ค่า enum → ข้อความไทยอ่านง่าย
 * หาไม่เจอ (เช่น ข้อมูลเก่าที่ dropdown เคยมีตัวเลือกนี้แล้วถูกลบออกไป) → คืนค่าดิบ
 * แทนที่จะโยน error หรือทำให้ทั้งแถวหาย — เอกสารต้องออกมาได้เสมอ ไม่มี field ว่างลอยๆ
 */
export function getAbilityLabel(
  disabilityType: string,
  domain: string,
  value: string
): string {
  const domainDef = ABILITY_OPTIONS[disabilityType]?.find((d) => d.domain === domain);
  const opt = domainDef?.options.find((o) => o.value === value);
  return opt?.label ?? value;
}

/** โดเมน → ชื่อไทย หาไม่เจอ → คืนชื่อ domain (key ภาษาอังกฤษ) ดิบไปก่อน */
export function getDomainLabel(disabilityType: string, domain: string): string {
  const domainDef = ABILITY_OPTIONS[disabilityType]?.find((d) => d.domain === domain);
  return domainDef?.label ?? domain;
}