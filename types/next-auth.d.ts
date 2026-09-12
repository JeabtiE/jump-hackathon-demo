/**
 * ต่อ type ของ Auth.js ให้รู้จัก session.user.id
 *
 * ไม่มีไฟล์นี้ = เขียน session.user.id แล้ว TS ฟ้องว่าไม่มี property นี้
 * (Phase 3 ทุก route จะอ่านค่านี้เป็นตัวกรองข้อมูลตามเจ้าของ)
 */

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** = User.id ใน DB */
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
