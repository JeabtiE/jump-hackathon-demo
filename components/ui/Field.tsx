"use client";

/**
 * components/ui/Field.tsx — label + hint + control (DESIGN.md §4.3)
 *
 * ลำดับบนลงล่างเสมอ: label → hint → control
 * - hint บังคับทุกช่อง (type เป็น required) — พี่เลี้ยงวุฒิ ม.6 ต้องอ่านแล้วรู้ว่าต้องกรอกอะไร
 *   เขียนเป็นภาษาพูด ศัพท์เทคนิคใช้ได้แต่ต้องอธิบายไว้ใน hint
 * - ขอบ control = border-control (สี muted ≥ 3:1) ห้ามใช้ border-rule (≈1.5:1 ไม่ผ่าน WCAG 1.4.11)
 * - ตัวอักษรในช่องกรอก text-body 16px — ถ้าต่ำกว่านี้ iOS Safari จะซูมหน้าตอนแตะช่อง
 * - ช่องไม่บังคับให้ส่ง optional → ต่อท้าย label ว่า "(ไม่บังคับ)" ไม่ใช้ * อย่างเดียว
 *
 * ใช้คู่กับ Input / Textarea / Select ในไฟล์นี้ — ผูก label และ hint เข้ากับ control ให้เอง
 * (htmlFor + aria-describedby) screen reader จึงอ่าน hint ตอนโฟกัสช่อง
 *
 *   <Field label="รหัสนักเรียน" hint="ใช้อ้างอิงในระบบ เช่น A-01">
 *     <Input value={code} onChange={(e) => setCode(e.target.value)} />
 *   </Field>
 *
 * ⚠️ ถ้าต้องกำหนด id เอง ให้ส่งที่ Field (controlId) ไม่ใช่ที่ control — ไม่งั้น label ผูกไม่ติด
 */

import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

type FieldContextValue = { controlId: string; hintId: string };

const FieldContext = createContext<FieldContextValue | null>(null);

export type FieldProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  label: ReactNode;
  /** คำอธิบายใต้ label — บังคับทุกช่อง */
  hint: ReactNode;
  /** true = ต่อท้าย label ว่า "(ไม่บังคับ)" */
  optional?: boolean;
  /** id ของ control — ไม่ส่งจะสร้างให้เอง */
  controlId?: string;
  children: ReactNode;
};

export function Field({
  label,
  hint,
  optional = false,
  controlId,
  className,
  children,
  ...rest
}: FieldProps) {
  const autoId = useId();
  const id = controlId ?? `field-${autoId}`;
  const hintId = `${id}-hint`;

  return (
    <div className={cx("flex flex-col", className)} {...rest}>
      <label htmlFor={id} className="text-label text-ink">
        {label}
        {optional && <span className="font-normal text-muted"> (ไม่บังคับ)</span>}
      </label>
      <p id={hintId} className="text-hint text-muted">
        {hint}
      </p>
      <FieldContext.Provider value={{ controlId: id, hintId }}>
        <div className="mt-2">{children}</div>
      </FieldContext.Provider>
    </div>
  );
}

/** ผูก id และ aria-describedby จาก Field ที่ครอบอยู่ — ใช้นอก Field ได้ แต่จะไม่มี hint ผูก */
function useFieldA11y(id: string | undefined, describedBy: string | undefined) {
  const ctx = useContext(FieldContext);
  return {
    id: id ?? ctx?.controlId,
    "aria-describedby": cx(ctx?.hintId, describedBy) || undefined,
  };
}

const CONTROL =
  "block w-full min-h-[44px] rounded-box border border-control bg-paper px-3 py-2 text-body text-ink " +
  "placeholder:text-muted " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper " +
  "disabled:cursor-not-allowed disabled:bg-rule disabled:text-muted";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ id, className, "aria-describedby": describedBy, ...rest }, ref) {
    const a11y = useFieldA11y(id, describedBy);
    return <input ref={ref} {...a11y} className={cx(CONTROL, className)} {...rest} />;
  }
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ id, className, "aria-describedby": describedBy, ...rest }, ref) {
  const a11y = useFieldA11y(id, describedBy);
  return <textarea ref={ref} {...a11y} className={cx(CONTROL, className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ id, className, "aria-describedby": describedBy, ...rest }, ref) {
    const a11y = useFieldA11y(id, describedBy);
    return <select ref={ref} {...a11y} className={cx(CONTROL, className)} {...rest} />;
  }
);

export default Field;
