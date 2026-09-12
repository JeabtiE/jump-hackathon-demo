/**
 * /api/auth/[...nextauth] — endpoint ทั้งหมดของ Auth.js
 * (signin / callback / signout / session / csrf — Auth.js จัดการเองทั้งหมด)
 *
 * ⚠️ ต้องเป็น Node runtime — auth.ts ลาก PrismaAdapter เข้ามาด้วย ซึ่งรันบน Edge ไม่ได้
 */

import { handlers } from "@/auth";

export const runtime = "nodejs";

export const { GET, POST } = handlers;
