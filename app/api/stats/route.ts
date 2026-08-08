/**
 * /api/stats — คน A ดูแล
 *
 * 🎯 endpoint นี้คือ "เครื่องเก็บหลักฐาน" สำหรับใบสมัคร
 *    ระบบคำนวณให้อัตโนมัติว่า:
 *    - ครูทำแผนไปกี่ฉบับ ใช้เวลาเฉลี่ยเท่าไหร่
 *    - ครูแก้ข้อความที่ AI ร่างกี่ % (= AI แม่นแค่ไหน)
 *
 *    ไม่ต้องมานั่งจดมือ ระบบเก็บให้ตั้งแต่วันแรกที่ครูใช้
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { UsageStats } from "@/lib/types";

// ⚠️ ห้าม prerender — GET ไม่มี request param ทำให้ Next มองเป็น static
// แล้ว freeze ตัวเลข ณ เวลา build สถิติหน้านี้คือหลักฐานการใช้งานจริง
// สำหรับใบสมัคร ต้องดึงสดจาก DB ทุกครั้ง
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [totalPlans, finalizedPlans, goals, media] = await Promise.all([
      prisma.plan.count(),
      prisma.plan.count({ where: { status: "finalized" } }),
      prisma.planGoal.findMany({ select: { aiOriginal: true, finalText: true } }),
      prisma.planMedia.findMany({ select: { aiReason: true, finalReason: true } }),
    ]);

    // เวลาเฉลี่ยที่ใช้ทำแผน (เฉพาะที่ยืนยันแล้ว)
    const finalized = await prisma.plan.findMany({
      where: { status: "finalized", finalizedAt: { not: null } },
      select: { createdAt: true, finalizedAt: true },
    });

    const durations = finalized
      .map((p) => (p.finalizedAt!.getTime() - p.createdAt.getTime()) / 1000)
      .filter((d) => d > 0);

    const avgDurationSeconds =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null;

    const editedGoals = goals.filter((g) => g.aiOriginal.trim() !== g.finalText.trim()).length;

    // ⚠️ นับเฉพาะรายการที่ AI เขียนเหตุผลไว้จริง
    //    ตั้งแต่ระบบเลือกสื่อตามเป้าหมาย (8 ส.ค. 2569) แผนหนึ่งจะมีรายการที่ AI ไม่ได้เลือก
    //    ปนอยู่ด้วย (aiReason = "" , isApproved = false) ถ้านับรวมเป็นตัวหาร ตัวเลข
    //    "ครูแก้เหตุผลกี่ %" จะเจือจางลงเรื่อย ๆ ตามขนาดของ mappingTable ไม่ใช่ตามความแม่นของ AI
    const aiWrittenMedia = media.filter((m) => m.aiReason.trim() !== "");
    const editedMedia = aiWrittenMedia.filter(
      (m) => m.aiReason.trim() !== m.finalReason.trim()
    ).length;

    const stats: UsageStats = {
      totalPlans,
      finalizedPlans,
      avgDurationSeconds,
      goalEditRate: goals.length > 0 ? Math.round((editedGoals / goals.length) * 100) : 0,
      mediaEditRate:
        aiWrittenMedia.length > 0
          ? Math.round((editedMedia / aiWrittenMedia.length) * 100)
          : 0,
    };

    return NextResponse.json(stats);
  } catch (err) {
    console.error("GET /api/stats failed:", err);
    return NextResponse.json({ error: "ดึงสถิติไม่สำเร็จ" }, { status: 500 });
  }
}
