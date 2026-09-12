/**
 * lib/auth-guard.ts — ด่านเดียวที่ทุก API route ใช้ถามว่า "ใครเรียกมา"
 *
 * 🔑 ทุก route ใน app/api/** (ยกเว้น app/api/auth/** ที่เป็นของ Auth.js เอง)
 *    ต้องเรียก requireUserId() เป็นบรรทัดแรกในสุด — ห้าม copy โค้ดอ่าน session
 *    ไปเขียนซ้ำในแต่ละไฟล์ ถ้าวันหนึ่งกฎการยืนยันตัวตนเปลี่ยน ต้องแก้ที่นี่ที่เดียว
 *
 * 🔒 กฎ 404-ไม่ใช่-403 (ใช้ทุก route):
 *    หาไม่เจอ กับ เจอแต่ไม่ใช่ข้อมูลของเรา → ต้องตอบเหมือนกันคือ 404
 *    ถ้าตอบ 403 เท่ากับบอกคนนอกว่า "id นี้มีอยู่จริงในระบบนะ แค่ไม่ใช่ของคุณ"
 *    ซึ่งเดาไล่ id ไปเรื่อยๆ ก็นับจำนวนนักเรียนในระบบได้
 *    → วิธีบังคับกฎนี้คือใส่ userId ลงใน where ตั้งแต่แรก แล้วผลลัพธ์ที่ได้คือ
 *      "ไม่เจอ" โดยธรรมชาติ ไม่ต้องเขียน if แยกว่าเป็นของใคร
 *
 * ⚠️ ไฟล์นี้ไม่แตะ lib/pii-guard.ts และไม่เกี่ยวกับกำแพง PII ฝั่ง LLM เลย
 *    คนละชั้นกัน: pii-guard กันข้อมูลรั่วออกไปหา LLM / auth-guard กันคนนอกเข้ามาอ่าน
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";

/** โยนเมื่อไม่มี session — ให้ catch ของ route แปลงเป็น 401 ผ่าน unauthorizedResponse() */
export class UnauthorizedError extends Error {
  constructor() {
    super("UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

/**
 * คืน userId ของครูที่ล็อกอินอยู่ — ไม่มี session ก็โยน UnauthorizedError
 *
 * 💡 ใช้ JWT strategy จึงไม่มี query DB ตรงนี้ เรียกทุก request ได้โดยไม่กิน
 *    connection ของ pgbouncer (connection_limit=1)
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) throw new UnauthorizedError();

  return userId;
}

/**
 * ใช้ในบล็อก catch ของทุก route:
 *
 *   } catch (err) {
 *     const unauthorized = unauthorizedResponse(err);
 *     if (unauthorized) return unauthorized;
 *     console.error("GET /api/xxx failed:", err);
 *     return NextResponse.json({ error: "..." }, { status: 500 });
 *   }
 *
 * คืน null ถ้าไม่ใช่ error เรื่องสิทธิ์ → ให้ route จัดการต่อเองตามเดิม
 */
export function unauthorizedResponse(err: unknown): NextResponse | null {
  if (!(err instanceof UnauthorizedError)) return null;

  return NextResponse.json(
    { error: "กรุณาลงชื่อเข้าใช้ก่อนใช้งาน" },
    { status: 401 }
  );
}
