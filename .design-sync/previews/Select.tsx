import * as React from "react";
import { Field, Select } from "iep-gen";

// ข้อมูลในทุก preview เป็นข้อมูลปลอม — ห้ามใส่ข้อมูลนักเรียนจริง (DESIGN.md §5 ข้อ 10)
// Select ใช้คู่กับ Field เสมอ เพื่อให้มี label + hint ผูกกับช่องกรอก

/** ยังไม่ได้เลือก — ตัวเลือกแรกเป็นคำชวนให้เลือก */
export const Unselected = () => (
  <div className="max-w-md">
    <Field label="ระดับชั้น" hint="ชั้นเรียนปัจจุบันของนักเรียน">
      <Select defaultValue="">
        <option value="">— เลือกระดับชั้น —</option>
        <option value="p1">ป.1</option>
        <option value="p2">ป.2</option>
        <option value="p3">ป.3</option>
      </Select>
    </Field>
  </div>
);

/** เลือกระดับความสามารถเอง — ใช้เมื่อครูกด "แก้ระดับ" หรือ AI ไม่มั่นใจ */
export const AbilityLevel = () => (
  <div className="max-w-md">
    <Field label="ระดับด้านการสื่อสาร" hint="เลือกข้อที่ใกล้กับสิ่งที่เด็กทำได้ตอนนี้มากที่สุด">
      <Select defaultValue="single-word">
        <option value="">— เลือกระดับ —</option>
        <option value="gesture">ไม่พูด ใช้ท่าทางสื่อสาร</option>
        <option value="single-word">พูดเป็นคำเดี่ยวได้</option>
        <option value="short-sentence">พูดเป็นประโยคสั้นๆ ได้</option>
      </Select>
    </Field>
  </div>
);
