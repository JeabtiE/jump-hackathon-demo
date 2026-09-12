/**
 * middleware.ts — บังคับล็อกอินทุก path
 *
 * ✏️ เขียนทับ "ประตูรหัสผ่านชั่วคราว" (cookie iepgen_gate) ที่ทำไว้ตอนยังไม่มี auth
 *    ตอนนี้เป็นของจริงแล้ว: Auth.js + Google OAuth + allowlist
 *
 * ⚠️ import จาก auth.config.ts เท่านั้น ห้าม import auth.ts
 *    auth.ts ลาก PrismaAdapter มาด้วย ซึ่งรันบน Edge runtime ไม่ได้
 *    (ตรวจ session ที่นี่ไม่ต้องแตะ DB อยู่แล้ว เพราะใช้ JWT strategy)
 */

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

/** path ที่ต้องเข้าได้ตอนยังไม่ล็อกอิน ไม่งั้นจะ redirect วนไม่จบ */
// ⚠️ /privacy ต้องอยู่ในนี้เสมอ — Google ขอเปิดดูหน้านโยบายความเป็นส่วนตัว
//    ตอนตรวจ OAuth consent screen ถ้าโดนเด้งไปหน้าล็อกอิน จะ publish ไม่ผ่าน
const PUBLIC_PATHS = ["/auth", "/api/auth", "/privacy"];

export default auth((request) => {
  const { pathname } = request.nextUrl;

  // 🔒 bypass ได้เฉพาะเครื่อง dev เท่านั้น — ต้องเข้าทั้งสองเงื่อนไข
  //    ห้ามเช็ค USE_MOCK อย่างเดียว: เผลอตั้ง USE_MOCK=true บน Vercel เมื่อไหร่
  //    ระบบจะเปิดโล่งให้ใครก็อ่าน PII ของนักเรียนได้ทันทีโดยไม่มีอะไรเตือน
  if (process.env.NODE_ENV !== "production" && process.env.USE_MOCK === "true") {
    return NextResponse.next();
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (request.auth) return NextResponse.next();

  // API ตอบ 401 JSON ไม่ redirect — ถ้า redirect 307 ไปหน้า signin ตัว fetch ฝั่ง client
  // จะได้ HTML กลับไปพร้อม status 200 แล้ว res.ok เป็น true → res.json() พังแบบงงๆ
  // (เกิดจริงตอน session หมดอายุกลางทางขณะครูเปิดหน้าค้างไว้)
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "กรุณาลงชื่อเข้าใช้ก่อนใช้งาน" },
      { status: 401 }
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = "/auth/signin";
  url.search = "";
  return NextResponse.redirect(url);
});

export const config = {
  // ครอบทุก path ยกเว้น /_next/** และ /favicon.ico
  // ⚠️ ต้องเป็น literal — Next วิเคราะห์ตอน build จะใส่ตัวแปรไม่ได้
  matcher: ["/((?!_next/|favicon.ico).*)"],
};
