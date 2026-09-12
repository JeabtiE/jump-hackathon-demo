/**
 * /api/stats — คน A ดูแล
 *
 * 🎯 endpoint นี้คือ "เครื่องเก็บหลักฐาน" สำหรับใบสมัคร
 *    ระบบคำนวณให้อัตโนมัติว่า:
 *    - ครูทำแผนไปกี่ฉบับ ใช้เวลาเฉลี่ยเท่าไหร่
 *    - ครูแก้ข้อความที่ AI ร่างกี่ % (= AI แม่นแค่ไหน)
 *
 *    ไม่ต้องมานั่งจดมือ ระบบเก็บให้ตั้งแต่วันแรกที่ครูใช้
 *
 * ✏️ คืนค่าเป็น 2 ชุดแยกกัน:
 *    mine = ของครูที่ล็อกอินอยู่ (กรองด้วย student.userId)
 *    all  = ยอดรวมทั้งระบบ
 *
 * 🔒 ชุด all เป็น "ตัวเลขล้วน" เท่านั้น — ห้ามใส่ชื่อครู อีเมล จำนวนนักเรียนรายคน
 *    หรืออะไรที่ไล่ย้อนไปหาตัวบุคคลได้ ครูคนหนึ่งต้องไม่รู้ว่าครูอีกคนทำอะไรไว้บ้าง
 *    (ที่ยอมให้เห็นยอดรวมเพราะเป็นหลักฐานประกอบใบสมัครของโครงการ ไม่ใช่ข้อมูลรายบุคคล)
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUserId, unauthorizedResponse } from "@/lib/auth-guard";
import type { PlanUsageMetrics, UsageStats } from "@/lib/types";

// ⚠️ ห้าม prerender — GET ไม่มี request param ทำให้ Next มองเป็น static
// แล้ว freeze ตัวเลข ณ เวลา build สถิติหน้านี้คือหลักฐานการใช้งานจริง
// สำหรับใบสมัคร ต้องดึงสดจาก DB ทุกครั้ง
export const dynamic = "force-dynamic";

/** Levenshtein distance — ใช้วัดว่าข้อความเปลี่ยนไปมากแค่ไหน */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * ⚠️ threshold 0.85 เป็นค่าเริ่มต้นที่ยังไม่ได้ calibrate กับข้อมูลจริง
 *    ถ้าดูตัวเลขจริงแล้วรู้สึกว่าแบ่งไม่ตรงสัญชาตญาณ (เช่น แก้แค่คำเดียวแต่ขึ้น major)
 *    ปรับเลขนี้ได้เลย เป็นจุดเดียวที่ต้องแก้
 */
function editSeverity(original: string, final: string): "unedited" | "minor" | "major" {
  const a = original.trim();
  const b = final.trim();
  if (a === b) return "unedited";
  const dist = levenshtein(a, b);
  const similarity = 1 - dist / Math.max(a.length, b.length, 1);
  return similarity >= 0.85 ? "minor" : "major";
}

/** Json column → Record<string,string> (แถวเก่าอาจเป็น null/array/scalar) */
function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

// ── ตัวกรองตามเจ้าของ ────────────────────────────────────────
// userId = null แปลว่า "ทั้งระบบ" (ชุด all) — ไม่ใส่เงื่อนไขอะไรเลย
//
// ⚠️ ทุก model ไต่ไปหา userId ผ่าน Student เสมอ เพราะ Plan/PlanGoal/PlanMedia
//    ตั้งใจไม่มี userId ของตัวเอง (ดูเหตุผลใน prisma/schema.prisma)

function planWhere(userId: string | null): Prisma.PlanWhereInput {
  return userId ? { student: { userId } } : {};
}

function goalWhere(userId: string | null): Prisma.PlanGoalWhereInput {
  return userId ? { section: { plan: { student: { userId } } } } : {};
}

function mediaWhere(userId: string | null): Prisma.PlanMediaWhereInput {
  return userId ? { plan: { student: { userId } } } : {};
}

function assessmentWhere(userId: string | null): Prisma.AssessmentWhereInput {
  // นับเฉพาะที่ AI เคยเสนอค่ามาจริง — ที่ครูเลือกเองล้วนไม่ใช่ "ครูแก้ของ AI"
  const base: Prisma.AssessmentWhereInput = {
    abilityLevelsAiSuggested: { not: Prisma.DbNull },
  };
  return userId ? { ...base, student: { userId } } : base;
}

/**
 * คำนวณตัวเลขทั้งชุดภายใต้ขอบเขตเดียว
 * @param userId - userId ของครู หรือ null = ทั้งระบบ
 */
