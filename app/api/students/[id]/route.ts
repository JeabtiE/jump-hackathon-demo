/**
 * /api/students/[id] — คน A ดูแล
 * GET   : ดึงข้อมูลนักเรียน 1 คน รวม PII (ใช้ตอนแก้ไข)
 * PATCH : แก้ไขข้อมูลนักเรียน
 *
 * 🔒 endpoint นี้คืน PII ได้เพราะเป็นการใช้ภายในระบบเรา (ครูดูข้อมูลเด็กที่ตัวเองดูแล)
 *    PII จะไม่ถูกส่งต่อไปยัง LLM API ในทุกกรณี
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUserId, unauthorizedResponse } from "@/lib/auth-guard";
import type { StudentDetail, UpdateStudentRequest } from "@/lib/types";

function clean(v?: string | null): string | null | undefined {
  if (v === undefined) return undefined;
  const t = v?.trim();
  return t ? t : null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();

    // 🔒 userId อยู่ใน where ตั้งแต่แรก — ของครูคนอื่นจะ "ไม่เจอ" โดยธรรมชาติ
    //    ตอบ 404 ไม่ใช่ 403 (ดูเหตุผลใน lib/auth-guard.ts)
    const s = await prisma.student.findFirst({ where: { id: params.id, userId } });
    if (!s) return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 404 });

    const detail: StudentDetail = {
      id: s.id,
      code: s.code,
      disabilityType: s.disabilityType as StudentDetail["disabilityType"],
      gradeLevel: s.gradeLevel,
      note: s.note,
      fullName: s.fullName ?? undefined,
      nationalId: s.nationalId ?? undefined,
      disabilityCardNo: s.disabilityCardNo ?? undefined,
      birthDate: s.birthDate ?? undefined,
      religion: s.religion ?? undefined,
      disabilityDetail: s.disabilityDetail ?? undefined,
      fatherName: s.fatherName ?? undefined,
      motherName: s.motherName ?? undefined,
      guardianName: s.guardianName ?? undefined,
      guardianRelation: s.guardianRelation ?? undefined,
      address: s.address ?? undefined,
      phone: s.phone ?? undefined,
      schoolName: s.schoolName ?? undefined,
      affiliation: s.affiliation ?? undefined,
      medicalNote: s.medicalNote ?? undefined,
      educationHistory: s.educationHistory ?? undefined,
    };

    return NextResponse.json(detail);
  } catch (err) {
    const unauthorized = unauthorizedResponse(err);
    if (unauthorized) return unauthorized;

    console.error("GET /api/students/[id] failed:", err);
    return NextResponse.json({ error: "ดึงข้อมูลนักเรียนไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();

    const body = (await request.json()) as UpdateStudentRequest;

    const existing = await prisma.student.findFirst({
      where: { id: params.id, userId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 404 });

    // PATCH แก้ code ได้ จึงต้องเช็คซ้ำแบบเดียวกับตอน POST
    // (เดิมไม่เคยเช็คเลย — อาศัย unique ทั้ง DB แล้วปล่อยให้ P2002 หลุดเป็น 500)
    // id: { not: ... } เพื่อไม่ให้แถวตัวเองนับเป็นคู่ที่ชนกัน
    if (body.code !== undefined) {
      const clash = await prisma.student.findFirst({
        where: { userId, code: body.code.trim(), id: { not: existing.id } },
        select: { id: true },
      });
      if (clash) {
        return NextResponse.json({ error: "รหัสนี้มีอยู่แล้ว กรุณาใช้รหัสอื่น" }, { status: 409 });
      }
    }

    // ⚠️ update ด้วย id ล้วนได้ เพราะผ่านการยืนยันเจ้าของมาแล้วบรรทัดบน
    //    และ body ไม่มีทางเขียนทับ userId — ไม่ได้อยู่ใน data ด้านล่างเลย
    const updated = await prisma.student.update({
      where: { id: existing.id },
      data: {
        ...(body.code !== undefined ? { code: body.code.trim() } : {}),
        ...(body.disabilityType !== undefined ? { disabilityType: body.disabilityType } : {}),
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

    return NextResponse.json({ id: updated.id, code: updated.code });
  } catch (err) {
    const unauthorized = unauthorizedResponse(err);
    if (unauthorized) return unauthorized;

    // ตาข่ายรองรับกรณีแข่งกันเขียน เหมือน POST /api/students
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "รหัสนี้มีอยู่แล้ว กรุณาใช้รหัสอื่น" }, { status: 409 });
    }

    console.error("PATCH /api/students/[id] failed:", err);
    return NextResponse.json({ error: "บันทึกการแก้ไขไม่สำเร็จ" }, { status: 500 });
  }
}

/** DELETE — ลบข้อมูลนักเรียนและแผนทั้งหมด (สิทธิ์ในการลบข้อมูลตาม PDPA) */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();

    // ⚠️ deleteMany ไม่ใช่ delete — delete รับได้แต่ unique field จึงใส่ userId
    //    ลงเงื่อนไขไม่ได้ ส่วน deleteMany รับ where แบบเต็มได้ และคืน count
    //    มาให้ตรวจว่าลบอะไรไปจริงไหม (ของเดิมไม่เช็ค existence เลย ยิงมั่วก็ได้ 200)
    // 🔥 การลบนี้ cascade ไปถึง Assessment / Plan / DomainSection / Goal / Media ทั้งหมด
    const { count } = await prisma.student.deleteMany({
      where: { id: params.id, userId },
    });

    // ลบไม่โดนแถวไหน = ไม่มี id นี้ หรือมีแต่ไม่ใช่ของเรา → ตอบ 404 เหมือนกันทั้งสองกรณี
    if (count === 0) {
      return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const unauthorized = unauthorizedResponse(err);
    if (unauthorized) return unauthorized;

    console.error("DELETE /api/students/[id] failed:", err);
    return NextResponse.json({ error: "ลบข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
