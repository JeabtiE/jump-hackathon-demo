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
import { toPlanDTO } from "@/lib/serializers";
import type { UpdatePlanRequest } from "@/lib/types";

const INCLUDE = {
  student: true,
  goals: { orderBy: { orderIndex: "asc" as const } },
  media: true,
};

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const plan = await prisma.plan.findUnique({
      where: { id: params.id },
      include: INCLUDE,
    });
    if (!plan) return NextResponse.json({ error: "ไม่พบแผน" }, { status: 404 });
    return NextResponse.json(toPlanDTO(plan));
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
      // อัปเดตเป้าหมาย — แก้เฉพาะ finalText ไม่แตะ aiOriginal
      for (const g of body.goals ?? []) {
        await tx.planGoal.update({
          where: { id: g.id },
          data: {
            ...(g.finalText !== undefined ? { finalText: g.finalText } : {}),
            ...(g.isSelected !== undefined ? { isSelected: g.isSelected } : {}),
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

    return NextResponse.json(toPlanDTO(updated!));
  } catch (err) {
    console.error("PATCH /api/plans/[id] failed:", err);
    return NextResponse.json({ error: "บันทึกการแก้ไขไม่สำเร็จ" }, { status: 500 });
  }
}