async function computeMetrics(userId: string | null): Promise<PlanUsageMetrics> {
  const [totalPlans, finalizedPlans, goals, media] = await Promise.all([
    prisma.plan.count({ where: planWhere(userId) }),
    prisma.plan.count({ where: { ...planWhere(userId), status: "finalized" } }),
    prisma.planGoal.findMany({
      where: goalWhere(userId),
      select: { aiOriginal: true, finalText: true },
    }),
    prisma.planMedia.findMany({
      where: mediaWhere(userId),
      select: { aiReason: true, finalReason: true },
    }),
  ]);

  // เวลาเฉลี่ยที่ใช้ทำแผน (เฉพาะที่ยืนยันแล้ว)
  const finalized = await prisma.plan.findMany({
    where: { ...planWhere(userId), status: "finalized", finalizedAt: { not: null } },
    select: { createdAt: true, finalizedAt: true },
  });

  const durations = finalized
    .map((p) => (p.finalizedAt!.getTime() - p.createdAt.getTime()) / 1000)
    .filter((d) => d > 0);

  const avgDurationSeconds =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

  // เวลาเฉลี่ยของ "งานร่างแผนทั้ง workflow" — กรอกแบบประเมินเสร็จ → AI ร่าง →
  // ครูแก้/เลือก → ครูกดยืนยัน คือตัวที่เอาไปเทียบ baseline 1-2+ วัน/คน
  // ⚠️ แยก query จาก avgDurationSeconds ด้านบน อย่ารวมกัน — คนละความหมาย
  //    (ของเดิมนับ createdAt→finalizedAt = เฉพาะช่วงครูแก้หลัง AI ร่างเสร็จ)
  const draftingFinalized = await prisma.plan.findMany({
    where: { ...planWhere(userId), status: "finalized", finalizedAt: { not: null } },
    select: { finalizedAt: true, assessment: { select: { assessedAt: true } } },
  });

  const draftingDurations = draftingFinalized
    .map((p) => (p.finalizedAt!.getTime() - p.assessment.assessedAt.getTime()) / 1000)
    // กรองค่าติดลบ/ศูนย์เหมือน pattern เดิม — กันแผนทดสอบเก่าที่ข้อมูลเวลาเพี้ยน
    .filter((d) => d > 0);

  const avgDraftingSeconds =
    draftingDurations.length > 0
      ? Math.round(
          draftingDurations.reduce((a, b) => a + b, 0) / draftingDurations.length
        )
      : null;

  // ── ability override rate — classifier แม่นแค่ไหน ──
  // เทียบ abilityLevelsAiSuggested (ข้อเสนอ AI) กับ abilityLevels (คำตัดสินครู)
  // ⚠️ แยก query/คำนวณจาก metric อื่นทั้งหมด — เป็นคนละหน่วยนับ (นับ "domain" ไม่ใช่ "แผน")
  const assessments = await prisma.assessment.findMany({
    where: assessmentWhere(userId),
    select: { abilityLevels: true, abilityLevelsAiSuggested: true },
  });

  let overrideDenominator = 0;
  let overrideNumerator = 0;
  for (const a of assessments) {
    const suggested = asRecord(a.abilityLevelsAiSuggested);
    const confirmed = asRecord(a.abilityLevels);
    // ⚠️ วนจาก suggested เท่านั้น — domain ที่ AI ไม่ได้เสนอ (confidence ต่ำ/ครูพิมพ์เอง)
    //    ไม่ถือเป็น "ครูแก้ของ AI" จึงไม่นับเข้าตัวหาร
    for (const [domain, aiLevel] of Object.entries(suggested)) {
      if (!aiLevel) continue;
      overrideDenominator += 1;
      if (confirmed[domain] !== aiLevel) overrideNumerator += 1;
    }
  }

  const abilityOverrideRate =
    overrideDenominator > 0
      ? Math.round((overrideNumerator / overrideDenominator) * 100)
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

  const severities = goals.map((g) => editSeverity(g.aiOriginal, g.finalText));
  const totalGoals = severities.length || 1; // กัน div by zero
  const goalEditBreakdown = {
    uneditedPct: Math.round(
      (severities.filter((s) => s === "unedited").length / totalGoals) * 100
    ),
    minorEditPct: Math.round(
      (severities.filter((s) => s === "minor").length / totalGoals) * 100
    ),
    majorEditPct: Math.round(
      (severities.filter((s) => s === "major").length / totalGoals) * 100
    ),
  };

  return {
    totalPlans,
    finalizedPlans,
    avgDurationSeconds,
    avgDraftingSeconds,
    goalEditRate: goals.length > 0 ? Math.round((editedGoals / goals.length) * 100) : 0,
    mediaEditRate:
      aiWrittenMedia.length > 0
        ? Math.round((editedMedia / aiWrittenMedia.length) * 100)
        : 0,
    goalEditBreakdown,
    abilityOverrideRate,
  };
}

export async function GET() {
  try {
    const userId = await requireUserId();

    // ⚠️ รันทีละชุด ไม่ Promise.all สองชุดพร้อมกัน — DATABASE_URL วิ่งผ่าน pgbouncer
    //    ที่ connection_limit=1 ยิงขนานกันทั้งสองชุดมีแต่จะไปแย่งคิว connection กันเอง
    const mine = await computeMetrics(userId);
    const all = await computeMetrics(null);

    const stats: UsageStats = { mine, all };

    return NextResponse.json(stats);
  } catch (err) {
    const unauthorized = unauthorizedResponse(err);
    if (unauthorized) return unauthorized;

    console.error("GET /api/stats failed:", err);
    return NextResponse.json({ error: "ดึงสถิติไม่สำเร็จ" }, { status: 500 });
  }
}
