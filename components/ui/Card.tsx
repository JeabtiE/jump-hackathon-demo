/**
 * components/ui/Card.tsx — กรอบเส้นบนกระดาษ (DESIGN.md §4.1)
 *
 * - border border-rule + rounded-box บนพื้น paper · ไม่มี shadow
 *   (shadow สงวนให้ element ที่ลอยจริงเท่านั้น เช่น dropdown / toast / sticky bar)
 * - หัวการ์ดมีเส้น rule ใต้หัวข้อ แบบบรรทัดในแบบฟอร์มราชการ
 * - padding 16px มือถือ / 20px ตั้งแต่ md (§4.4)
 */

import type { HTMLAttributes, ReactNode } from "react";

export type CardProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  /** หัวการ์ด — ไม่ใส่ = การ์ดไม่มีหัว */
  title?: ReactNode;
  /** ระดับ heading ของหัวการ์ด ให้ตรงกับโครงหน้า — h2 ใช้ text-title, h3 ใช้ text-subtitle */
  titleAs?: "h2" | "h3";
  children: ReactNode;
};

const cx = (...classes: (string | false | null | undefined)[]) =>
  classes.filter(Boolean).join(" ");

export default function Card({
  title,
  titleAs: Heading = "h2",
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <section
      className={cx("rounded-box border border-rule bg-paper p-4 md:p-5", className)}
      {...rest}
    >
      {title ? (
        <Heading
          className={cx(
            "mb-4 border-b border-rule pb-2 text-ink",
            Heading === "h2" ? "text-title" : "text-subtitle"
          )}
        >
          {title}
        </Heading>
      ) : null}
      {children}
    </section>
  );
}
