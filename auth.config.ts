/**
 * auth.config.ts — ส่วนของ Auth.js ที่ "รันบน Edge ได้"
 *
 * 🔑 ทำไมต้องแยกเป็น 2 ไฟล์ (ไฟล์นี้ + auth.ts):
 *    middleware.ts รันบน Edge runtime ซึ่งรัน Prisma ไม่ได้ → เอา adapter ใส่ที่นี่ไม่ได้
 *    ไฟล์นี้จึงมีแต่ของที่ไม่แตะ DB (provider / session / callbacks ที่ใช้แค่ token)
 *    ส่วน adapter กับ callback ที่ต้อง query DB อยู่ใน auth.ts ที่รันบน Node เท่านั้น
 *    → middleware import ไฟล์นี้, route handler import auth.ts
 *
 * ⚠️ ห้าม import อะไรจาก lib/db.ts หรือ @prisma/client เข้ามาในไฟล์นี้เด็ดขาด
 *    ใส่เมื่อไหร่ middleware จะพังตอน build ด้วย error ที่อ่านไม่รู้เรื่อง
 */

import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/** 30 วัน — ครูไม่ควรต้องล็อกอินบ่อย (ทั้ง cookie และอายุ JWT) */
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export const authConfig = {
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          // ⚠️ ครูหลายคนมีทั้ง Gmail ส่วนตัวและอีเมลโรงเรียนล็อกอินค้างไว้ในเบราว์เซอร์
          // ถ้าไม่ใส่ Google จะเด้งเข้าบัญชีล่าสุดให้เลย แล้วครูจะงงว่าทำไมเข้าไม่ได้
          // ทั้งที่ "ก็กดเข้าไปแล้ว" — บังคับให้เลือกบัญชีทุกครั้ง
          prompt: "select_account",
        },
      },
    }),
  ],

  session: {
    // 🔒 ห้ามเปลี่ยนเป็น "database" — DATABASE_URL วิ่งผ่าน pgbouncer ที่ connection_limit=1
    //    database session จะยิง query ทุก request แล้วแย่ง connection กับ query ของแอปจริง
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE,
  },

  pages: {
    signIn: "/auth/signin",
    // ⚠️ ชี้ error กลับมาหน้า signin ของเราเอง — หน้า error เริ่มต้นของ Auth.js
    //    เป็นภาษาอังกฤษล้วนและโชว์ error code ดิบ ซึ่งครูอ่านไม่ออก
    error: "/auth/signin",
  },

  // จำเป็นบน Vercel preview / self-host ที่ host ไม่ตรงกับ AUTH_URL
  trustHost: true,

  callbacks: {
    /**
     * ยัด user.id ลง token ตอนล็อกอินครั้งแรก
     * (รอบถัดๆ ไป user เป็น undefined — token ที่มีอยู่แล้วถูกส่งผ่านมาเฉยๆ)
     */
    async jwt({ token, user }) {
      if (user?.id) token.id = user.id;
      return token;
    },

    /**
     * ย้าย id จาก token ออกมาที่ session.user.id
     * 🔑 Phase 3 ทุก route จะพึ่งค่านี้เป็นตัวกรองข้อมูลตามเจ้าของ
     */
    async session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
