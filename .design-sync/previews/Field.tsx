import * as React from "react";
import { Field, Input, Textarea, Select } from "iep-gen";

// ข้อมูลในทุก preview เป็นข้อมูลปลอม — ห้ามใส่ข้อมูลนักเรียนจริง (DESIGN.md §5 ข้อ 10)

/** ช่องข้อความ — label → hint → ช่องกรอก · hint บังคับทุกช่อง */
export const TextInput = () => (
  <div className="max-w-md">
    <Field label="รหัสนักเรียน" hint="ใช้อ้างอิงในระบบเท่านั้น ไม่ต้องใช้ชื่อจริง เช่น A-01">
      <Input placeholder="A-01" />
    </Field>
  </div>
);

/** ช่องไม่บังคับ — ต่อท้าย label ว่า (ไม่บังคับ) */
export const OptionalTextarea = () => (
  <div className="max-w-md">
    <Field
      label="จุดเด่น / สิ่งที่ทำได้"
      hint="เขียนสั้นๆ ด้วยภาษาของครู ห้ามใส่ชื่อจริงหรือข้อมูลระบุตัวตน"
      optional
    >
      <Textarea rows={3} placeholder="เช่น ชอบวาดภาพ จดจำภาพได้ดี" />
    </Field>
  </div>
);

/** ตัวเลือกจากรายการ */
export const SelectField = () => (
  <div className="max-w-md">
    <Field label="ภาคเรียน" hint="เลือกภาคเรียนที่จะใช้แผนนี้">
      <Select defaultValue="1">
        <option value="1">ภาคเรียนที่ 1</option>
        <option value="2">ภาคเรียนที่ 2</option>
      </Select>
    </Field>
  </div>
);

/** ฟอร์มหลายช่อง — ระยะห่างระหว่างช่อง 16px */
export const FormStack = () => (
  <div className="flex max-w-md flex-col gap-4">
    <Field label="ปีการศึกษา" hint="ระบบใส่ปีปัจจุบันให้ แก้ได้ถ้าทำแผนย้อนหลัง">
      <Input defaultValue="2569" />
    </Field>
    <Field label="ภาคเรียน" hint="เลือกภาคเรียนที่จะใช้แผนนี้">
      <Select defaultValue="1">
        <option value="1">ภาคเรียนที่ 1</option>
        <option value="2">ภาคเรียนที่ 2</option>
      </Select>
    </Field>
  </div>
);
