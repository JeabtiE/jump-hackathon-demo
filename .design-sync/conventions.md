# IEP GEN — conventions สำหรับ design agent

ระบบช่วยครูการศึกษาพิเศษร่างแผน IEP · ผู้ใช้หลักที่ต้องออกแบบให้ใช้ได้คือ **พี่เลี้ยงเด็กพิการ วุฒิ ม.6 ไม่มีพื้นฐานการสอน**
UI ภาษาไทยทั้งหมด · ใช้บน desktop ที่โรงเรียน (1280px) และมือถือ (390px) · ภาษาภาพแบบเอกสารราชการไทย: กระดาษ เส้นบรรทัด ไม่ใช้เงา

## Setup

- ไม่ต้องมี provider · component อยู่ที่ `window.IepGen`: `Button`, `Card`, `Chip`, `Field`, `Input`, `Textarea`, `Select`
- `styles.css` มี token, class ทั้งหมด และฟอนต์ IBM Plex Sans Thai Looped (โหลดจาก Google Fonts) · body ตั้ง line-height 1.75 ให้แล้ว
- **สีพื้นหน้าไม่ได้ตั้งให้อัตโนมัติ** — ครอบหน้าด้วย `className="bg-paper text-ink"`

## Styling — อ่านข้อนี้ก่อนเขียน className

stylesheet เป็น Tailwind ที่ compile ไว้แล้ว **มีเฉพาะ class ในรายการด้านล่างเท่านั้น**
class อื่นของ Tailwind (`grid-cols-3`, `p-8`, `text-sm`, `bg-blue-600` ฯลฯ) **ไม่มีอยู่จริง จะไม่มีสไตล์และไม่มีอะไรเตือน**
layout ที่รายการไม่ครอบคลุม ให้ใช้ inline `style` คู่กับ CSS variable

- **สี:** `bg-paper` `bg-accent` `bg-danger` `bg-accent/[.08]` `bg-attention/[.1]` `bg-ink/[.04]` · `text-ink` `text-muted` `text-accent` `text-attention` `text-paper` · `border-rule` `border-control` `border-muted` `border-accent` `border-attention` `border-danger`
- **ตัวอักษร:** `text-title` (20px h2) `text-subtitle` (17px h3) `text-body` (16px) `text-label` (15px) `text-hint` (14px) · `font-medium` `font-normal` — ไม่มี `text-display` / `text-stat` ใน stylesheet: หัวหน้า 28px ใช้ `style={{ fontSize: 28, lineHeight: 1.4, fontWeight: 600 }}`
- **layout:** `flex` `flex-col` `flex-wrap` `inline-flex` `items-center` `items-start` `justify-center` `gap-1.5` `gap-2` `gap-3` `gap-4` `block` `w-full` `max-w-md` `p-4` `md:p-5` `px-3` `px-4` `py-2` `mt-2` `mb-4` `border` `border-b` `rounded-box` `rounded-full` `min-h-[44px]` `sr-only`
- **CSS variable:** `--color-paper` `--color-ink` `--color-muted` `--color-rule` `--color-accent` `--color-attention` `--color-danger` เก็บเป็นช่อง RGB → เขียน `rgb(var(--color-accent))` หรือ `rgb(var(--color-accent) / .08)` · `--radius-box` (4px)
- ดูของจริงก่อนเสมอ: `styles.css` → `_ds_bundle.css` และ `<Name>.d.ts` / `<Name>.prompt.md` ของแต่ละ component

## กฎที่ห้ามละเมิด

- ห้ามใช้สี palette ของ Tailwind · การ์ดใช้ `Card` (กรอบเส้น) ห้ามใส่เงา · ตัวอักษรไทยห้ามเล็กกว่า 14px · ห้ามลด line-height ข้อความไทย
- `Button variant="primary"` ได้ **ปุ่มเดียวต่อหน้าจอ** · ปุ่มคัดลอกใช้ `variant="copy"` ป้ายต้องบอกปลายทาง และปุ่ม "คัดลอกไปวางในระบบ SET" กับ "คัดลอกไปวางในระบบคูปอง" **แยกกันเสมอ**
- ช่องกรอกทุกช่องอยู่ใน `Field` พร้อม `hint` ภาษาพูดที่พี่เลี้ยงอ่านแล้วรู้ว่าต้องกรอกอะไร · ช่องไม่บังคับใส่ `optional`
- `Chip tone="verified"` **เฉพาะค่าที่ครูแตะเอง** · ค่าที่ AI กรอกให้ใช้ `tone="neutral"` ป้าย "AI จัดให้ · แตะเพื่อเปลี่ยน"
- warning (ครูต้องตัดสินเอง): กล่อง `border border-attention bg-attention/[.1] text-attention` + ⚠ อยู่ติดจุดที่เกี่ยวข้อง ไม่บล็อกงาน
- error ของทั้งพื้นที่ (บันทึกไม่สำเร็จ): **แถบ `bg-danger text-paper p-4` เต็มความกว้าง** บอกว่าต้องทำอะไรต่อ ไม่หายเอง — ห้ามย่อเป็น Chip
- ครูตัดสินทุกจุด: ห้ามออกแบบให้ AI ยืนยันแทนครู · เป้าหมายแสดง 2–3 ตัวเลือกพร้อมกัน · เหตุผลของสื่อทุกรายการต้องเห็นเสมอ
- ข้อมูลตัวอย่างต้องเป็นข้อมูลปลอม ("นักเรียนทดสอบ ก") ห้ามชื่อจริง เลขบัตร เบอร์โทร

## ตัวอย่าง

```jsx
const { Card, Field, Input, Select, Button } = window.IepGen;

<div className="bg-paper text-ink p-4">
  <Card title="ข้อมูลแผน">
    <div className="flex flex-col gap-4">
      <Field label="ปีการศึกษา" hint="ระบบใส่ปีปัจจุบันให้ แก้ได้ถ้าทำแผนย้อนหลัง">
        <Input defaultValue="2569" />
      </Field>
      <Field label="ภาคเรียน" hint="เลือกภาคเรียนที่จะใช้แผนนี้">
        <Select defaultValue="1">
          <option value="1">ภาคเรียนที่ 1</option>
          <option value="2">ภาคเรียนที่ 2</option>
        </Select>
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary">สร้างแผน</Button>
        <Button variant="secondary">บันทึกร่าง</Button>
      </div>
    </div>
  </Card>
</div>
```
