/**
 * GET /api/students/[id]/history — คน A ดูแล
 *
 * แสดงพัฒนาการนักเรียนข้ามปี — query Assessment + Plan ที่ผูกกันอยู่แล้ว
 * ไม่มี AI call ใหม่ ไม่แก้ schema เพิ่ม ใช้ความสัมพันธ์ Assessment.plans เดิม
 *
 * ✏️ 17 ส.ค. 2569 — แก้ตาม schema ใหม่: Plan ไม่มี `goals` ตรงๆ อีกต่อไป
 *    (ย้ายไปอยู่ใต้ PlanDomainSection ตามโครงสร้างเอกสารจริง §14) ต้อง select
 *    ผ่าน domainSections ก่อนแล้ว flatten รวมกันตอนนับ goalCount/selectedGoalCount
 *    — ตัวเลขที่ history endpoint นี้คืนออกไปมีความหมายเหมือนเดิมทุกประการ
 *    (จำนวนเป้าหมายทั้งหมด/ที่เลือกในแผนนั้น) แค่ต้อง query อ้อมขึ้นหนึ่งชั้น
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
                // ✏️ เดิม: goals: { select: { isSelected: true } } ตรงนี้เลย
                //    ตอนนี้ต้องอ้อมผ่าน domainSections ก่อน
                domainSections: {
                  select: {
                    goals: { select: { isSelected: true } },
                  },
                },
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
      plans: a.plans.map((p) => {
        // รวมเป้าหมายจากทุก domain section ในแผนนี้เข้าด้วยกัน — ตัวเลขที่ได้
        // เหมือนเดิมทุกประการกับตอนที่ query goals ตรงจาก Plan
        const allGoals = p.domainSections.flatMap((s) => s.goals);
        return {
          id: p.id,
          academicYear: p.academicYear,
          term: p.term,
          status: p.status as StudentHistoryDTO["history"][number]["plans"][number]["status"],
          finalizedAt: p.finalizedAt?.toISOString() ?? null,
          goalCount: allGoals.length,
          selectedGoalCount: allGoals.filter((g) => g.isSelected).length,
        };
      }),
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
