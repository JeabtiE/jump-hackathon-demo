/**
 * app/page.tsx — เปลือกฝั่ง server บางๆ ของหน้าหลัก
 *
 * มีหน้าที่เดียว: สร้าง <AuthHeader /> (ซึ่งอ่าน session ฝั่ง server) แล้วส่งลงไป
 * ให้ HomeClient วางในแถวหัวเรื่องเดิม เนื้อหาหน้าทั้งหมดยังอยู่ที่ app/HomeClient.tsx
 *
 * ⚠️ ทำไมต้องแยกไฟล์: HomeClient เป็น "use client" ซึ่ง import Server Component
 *    เข้าไปตรงๆ ไม่ได้ แต่ "รับมาเป็น prop" ได้ — เป็นวิธีมาตรฐานของ Next.js
 *    ที่ทำให้ยังเรียก auth() ฝั่ง server ได้ โดยไม่ต้องมี SessionProvider
 *    และไม่ต้องแปลงหน้าเดิมให้เป็นอย่างอื่น
 */

import AuthHeader from "@/components/AuthHeader";
import HomeClient from "./HomeClient";

export default function Page() {
  return <HomeClient authSlot={<AuthHeader />} />;
}
