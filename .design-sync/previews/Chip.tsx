import * as React from "react";
import { Chip } from "iep-gen";

// ข้อมูลในทุก preview เป็นข้อมูลปลอม — ห้ามใส่ข้อมูลนักเรียนจริง (DESIGN.md §5 ข้อ 10)

/** 4 tone — ทุก tone มีสัญลักษณ์คู่กับสีเสมอ */
export const Tones = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Chip tone="verified">ครูเลือกเอง</Chip>
    <Chip tone="neutral">AI จัดให้ · แตะเพื่อเปลี่ยน</Chip>
    <Chip tone="attention">ช่วยเลือกระดับให้หน่อย</Chip>
    <Chip tone="danger">ไม่พบรหัสในคู่มือ</Chip>
  </div>
);

/**
 * ระดับความสามารถที่ AI เสนอ — ค่าที่ AI กรอกให้แล้วครูยังไม่แตะ ต้องเป็น neutral
 * verified ใช้ได้หลังครูเลือก/แก้เองเท่านั้น (DESIGN.md §4.8)
 */
export const AbilityLevel = () => (
  <div className="flex flex-col items-start gap-2">
    <Chip tone="neutral">AI จัดให้ · แตะเพื่อเปลี่ยน: พูดเป็นคำเดี่ยวได้</Chip>
    <Chip tone="verified">ครูเลือกเอง: พูดเป็นประโยคสั้นๆ ได้</Chip>
    <Chip tone="attention">ช่วยเลือกระดับให้หน่อย — ระบบยังตีความข้อความนี้ไม่ได้</Chip>
  </div>
);
