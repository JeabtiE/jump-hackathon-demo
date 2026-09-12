/**
 * components/AuthHeader.tsx — ฝั่ง server ของเมนูบัญชีผู้ใช้
 *
 * 🔑 หน้าที่เดียว: อ่าน session ด้วย auth() ฝั่ง server แล้วส่งค่าที่จำเป็นลงไปให้
 *    AuthMenu (client) ซึ่งจัดการการเปิด/ปิด dropdown
 *
 *    ส่งลงไปแค่ email กับ image เท่านั้น — ไม่ส่งทั้ง session object
 *    (ทุกอย่างที่ส่งเข้า client component จะถูก serialize ไปอยู่ใน HTML ที่ browser เห็น)
 *
 * ⚠️ ไม่มี SessionProvider และไม่ยิง /api/auth/session จากเบราว์เซอร์
 *
 * ⚠️ หน้าที่ใช้ component นี้เป็น "use client" ทั้งหมด ซึ่ง import Server Component
 *    เข้าไปตรงๆ ไม่ได้ → ส่งเข้าไปเป็น prop (authSlot) จาก page.tsx ฝั่ง server แทน
 *    (โครงเดิมจาก Phase 4 ไม่เปลี่ยน — ดู app/page.tsx)
 *
 * 🔒 ห้าม console.log session หรือ object ผู้ใช้ในไฟล์นี้
 */

import { auth, signOut } from "@/auth";
import AuthMenu from "./AuthMenu";

export default async function AuthHeader() {
  const session = await auth();
  const email = session?.user?.email;

  // ปกติไม่เกิด เพราะ middleware บังคับล็อกอินก่อนเข้าถึงหน้าพวกนี้อยู่แล้ว
  // แต่กันไว้ไม่ให้หน้าพังถ้า session หมดอายุพอดีตอน render
  if (!email) return null;

  /**
   * นิยาม server action ที่นี่แล้วส่งลงไปเป็น prop
   * — client component นิยาม server action เองไม่ได้ แต่รับมาเรียกผ่าน <form action={...}> ได้
   *
   * ใช้ signOut() ไม่ใช่ลิงก์ไป /api/auth/signout เพราะหน้านั้นเป็นภาษาอังกฤษ
   * และโชว์ error code ดิบ ครูอ่านไม่ออก (เหตุผลเดียวกับ pages.error ใน auth.config.ts)
   */
  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/auth/signin" });
  }

  return (
    <AuthMenu
      email={email}
      image={session?.user?.image ?? null}
      signOutAction={signOutAction}
    />
  );
}
