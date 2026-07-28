/**
 * แปลง Prisma model → DTO ที่ส่งให้ frontend
 * รวม logic การคำนวณ isEdited และ durationSeconds ไว้ที่เดียว
 */

import type { PlanDTO } from "./types";

type PlanWithRelations = {
  id: string;
  academicYear: string;
  term: string;
  status: string;
  createdAt: Date;
  finalizedAt: Date | null;
  principalName: string | null;
  responsibleTeacherName: string | null;
  homeroomTeacherName: string | null;
  meetingDate: string | null;
  student: {
    code: string;
    fullName: string | null;
    disabilityType: string;
    gradeLevel: string | null;
  };
  goals: {
    id: string;
    aiOriginal: string;
    finalText: string;
    criterion: string | null;
    timeframe: string | null;
    isSelected: boolean;
  }[];
  media: {
    id: string;
    item: string;
    category: string;
    aiReason: string;
    finalReason: string;
    isApproved: boolean;
  }[];
};

export function toPlanDTO(plan: PlanWithRelations): PlanDTO {
  const warnings: string[] = [];

  for (const g of plan.goals) {
    const preview = g.finalText.slice(0, 30);
    if (!g.criterion) warnings.push(`เป้าหมาย "${preview}..." ยังไม่มีเกณฑ์วัดผล`);
    if (!g.timeframe) warnings.push(`เป้าหมาย "${preview}..." ยังไม่มีกรอบเวลา`);
  }
  if (!plan.goals.some((g) => g.isSelected)) {
    warnings.push("ยังไม่ได้เลือกเป้าหมายที่จะใช้จริง");
  }
  if (plan.media.length === 0) {
    warnings.push("ยังไม่มีรายการสื่อที่แนะนำ — ตรวจสอบว่าเลือกระดับความสามารถครบหรือยัง");
  }

  const durationSeconds = plan.finalizedAt
    ? Math.round((plan.finalizedAt.getTime() - plan.createdAt.getTime()) / 1000)
    : null;

  return {
    id: plan.id,
    studentCode: plan.student.code,
    studentFullName: plan.student.fullName,
    disabilityType: plan.student.disabilityType as PlanDTO["disabilityType"],
    gradeLevel: plan.student.gradeLevel,
    academicYear: plan.academicYear,
    term: plan.term,
    status: plan.status as PlanDTO["status"],
    createdAt: plan.createdAt.toISOString(),
    finalizedAt: plan.finalizedAt?.toISOString() ?? null,
    durationSeconds,
    // DTO ประกาศเป็น optional (string | undefined) แต่ Prisma คืน null → แปลงให้ตรงกัน
    principalName: plan.principalName ?? undefined,
    responsibleTeacherName: plan.responsibleTeacherName ?? undefined,
    homeroomTeacherName: plan.homeroomTeacherName ?? undefined,
    meetingDate: plan.meetingDate ?? undefined,
    goals: plan.goals.map((g) => ({
      id: g.id,
      aiOriginal: g.aiOriginal,
      finalText: g.finalText,
      criterion: g.criterion,
      timeframe: g.timeframe,
      isSelected: g.isSelected,
      isEdited: g.aiOriginal.trim() !== g.finalText.trim(),
    })),
    media: plan.media.map((m) => ({
      id: m.id,
      item: m.item,
      category: m.category as "ก" | "ข",
      aiReason: m.aiReason,
      finalReason: m.finalReason,
      isApproved: m.isApproved,
      isEdited: m.aiReason.trim() !== m.finalReason.trim(),
    })),
    consistencyWarnings: warnings,
  };
}
