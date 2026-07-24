/**
 * /api/students/[id] — คน A ดูแล
 * GET   : ดึงข้อมูลนักเรียน 1 คน รวม PII (ใช้ตอนแก้ไข)
 * PATCH : แก้ไขข้อมูลนักเรียน
 *
 * 🔒 endpoint นี้คืน PII ได้เพราะเป็นการใช้ภายในระบบเรา (ครูดูข้อมูลเด็กที่ตัวเองดูแล)
 *    PII จะไม่ถูกส่งต่อไปยัง LLM API ในทุกกรณี
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { StudentDetail, UpdateStudentRequest } from "@/lib/types";

function clean(v?: string | null): string | null | undefined {
  if (v === undefined) return undefined;
  const t = v?.trim();
  return t ? t : null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const s = await prisma.student.findUnique({ where: { id: params.id } });
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
    console.error("GET /api/students/[id] failed:", err);
    return NextResponse.json({ error: "ดึงข้อมูลนักเรียนไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json()) as UpdateStudentRequest;

    const existing = await prisma.student.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 404 });

    const updated = await prisma.student.update({
      where: { id: params.id },
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
    console.error("PATCH /api/students/[id] failed:", err);
    return NextResponse.json({ error: "บันทึกการแก้ไขไม่สำเร็จ" }, { status: 500 });
  }
}

/** DELETE — ลบข้อมูลนักเรียนและแผนทั้งหมด (สิทธิ์ในการลบข้อมูลตาม PDPA) */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.student.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/students/[id] failed:", err);
    return NextResponse.json({ error: "ลบข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
