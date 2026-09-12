/**
 * /api/students — คน A ดูแล
 * GET  : ดึงรายชื่อนักเรียนทั้งหมด
 * POST : เพิ่มนักเรียนใหม่ (รวมข้อมูลส่วนบุคคลสำหรับใช้ตอน export)
 *
 * 🔒 ข้อมูล PII ที่บันทึกที่นี่ ใช้เฉพาะตอน export เอกสาร .docx
 *    ไม่เคยถูกส่งไปยัง LLM API (ดู lib/pii-guard.ts)
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUserId, unauthorizedResponse } from "@/lib/auth-guard";
import type { CreateStudentRequest, StudentSummary } from "@/lib/types";

export async function GET() {
  try {
    const userId = await requireUserId();

    const students = await prisma.student.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        code: true,
        fullName: true,
        disabilityType: true,
        gradeLevel: true,
        plans: {
          select: { createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: { select: { plans: true } },
      },
    });

    const result: StudentSummary[] = students.map((s) => ({
      id: s.id,
      code: s.code,
      fullName: s.fullName,
      disabilityType: s.disabilityType as StudentSummary["disabilityType"],
      gradeLevel: s.gradeLevel,
      planCount: s._count.plans,
      latestPlanAt: s.plans[0]?.createdAt.toISOString() ?? null,
    }));

    return NextResponse.json(result);
  } catch (err) {
    const unauthorized = unauthorizedResponse(err);
    if (unauthorized) return unauthorized;

    console.error("GET /api/students failed:", err);
    return NextResponse.json({ error: "ดึงข้อมูลนักเรียนไม่สำเร็จ" }, { status: 500 });
  }
}

/** ตัดช่องว่างและแปลง empty string เป็น null สำหรับเก็บใน DB */
function clean(v?: string | null): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();

    const body = (await request.json()) as CreateStudentRequest;

    if (!body.code?.trim()) {
      return NextResponse.json({ error: "กรุณาระบุรหัสนักเรียน" }, { status: 400 });
    }
    if (!body.disabilityType) {
      return NextResponse.json({ error: "กรุณาระบุประเภทความพิการ" }, { status: 400 });
    }

    // เช็ครหัสซ้ำเฉพาะในขอบเขตของครูคนนี้ — รหัสเป็นของที่ครูตั้งเอง ("A-01")
    // ครูคนละคนจะตั้งชนกันเป็นเรื่องปกติ ไม่ควรเป็นความผิดของใคร
    // ตรงกับ @@unique([userId, code]) ใน schema เป๊ะ (ไม่ใช่ unique ทั้ง DB อีกแล้ว)
    const existing = await prisma.student.findFirst({
      where: { userId, code: body.code.trim() },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: "รหัสนี้มีอยู่แล้ว กรุณาใช้รหัสอื่น" }, { status: 409 });
    }

    const student = await prisma.student.create({
      data: {
        // 🔒 เจ้าของมาจาก session เท่านั้น — ห้ามอ่านจาก body ไม่ว่ากรณีใด
        //    ไม่งั้นใครก็ยัด userId ของครูคนอื่นมาสร้างข้อมูลในชื่อเขาได้
        userId,
        code: body.code.trim(),
        disabilityType: body.disabilityType,
        gradeLevel: clean(body.gradeLevel),
        note: clean(body.note),
        // ── PII ZONE ──
        fullName: clean(body.fullName),
        nationalId: clean(body.nationalId),
        disabilityCardNo: clean(body.disabilityCardNo),
        birthDate: clean(body.birthDate),
        religion: clean(body.religion),
        disabilityDetail: clean(body.disabilityDetail),
        fatherName: clean(body.fatherName),
        motherName: clean(body.motherName),
        guardianName: clean(body.guardianName),
        guardianRelation: clean(body.guardianRelation),
        address: clean(body.address),
        phone: clean(body.phone),
        schoolName: clean(body.schoolName),
        affiliation: clean(body.affiliation),
        medicalNote: clean(body.medicalNote),
        educationHistory: clean(body.educationHistory),
      },
    });

    return NextResponse.json(
      { id: student.id, code: student.code, fullName: student.fullName },
      { status: 201 }
    );
  } catch (err) {
    const unauthorized = unauthorizedResponse(err);
    if (unauthorized) return unauthorized;

    // P2002 = ชน @@unique([userId, code]) — เป็นตาข่ายรองรับกรณีแข่งกันเขียน
    // (ครูกดปุ่มสองครั้งเร็วๆ แล้วสองคำขอผ่านการเช็คด้านบนพร้อมกัน)
    // ตอนนี้ constraint scope อยู่ในครูคนเดียวกันแล้ว จึงบอกตรงๆ ได้ว่ารหัสซ้ำ
    // ไม่เสี่ยงเปิดเผยว่าครูคนอื่นใช้รหัสอะไรอยู่
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "รหัสนี้มีอยู่แล้ว กรุณาใช้รหัสอื่น" }, { status: 409 });
    }

    console.error("POST /api/students failed:", err);
    return NextResponse.json({ error: "บันทึกข้อมูลนักเรียนไม่สำเร็จ" }, { status: 500 });
  }
}
