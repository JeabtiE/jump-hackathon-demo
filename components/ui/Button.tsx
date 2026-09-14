/**
 * components/ui/Button.tsx — ปุ่มพื้นฐานตาม DESIGN.md
 *
 * - ทุก variant/size สูงอย่างน้อย 44px (DESIGN.md §4.4 touch target)
 *   size ต่างกันแค่ padding กับขนาดตัวอักษร ความสูงขั้นต่ำเท่ากัน
 * - focus-visible: ring 2px accent + offset 2px (§4.3) — Tab ไล่ทั้งหน้าต้องเห็นตลอด
 * - 1 หน้าจอมี primary ได้ปุ่มเดียว (§4.2) ค่าเริ่มต้นจึงเป็น secondary
 * - copy: ป้ายต้องบอกปลายทางเสมอ เช่น "คัดลอกไปวางในระบบ SET" (§6 B1)
 *   ห้ามรวมปุ่มที่ไประบบ SET กับปุ่มที่ไประบบคูปองเป็นปุ่มเดียว (§5 ข้อ 4)
 * - type เริ่มต้นเป็น "button" กันการ submit ฟอร์มโดยไม่ตั้งใจ
 */

import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "copy";
export type ButtonSize = "sm" | "md";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

const BASE =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-box border font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper " +
  "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-rule disabled:text-muted";

const VARIANT: Record<ButtonVariant, string> = {
  // action หลักของขั้นนั้น — ใช้ได้ปุ่มเดียวต่อหน้าจอ
  primary: "border-transparent bg-accent text-paper hover:bg-accent/90",
  secondary: "border-control bg-paper text-ink hover:bg-ink/[.04]",
  // สำหรับ action รอง เช่น "ไม่ใช่? แก้ระดับ" — ยังสูง 44px ไม่ใช่ลิงก์ตัวเล็ก (§4.4)
  ghost: "border-transparent bg-transparent text-accent hover:bg-ink/[.04]",
  copy: "border-control bg-paper text-ink hover:bg-ink/[.04]",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "px-3 text-hint",
  md: "px-4 text-label",
};

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="shrink-0"
    >
      <rect x="5.5" y="5.5" width="8" height="8" rx="1" />
      <path d="M10.5 3.5V3a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5" />
    </svg>
  );
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", type = "button", className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(BASE, VARIANT[variant], SIZE[size], className)}
      {...rest}
    >
      {variant === "copy" && <CopyIcon />}
      {children}
    </button>
  );
});

export default Button;
