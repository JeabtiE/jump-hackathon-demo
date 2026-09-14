import * as React from "react";
import { Card } from "iep-gen";

// ข้อมูลในทุก preview เป็นข้อมูลปลอม — ห้ามใส่ข้อมูลนักเรียนจริง (DESIGN.md §5 ข้อ 10)

/** การ์ดหัว h2 — กรอบเส้นบนกระดาษ ไม่มีเงา มีเส้นคั่นใต้หัวข้อ */
export const WithTitle = () => (
  <div className="max-w-md">
    <Card title="นักเรียน">
      <p className="text-body text-ink">นักเรียนทดสอบ ก · ชั้น ป.2</p>
      <p className="text-hint text-muted">แผนที่ทำแล้ว 1 ฉบับ · ปีการศึกษา 2569</p>
    </Card>
  </div>
);

/** หัวข้อย่อยในหน้าทบทวนแผน — ใช้ titleAs="h3" */
export const Subsection = () => (
  <div className="max-w-md">
    <Card title="ข้อ 5.1 · ด้านการสื่อสาร" titleAs="h3">
      <p className="text-body text-ink">
        นักเรียนสามารถบอกความต้องการของตนเองด้วยคำพูดสั้นๆ ได้ถูกต้อง 4 ใน 5 ครั้ง ภายในภาคเรียนที่ 1
      </p>
    </Card>
  </div>
);

/** ไม่มีหัวการ์ด — ใช้จัดกลุ่มเนื้อหาสั้นๆ */
export const WithoutTitle = () => (
  <div className="max-w-md">
    <Card>
      <p className="text-hint text-muted">
        ระบบนี้ช่วยร่างเอกสารเท่านั้น ครูต้องตรวจสอบและยืนยันก่อนนำไปใช้จริงเสมอ
      </p>
    </Card>
  </div>
);
