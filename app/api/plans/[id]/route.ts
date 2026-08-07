/**
 * /api/plans/[id] — คน A ดูแล
 * GET   : ดึงแผน 1 ฉบับ
 * PATCH : ครูแก้ไขข้อความ / เลือกเป้าหมาย / กดยืนยันแผน
 *
 * 🔑 การแก้ไขจะเปลี่ยนเฉพาะ finalText / finalReason
 *    ส่วน aiOriginal / aiReason ไม่แตะ → ระบบรู้เองว่าครูแก้อะไรบ้าง
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isKnownIndicatorCode } from "@/lib/curriculum-retrieval";
import { toPlanDTO } from "@/lib/serializers";
import { fetchAnnualMediaContext } from "@/lib/plan-queries";
import type { UpdatePlanRequest } from "@/lib/types";

const INCLUDE = {
  student: true,
  goals: { orderBy: { orderIndex: "asc" as const } },
  media: true,
};

/**
 * กรองรหัสตัวชี้วัดที่ครูส่งมา เหลือเฉพาะรหัสที่มีอยู่จริงในหลักสูตร
 *
 * ⚠️ ตรวจแค่ว่า "มีรหัสนี้จริงไหม" ไม่ตรวจว่าตรงกับระดับชั้นของนักเรียนหรือไม่ —
 *    ครูมีสิทธิ์อ้างตัวชี้วัดข้ามชั้นด้วยดุลยพินิจของตัวเอง ระบบไม่ตัดสินแทน (CLAUDE.md §4)
 */
function cleanIndicatorCodes(codes: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const raw of codes ?? []) {
    if (typeof raw !== "string") continue;
    const code = raw.trim();
    if (!code || seen.has(code)) continue;
    if (!isKnownIndicatorCode(code)) {
      console.warn("ทิ้งรหัสตัวชี้วัดที่ไม่มีในหลักสูตร:", code);
      continue;
    }
    seen.add(code);
    kept.push(code);
  }

  return kept;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const plan = await prisma.plan.findUnique({
      where: { id: params.id },
      include: INCLUDE,
    });
    if (!plan) return NextResponse.json({ error: "ไม่พบแผน" }, { status: 404 });

    // เพดานเงินอุดหนุนนับรวมทั้งปีการศึกษา — ต้องรู้ยอดของแผนอื่นด้วย (1 query)
    const annual = await fetchAnnualMediaContext({
      studentId: plan.studentId,
      academicYear: plan.academicYear,
      excludePlanId: plan.id,
    });

    return NextResponse.json(toPlanDTO(plan, annual));
  } catch (err) {
    console.error("GET /api/plans/[id] failed:", err);
    return NextResponse.json({ error: "ดึงข้อมูลแผนไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = (await request.json()) as UpdatePlanRequest;

    const existing = await prisma.plan.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: "ไม่พบแผน" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      // อัปเดตเป้าหมาย — แก้เฉพาะ finalText / finalIndicatorCodes ไม่แตะ aiOriginal / aiIndicatorCodes
      for (const g of body.goals ?? []) {
        await tx.planGoal.update({
          where: { id: g.id },
          data: {
            ...(g.finalText !== undefined ? { finalText: g.finalText } : {}),
            ...(g.isSelected !== undefined ? { isSelected: g.isSelected } : {}),
            ...(g.finalIndicatorCodes !== undefined
              ? { finalIndicatorCodes: cleanIndicatorCodes(g.finalIndicatorCodes) }
              : {}),
          },
        });
      }

      // อัปเดตสื่อ — แก้เฉพาะ finalReason ไม่แตะ aiReason
      for (const m of body.media ?? []) {
        await tx.planMedia.update({
          where: { id: m.id },
          data: {
            ...(m.finalReason !== undefined ? { finalReason: m.finalReason } : {}),
            ...(m.isApproved !== undefined ? { isApproved: m.isApproved } : {}),
          },
        });
      }

      // ── อัปเดตตัวแผนเอง: คณะกรรมการ (ส่วนที่ 7) + สถานะ ──
      // ส่งเฉพาะ key ที่ client ส่งมาจริง (undefined = ไม่แตะ, "" = ล้างค่า)
      const planData: Record<string, unknown> = {};

      if (body.principalName !== undefined)
        planData.principalName = body.principalName.trim() || null;
      if (body.responsibleTeacherName !== undefined)
        planData.responsibleTeacherName = body.responsibleTeacherName.trim() || null;
      if (body.homeroomTeacherName !== undefined)
        planData.homeroomTeacherName = body.homeroomTeacherName.trim() || null;
      if (body.meetingDate !== undefined)
        planData.meetingDate = body.meetingDate.trim() || null;

      // เปลี่ยนสถานะ — ถ้ายืนยันแผน บันทึกเวลาที่ใช้ทำ
      if (body.status) {
        planData.status = body.status;
        planData.finalizedAt =
          body.status === "finalized" ? (existing.finalizedAt ?? new Date()) : null;
      }

      if (Object.keys(planData).length > 0) {
        await tx.plan.update({ where: { id: params.id }, data: planData });
      }
    });

    const updated = await prisma.plan.findUnique({
      where: { id: params.id },
      include: INCLUDE,
    });

    // PATCH เปลี่ยน isApproved ได้ → ยอดรวมทั้งปีเปลี่ยนตาม ต้องคิดใหม่ทุกครั้ง
    const annual = await fetchAnnualMediaContext({
      studentId: updated!.studentId,
      academicYear: updated!.academicYear,
      excludePlanId: updated!.id,
    });

    return NextResponse.json(toPlanDTO(updated!, annual));
  } catch (err) {
    console.error("PATCH /api/plans/[id] failed:", err);
    return NextResponse.json({ error: "บันทึกการแก้ไขไม่สำเร็จ" }, { status: 500 });
  }
}
