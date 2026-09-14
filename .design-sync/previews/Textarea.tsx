import * as React from "react";
import { Field, Textarea } from "iep-gen";

// ข้อมูลในทุก preview เป็นข้อมูลปลอม — ห้ามใส่ข้อมูลนักเรียนจริง (DESIGN.md §5 ข้อ 10)
// Textarea ใช้คู่กับ Field เสมอ เพื่อให้มี label + hint ผูกกับช่องกรอก

/** ช่องบรรยายความสามารถ — ครูพิมพ์ด้วยภาษาของตัวเอง */
export const Empty = () => (
  <div className="max-w-md">
    <Field
      label="ด้านการสื่อสาร"
      hint="พิมพ์บรรยายว่าเด็กทำอะไรได้ / ยังทำไม่ได้ ระบบจะช่วยจัดเป็นระดับให้ แล้วครูตรวจอีกที"
    >
      <Textarea rows={3} placeholder="เช่น ชี้บอกสิ่งที่ต้องการได้ แต่ยังพูดเป็นคำไม่ได้" />
    </Field>
  </div>
);

/** มีข้อความแล้ว */
export const Filled = () => (
  <div className="max-w-md">
    <Field
      label="ด้านการสื่อสาร"
      hint="พิมพ์บรรยายว่าเด็กทำอะไรได้ / ยังทำไม่ได้ ระบบจะช่วยจัดเป็นระดับให้ แล้วครูตรวจอีกที"
    >
      <Textarea
        rows={3}
        defaultValue="พูดเป็นคำเดี่ยวได้ เช่น น้ำ กิน ไป ยังพูดเป็นประโยคไม่ได้ ต้องมีภาพช่วยเวลาเล่าเรื่อง"
      />
    </Field>
  </div>
);
