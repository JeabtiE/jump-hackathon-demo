/**
 * /api/assess/classify — คน A ดูแล
 *
 * POST: แปลงข้อความอิสระที่ครูพิมพ์ 1 ด้าน → ค่า enum ระดับความสามารถ (ข้อเสนอ)
 *   { disabilityType, domain, text } → AbilityClassification
 *
 * 🔑 เป็นแค่ "ข้อเสนอ" — ไม่บันทึก DB ไม่เรียก retrieval ไม่สร้างแผน
 *    ครูต้องยืนยัน/แก้ก่อน แล้วค่าที่ยืนยันแล้วจึงถูกส่งมาเป็น abilityLevels
 *    ตอน POST /api/plans เหมือนเดิมทุกประการ
 *
 * 🔒 เรียกฝั่ง server เท่านั้น — ANTHROPIC_API_KEY ไม่หลุดไป client
 *    (PII guard อยู่ใน lib/ability-classifier.ts แล้วทุกชั้น)
 *
 * 💡 ยิงทีละ domain ได้ — frontend เรียกตอนครูพิมพ์ช่องนั้นเสร็จ
 */

import { NextResponse } from "next/server";
import { classifyAbility } from "@/lib/ability-classifier";
import { requireUserId, unauthorizedResponse } from "@/lib/auth-guard";

interface ClassifyRequest {
  disabilityType?: string;
  domain?: string;
  text?: string;
}

export async function POST(request: Request) {
  try {
    // 🔒 route นี้ไม่แตะ DB จึงไม่มีอะไรให้ scope ตามเจ้าของ — บังคับได้แค่ว่าต้องล็อกอิน
    //    แต่จำเป็น: ถ้าเปิดโล่ง คนนอกยิง LLM ผ่านระบบเราได้ฟรีไม่จำกัด (เราจ่ายค่า token)
    //    ⚠️ ยังไม่มี quota ต่อคน — ครูที่ล็อกอินแล้วยังยิงได้ไม่จำกัด (งานต่อไป)
    await requireUserId();

    const body = (await request.json()) as ClassifyRequest;

    const disabilityType = body.disabilityType?.trim();
    const domain = body.domain?.trim();
    if (!disabilityType || !domain) {
      return NextResponse.json(
        { error: "กรุณาระบุประเภทความพิการและด้านที่ต้องการจัดระดับ" },
        { status: 400 }
      );
    }

    const result = await classifyAbility(disabilityType, domain, body.text ?? "");
    return NextResponse.json(result);
  } catch (err) {
    const unauthorized = unauthorizedResponse(err);
    if (unauthorized) return unauthorized;

    const msg = (err as Error).message ?? "";
    if (msg.startsWith("[PII GUARD]")) {
      console.error("POST /api/assess/classify PII guard tripped:", err);
      return NextResponse.json(
        { error: "ระบบตรวจพบข้อมูลส่วนบุคคลในคำขอ จึงยกเลิกการส่งข้อมูลเพื่อความปลอดภัย" },
        { status: 400 }
      );
    }

    console.error("POST /api/assess/classify failed:", err);
    return NextResponse.json(
      { error: "ระบบจัดระดับความสามารถขัดข้อง กรุณาเลือกระดับเอง" },
      { status: 502 }
    );
  }
}
