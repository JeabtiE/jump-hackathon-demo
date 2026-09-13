import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai_Looped } from "next/font/google";
import "./globals.css";

/**
 * ฟอนต์ UI ตัวเดียวของทั้งแอป (DESIGN.md §3)
 *
 * ⚠️ ห้ามเพิ่ม Sarabun ที่นี่ — รอพื้นที่พรีวิวเอกสาร (DESIGN.md §6 กอง B2/B7)
 *    ฟอนต์ไทยมี subset หนัก ไม่จ่ายค่าโหลดให้พื้นที่ที่ยังไม่มี
 *
 * ผูกเป็น CSS variable --font-plex-looped → globals.css ตั้งให้ body
 * และ tailwind.config.ts เปิดเป็น class font-ui
 *
 * weight 700 เป็นค่าถาวร — font-bold ถูกใช้จริงในหลายหน้า ถ้าไม่โหลด เบราว์เซอร์จะทำ faux bold
 * ซึ่งกับฟอนต์ไทยเส้นจะบวมและหัวตัวอักษรเสียรูป
 */
const plexLooped = IBM_Plex_Sans_Thai_Looped({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plex-looped",
});

export const metadata: Metadata = {
  title: "IEP GEN — ผู้ช่วยครูการศึกษาพิเศษ",
  description: "กรอกข้อมูลนักเรียนครั้งเดียว รับเป้าหมาย IEP และรายการสื่อที่เบิกได้",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className={plexLooped.variable}>
      <body className="bg-slate-50 antialiased">{children}</body>
    </html>
  );
}
