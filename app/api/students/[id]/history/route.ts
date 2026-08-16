/**
 * GET /api/students/[id]/history — คน A ดูแล
 *
 * แสดงพัฒนาการนักเรียนข้ามปี — query Assessment + Plan ที่ผูกกันอยู่แล้ว
 * ไม่มี AI call ใหม่ ไม่แก้ schema ใช้ความสัมพันธ์ Assessment.plans เดิม
 *
 * 🔒 fullName เป็น PII แต่ endpoint นี้ใช้แสดงผลในระบบเท่านั้น (เหมือน /api/students/[id])
 *    ไม่เคยถูกส่งต่อไป LLM
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { StudentHistoryDTO } from "@/lib/types";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const student = await prisma.student.findUnique({
      where: { id: params.id },
      include: {
        assessments: {
          orderBy: { assessedAt: "asc" },
          include: {
            plans: {
              select: {
                id: true,
                academicYear: true,
                term: true,
                status: true,
                finalizedAt: true,
                goals: { select: { isSelected: true } },
              },
            },
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 404 });
    }

    const history: StudentHistoryDTO["history"] = student.assessments.map((a) => ({
      assessmentId: a.id,
      assessedAt: a.assessedAt.toISOString(),
      abilityLevels: a.abilityLevels as StudentHistoryDTO["history"][number]["abilityLevels"],
      strengths: a.strengths,
      plans: a.plans.map((p) => ({
        id: p.id,
        academicYear: p.academicYear,
        term: p.term,
        status: p.status as StudentHistoryDTO["history"][number]["plans"][number]["status"],
        finalizedAt: p.finalizedAt?.toISOString() ?? null,
        goalCount: p.goals.length,
        selectedGoalCount: p.goals.filter((g) => g.isSelected).length,
      })),
    }));

    const dto: StudentHistoryDTO = {
      studentId: student.id,
      code: student.code,
      fullName: student.fullName,
      history,
    };

    return NextResponse.json(dto);
  } catch (err) {
    console.error("GET /api/students/[id]/history failed:", err);
    return NextResponse.json({ error: "ดึงประวัติพัฒนาการไม่สำเร็จ" }, { status: 500 });
  }
}