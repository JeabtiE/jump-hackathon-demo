/**
 * auth.ts — Auth.js v5 ตัวเต็ม (รันบน Node runtime เท่านั้น)
 *
 * ต่อ PrismaAdapter เข้ากับ prisma client ตัวเดียวกับที่ทั้งแอปใช้ (lib/db.ts)
 * — ห้าม new PrismaClient() ขึ้นมาใหม่ที่นี่ ไม่งั้นจะกิน connection เพิ่มอีกชุด
 *   ทั้งที่ pgbouncer ตั้ง connection_limit=1 ไว้
 *
 * 🔒 signup เสรี = ปิดตาย — ระบบนี้มี PII ของเด็กพิการ ใครก็ตามที่มีบัญชี Google
 *    ต้องล็อกอินไม่ผ่าน ยกเว้นอีเมลที่ถูกใส่ไว้ใน AllowedEmail ล่วงหน้าแล้วเท่านั้น
 *
 * 💡 อยากเพิ่มครูคนใหม่: insert แถวลง AllowedEmail (ยังไม่มีหน้า UI ให้ทำ — Phase 3)
 */

import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,

    /**
     * ประตูเดียวที่ตัดสินว่าใครเข้าระบบได้
     *
     * คืน string = redirect ไปหน้านั้น (Auth.js v5 รองรับ) แทนที่จะ throw AccessDenied
     * ซึ่งจะพาไปหน้า error ภาษาอังกฤษ — เราอยากให้ครูเห็นหน้าไทยที่บอกว่าต้องทำยังไงต่อ
     *
     * ⚠️ lowercase ก่อนเทียบเสมอ — Google คืนอีเมลตามที่ผู้ใช้พิมพ์ตอนสมัคร
     *    ส่วนใน AllowedEmail เก็บ lowercase (scripts/backfill-owner.ts ก็ lowercase ก่อนเขียน)
     */
    async signIn({ user }) {
      const email = user.email?.trim().toLowerCase();
      if (!email) return "/auth/denied";

      const allowed = await prisma.allowedEmail.findUnique({ where: { email } });
      if (!allowed) {
        // ส่งอีเมลไปให้หน้า denied แสดง ครูจะได้รู้ว่าตัวเองเผลอใช้บัญชีไหนเข้ามา
        return `/auth/denied?email=${encodeURIComponent(email)}`;
      }

      return true;
    },
  },
});
