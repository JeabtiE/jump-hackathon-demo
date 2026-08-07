/**
 * Query ที่ route ต้องใช้ประกอบการ serialize แผน — แยกจาก lib/serializers.ts
 * เพื่อให้ serializers.ts ไม่ต้อง import prisma (จะได้ยัง unit test ได้โดยไม่มี DB)
 */

import { prisma } from "./db";
import { buildAnnualContext, type AnnualMediaContext } from "./serializers";

/**
 * ยอดสื่อที่อนุมัติแล้วของ "แผนอื่น" ของนักเรียนคนเดียวกัน ในปีการศึกษาเดียวกัน
 *
 * เพดานเงินอุดหนุน 2,000 บาท นับต่อนักเรียนต่อ "ปี" ไม่ใช่ต่อแผน
 * (ดูเหตุผลเต็มที่ MEDIA_BUDGET_CAP_BAHT ใน lib/serializers.ts)
 * route ที่คืนแผนเดียวจึงต้องถามยอดของแผนอื่นเพิ่ม — 1 query คงที่ ไม่ใช่ N+1
 *
 * ⚠️ GET /api/plans (คืนหลายแผน) ห้ามเรียกฟังก์ชันนี้ในลูป
 *    มันโหลดแผนพร้อม media มาครบอยู่แล้ว ให้จัดกลุ่มในหน่วยความจำแทน
 *    ด้วย buildAnnualContext() ตรง ๆ ไม่ต้อง query เพิ่มเลยสักครั้ง
 *
 * select เฉพาะ price + isApproved ก็พอ — ไม่ต้องดึงทั้งแถว
 */
export async function fetchAnnualMediaContext(args: {
  studentId: string;
  academicYear: string;
  excludePlanId: string;
}): Promise<AnnualMediaContext> {
  const otherPlans = await prisma.plan.findMany({
    where: {
      studentId: args.studentId,
      academicYear: args.academicYear,
      id: { not: args.excludePlanId },
    },
    select: { media: { select: { price: true, isApproved: true } } },
  });

  return buildAnnualContext(otherPlans);
}
