import * as React from "react";
import { Button } from "iep-gen";

// ข้อมูลในทุก preview เป็นข้อมูลปลอม — ห้ามใส่ข้อมูลนักเรียนจริง (DESIGN.md §5 ข้อ 10)

/** action หลักของหน้าทบทวน — primary ได้ปุ่มเดียวต่อหน้าจอ ที่เหลือเป็น secondary / ghost */
export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="primary">ยืนยันแผน</Button>
    <Button variant="secondary">บันทึกร่าง</Button>
    <Button variant="ghost">ไม่ใช่? แก้ระดับ</Button>
  </div>
);

/** ทุก size สูงอย่างน้อย 44px — sm ต่างแค่ padding และขนาดตัวอักษร */
export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="primary" size="md">สร้างแผน</Button>
    <Button variant="primary" size="sm">สร้างแผน</Button>
    <Button variant="secondary" size="md">ดาวน์โหลด .docx</Button>
    <Button variant="secondary" size="sm">ดาวน์โหลด .docx</Button>
  </div>
);

/** ปุ่มคัดลอกต้องบอกปลายทางเสมอ และปุ่มไประบบ SET กับระบบคูปองแยกกัน ห้ามรวมเป็นปุ่มเดียว */
export const CopyDestinations = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="copy">คัดลอกไปวางในระบบ SET</Button>
    <Button variant="copy">คัดลอกไปวางในระบบคูปอง</Button>
  </div>
);

/** ยังกดไม่ได้ เช่น ยังไม่ได้เลือกระดับความสามารถสักด้าน */
export const Disabled = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button variant="primary" disabled>สร้างแผน</Button>
    <Button variant="secondary" disabled>บันทึกร่าง</Button>
  </div>
);
