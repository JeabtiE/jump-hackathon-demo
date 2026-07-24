import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="th">
      <body className="bg-slate-50 antialiased">{children}</body>
    </html>
  );
}
