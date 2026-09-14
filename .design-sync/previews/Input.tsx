import * as React from "react";
import { Field, Input } from "iep-gen";

// ข้อมูลในทุก preview เป็นข้อมูลปลอม — ห้ามใส่ข้อมูลนักเรียนจริง (DESIGN.md §5 ข้อ 10)
// Input ใช้คู่กับ Field เสมอ เพื่อให้มี label + hint ผูกกับช่องกรอก

/** ช่องว่างพร้อม placeholder */
export const Empty = () => (
  <div className="max-w-md">
    <Field label="ชื่อสถานศึกษา" hint="ชื่อเต็มของโรงเรียน ใช้ในหัวเอกสาร">
      <Input placeholder="เช่น โรงเรียนทดสอบระบบ" />
    </Field>
  </div>
);

/** มีค่าแล้ว */
export const Filled = () => (
  <div className="max-w-md">
    <Field label="สังกัด" hint="หน่วยงานต้นสังกัดของโรงเรียน">
      <Input defaultValue="สพป.ทดสอบ เขต 1" />
    </Field>
  </div>
);

/** แก้ไขไม่ได้ */
export const Disabled = () => (
  <div className="max-w-md">
    <Field label="รหัสนักเรียน" hint="เปลี่ยนรหัสไม่ได้หลังสร้างแผนแล้ว">
      <Input defaultValue="A-01" disabled />
    </Field>
  </div>
);
