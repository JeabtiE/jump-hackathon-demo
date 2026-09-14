/**
 * components/ui/Chip.tsx — ป้ายสถานะ (DESIGN.md §2 · §4.8)
 *
 * ⚠️ ทุก tone มีสัญลักษณ์คู่กับสีเสมอ และไม่มี prop ให้ปิดสัญลักษณ์ — ห้ามพึ่งสีอย่างเดียว
 *    attention กับ danger สว่างใกล้กันมาก (L 0.1159 vs 0.0913) คนตาบอดสีแยกจาก hue ไม่ได้
 *    สองตัวนี้จึงต่างกันทั้งสัญลักษณ์ (⚠ / ✕) และ treatment (พื้นอ่อน + ขอบ / พื้นทึบ)
 *    screen reader ได้คำบอกสถานะนำหน้าข้อความด้วย (sr-only)
 *
 * ⚠️ verified สงวนไว้ให้ค่าที่ครู "แตะเอง" จริงเท่านั้น (§4.8, §5 ข้อ 1)
 *    ค่าที่ AI กรอกให้แล้วครูยังไม่แตะ ต้องใช้ neutral + ป้าย "AI จัดให้ · แตะเพื่อเปลี่ยน"
 *    สีของ verified อ้างสถานะ "ครูตรวจแล้ว" — ใช้ผิดที่ พี่เลี้ยงจะอ่านว่าข้ามได้
 *    tone จึงบังคับส่งทุกครั้ง ไม่มีค่าเริ่มต้น
 *
 * ⚠️ danger ใช้กับป้ายสั้นในรายการเท่านั้น — error ของทั้งพื้นที่ (บันทึกไม่สำเร็จ, DB ต่อไม่ติด)
 *    ยังต้องเป็นแถบ danger เต็มความกว้างที่บอกว่าต้องทำอะไรต่อ ตาม §2
 *
 * Chip ไม่ใช่ปุ่ม — ถ้าต้องแตะได้ (เช่น "แตะเพื่อเปลี่ยน") ให้ห่อด้วย Button เพื่อได้ 44px + focus ring
 */

import type { HTMLAttributes, ReactNode } from "react";

export type ChipTone = "verified" | "neutral" | "attention" | "danger";

export type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  tone: ChipTone;
  children: ReactNode;
};

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

const TONE: Record<ChipTone, { className: string; symbol: string; srLabel: string }> = {
  // ครูแตะเลือก/ยืนยันเองแล้วเท่านั้น
  verified: {
    className: "border-accent bg-accent/[.08] text-accent",
    symbol: "✓",
    srLabel: "ยืนยันโดยครู:",
  },
  // tone กลาง — เช่น ค่าที่ AI กรอกให้แต่ครูยังไม่แตะ
  neutral: {
    className: "border-muted bg-ink/[.04] text-muted",
    symbol: "○",
    srLabel: "ยังไม่ได้ยืนยัน:",
  },
  // warning — ครูต้องตัดสินเอง ห้าม auto-fix
  // \uFE0E (text presentation selector) บังคับให้ ⚠ แสดงเป็นตัวอักษรสีตาม tone ไม่ใช่ emoji สีเหลือง
  // เขียนเป็น escape ให้เห็นชัด — ถ้าเป็นตัวอักษรที่มองไม่เห็น จะมีคนลบทิ้งโดยไม่รู้
  attention: {
    className: "border-attention bg-attention/[.1] text-attention",
    symbol: "\u26A0\uFE0E",
    srLabel: "ควรตรวจ:",
  },
  // error — พื้นทึบ แยก treatment จาก attention
  danger: {
    className: "border-danger bg-danger text-paper",
    symbol: "✕",
    srLabel: "ผิดพลาด:",
  },
};

export default function Chip({ tone, className, children, ...rest }: ChipProps) {
  const t = TONE[tone];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-hint font-medium",
        t.className,
        className
      )}
      {...rest}
    >
      <span aria-hidden="true">{t.symbol}</span>
      <span className="sr-only">{t.srLabel} </span>
      {children}
    </span>
  );
}
