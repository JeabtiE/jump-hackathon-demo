/**
 * /api/plans/[id] — คน A ดูแล
 * GET   : ดึงแผน 1 ฉบับ
 * PATCH : ครูแก้ไขข้อความ / เลือกเป้าหมาย / กดยืนยันแผน
 *
 * 🔑 การแก้ไขจะเปลี่ยนเฉพาะ finalXxx ส่วน aiXxx ไม่แตะ → ระบบรู้เองว่าครูแก้อะไรบ้าง
 *
 * ✏️ 17 ส.ค. 2569 — เพิ่มการแก้ไขระดับ domain section (จุดเด่น/จุดที่ควรพัฒนา/
 *    เป้าหมายระยะยาว/วิธีประเมิน/ผู้รับผิดชอบ) นอกเหนือจากระดับ goal เดิม
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isKnownIndicatorCode } from "@/lib/curriculum-retrieval";
import { toPlanDTO } from "@/lib/serializers";
import { fetchAnnualMediaContext } from "@/lib/plan-queries";
import { requireUserId, unauthorizedResponse } from "@/lib/auth-guard";
import type { UpdatePlanRequest } from "@/lib/types";

const INCLUDE = {
  student: true,
  domainSections: {
    orderBy: { orderIndex: "asc" as const },
    include: { goals: { orderBy: { orderIndex: "asc" as const } } },
  },
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
    const userId = await requireUserId();

    // 🔒 ไต่ผ่าน student ไปหา userId — Plan ไม่มี userId ของตัวเองโดยตั้งใจ
    //    (source of truth ของเจ้าของอยู่ที่ Student ที่เดียว ดู prisma/schema.prisma)
    const plan = await prisma.plan.findFirst({
      where: { id: params.id, student: { userId } },
      include: INCLUDE,
    });
    if (!plan) return NextResponse.json({ error: "ไม่พบแผน" }, { status: 404 });

    const annual = await fetchAnnualMediaContext({
      studentId: plan.studentId,
      academicYear: plan.academicYear,
      excludePlanId: plan.id,
    });

    return NextResponse.json(toPlanDTO(plan, annual));
  } catch (err) {
    const unauthorized = unauthorizedResponse(err);
    if (unauthorized) return unauthorized;

    console.error("GET /api/plans/[id] failed:", err);
    return NextResponse.json({ error: "ดึงข้อมูลแผนไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const userId = await requireUserId();

    const body = (await request.json()) as UpdatePlanRequest;

    // ดึงแผนพร้อม id ลูกทั้งหมดมาในคิวรีเดียว — ใช้ทั้งยืนยันเจ้าของและสร้างชุด id ที่ถูกต้อง
    const existing = await prisma.plan.findFirst({
      where: { id: params.id, student: { userId } },
      include: {
        domainSections: { select: { id: true, goals: { select: { id: true } } } },
        media: { select: { id: true } },
      },
    });
    if (!existing) return NextResponse.json({ error: "ไม่พบแผน" }, { status: 404 });

    // ── 🔒 ตรวจว่า id ทุกตัวที่ client ส่งมาอยู่ในแผนฉบับนี้จริง ──
    // ของเดิม update ด้วย id ที่ client ส่งมาตรงๆ โดยไม่ตรวจว่าอยู่ในแผนไหน
    // → รู้ goal id ของครูคนอื่นแค่ตัวเดียว ก็เขียนทับเป้าหมายในแผนของเขาได้
    //   ผ่านแผนของตัวเอง (เจ้าของแผนถูกต้อง แต่ลูกเป็นของคนอื่น)
    const sectionIds = new Set(existing.domainSections.map((s) => s.id));
    const goalIds = new Set(existing.domainSections.flatMap((s) => s.goals.map((g) => g.id)));
    const mediaIds = new Set(existing.media.map((m) => m.id));

    const invalidIds: string[] = [
      ...(body.domainSections ?? []).filter((s) => !sectionIds.has(s.id)).map((s) => s.id),
      ...(body.goals ?? []).filter((g) => !goalIds.has(g.id)).map((g) => g.id),
      ...(body.media ?? []).filter((m) => !mediaIds.has(m.id)).map((m) => m.id),
    ];

    // ⚠️ เจอ id นอกแผนแม้ตัวเดียว = ปฏิเสธทั้ง request ห้าม update บางส่วนแล้วข้ามที่เหลือ
    //    ไม่งั้นครูจะเห็นว่า "บันทึกสำเร็จ" ทั้งที่บางช่องไม่ได้ถูกบันทึกจริง
    if (invalidIds.length > 0) {
      // log แค่ id ห้าม log เนื้อหาแผนหรือข้อมูลนักเรียน
      console.warn("PATCH /api/plans/[id] ปฏิเสธ id ที่ไม่อยู่ในแผน:", {
        planId: params.id,
        invalidIds,
      });
      return NextResponse.json(
        { error: "ข้อมูลที่ส่งมาไม่ตรงกับแผนฉบับนี้ กรุณารีเฟรชหน้าแล้วลองใหม่" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // ── ✏️ ใหม่: อัปเดตระดับ domain section — แก้เฉพาะ finalXxx ไม่แตะ aiXxx ──
      for (const s of body.domainSections ?? []) {
        await tx.planDomainSection.update({
          where: { id: s.id },
          data: {
            ...(s.finalStrengths !== undefined ? { finalStrengths: s.finalStrengths } : {}),
            ...(s.finalDevelopmentAreas !== undefined
              ? { finalDevelopmentAreas: s.finalDevelopmentAreas }
              : {}),
            ...(s.finalLongTermGoal !== undefined
              ? { finalLongTermGoal: s.finalLongTermGoal }
              : {}),
            ...(s.finalEvaluationMethod !== undefined
              ? { finalEvaluationMethod: s.finalEvaluationMethod }
              : {}),
            ...(s.responsibleTeacherName !== undefined
              ? { responsibleTeacherName: s.responsibleTeacherName.trim() || null }
              : {}),
          },
        });
      }

      // อัปเดตเป้าหมาย — แก้เฉพาะ finalText / finalIndicatorCodes ไม่แตะ aiOriginal / aiIndicatorCodes
      // ⚠️ goal.id ไม่ซ้ำกันข้าม section ทั้งแผน จึง update ตรงด้วย id ได้เลย ไม่ต้องรู้ว่าอยู่ section ไหน
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
      const planData: Record<string, unknown> = {};

      if (body.principalName !== undefined)
        planData.principalName = body.principalName.trim() || null;
      if (body.responsibleTeacherName !== undefined)
        planData.responsibleTeacherName = body.responsibleTeacherName.trim() || null;
      if (body.homeroomTeacherName !== undefined)
        planData.homeroomTeacherName = body.homeroomTeacherName.trim() || null;
      if (body.meetingDate !== undefined)
        planData.meetingDate = body.meetingDate.trim() || null;

      if (body.status) {
        planData.status = body.status;
        planData.finalizedAt =
          body.status === "finalized" ? (existing.finalizedAt ?? new Date()) : null;
      }

      if (Object.keys(planData).length > 0) {
        await tx.plan.update({ where: { id: params.id }, data: planData });
      }
    }, {
      // ⏱️ default timeout 5s สั้นเกินไปเมื่อ connection ไป DB ช้า (พังเป็น P2028)
      // เผื่อไว้ 20s + maxWait รอคิว connection จาก pool อีก 10s
      timeout: 20000,
      maxWait: 10000,
    });

    const updated = await prisma.plan.findUnique({
      where: { id: params.id },
      include: INCLUDE,
    });

    const annual = await fetchAnnualMediaContext({
      studentId: updated!.studentId,
      academicYear: updated!.academicYear,
      excludePlanId: updated!.id,
    });

    return NextResponse.json(toPlanDTO(updated!, annual));
  } catch (err) {
    const unauthorized = unauthorizedResponse(err);
    if (unauthorized) return unauthorized;

    console.error("PATCH /api/plans/[id] failed:", err);
    return NextResponse.json({ error: "บันทึกการแก้ไขไม่สำเร็จ" }, { status: 500 });
  }
}