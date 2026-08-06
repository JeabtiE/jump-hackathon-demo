/**
 * /api/plans — คน A ดูแล
 *
 * POST: สร้างแผน IEP ใหม่
 *   Pipeline: บันทึก Assessment → RETRIEVAL (rule-based) → GENERATION (LLM) → บันทึกลง DB
 *
 * 🔑 หลักการ: สื่อ/บัญชี ก-ข มาจาก mappingTable เท่านั้น
 *    LLM มีหน้าที่แค่เรียบเรียงภาษา ไม่มีสิทธิ์เลือกสื่อเอง
 *
 * 💡 ไม่มี ANTHROPIC_API_KEY → ใช้ mock data (คน B พัฒนา UI ได้ทันที)
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { retrieveMedia } from "@/lib/retrieval";
import {
  normalizeGradeLevel,
  resolveIndicatorCodes,
  retrieveIndicators,
  subjectsFromAbilityLevels,
} from "@/lib/curriculum-retrieval";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/prompts";
import { buildLLMSafePayload, assertNoPII } from "@/lib/pii-guard";
import { toPlanDTO } from "@/lib/serializers";
import type { CreatePlanRequest, IndicatorEntry, LLMOutput, MediaEntry } from "@/lib/types";

/** mock output สำหรับพัฒนา UI โดยไม่ต้องมี API key */
function buildMockOutput(media: MediaEntry[], indicators: IndicatorEntry[]): LLMOutput {
  return {
    iepGoals: [
      {
        text: "[MOCK] นักเรียนสามารถใช้สื่อที่กำหนดเพื่อสื่อสารความต้องการพื้นฐาน 3 อย่าง ได้ถูกต้อง 8 ใน 10 ครั้ง ภายในภาคเรียนนี้",
        criterion: "8 ใน 10 ครั้ง",
        timeframe: "ภายในภาคเรียนนี้",
        // หยิบตัวชี้วัดตัวแรกที่ retrieve ได้ — ให้คน B เห็น UI กรณี "มีตัวชี้วัด"
        indicatorCodes: indicators.slice(0, 1).map((i) => i.code),
      },
      {
        text: "[MOCK] นักเรียนสามารถทำกิจกรรมที่ได้รับมอบหมายจนเสร็จ โดยมีการเตือนไม่เกิน 2 ครั้ง ภายในภาคเรียนนี้",
        criterion: "เตือนไม่เกิน 2 ครั้ง",
        timeframe: "ภายในภาคเรียนนี้",
        // ตั้งใจปล่อยว่าง — เป้าหมายด้านทักษะไม่อ้างตัวชี้วัด คน B ต้องเห็นเคสนี้ด้วย
        indicatorCodes: [],
      },
    ],
    mediaRecommendations: media.map((m) => ({
      code: m.code,
      item: m.item,
      category: m.category,
      reason: `[MOCK] ${m.rationale}`,
    })),
  };
}

/**
 * จับคู่รายการที่ LLM คืนมา → รายการจริงที่ retrieve มา (CLAUDE.md §4)
 *
 * 🔑 รหัส/ชื่อ/บัญชี/ราคา/วิธีการ ยึดจาก mappingTable เท่านั้น — จาก LLM เอาแค่ "เหตุผล"
 *    รายการที่จับคู่ไม่ได้ถูกทิ้ง เพื่อไม่ให้สื่อที่เบิกไม่ได้หลุดเข้าเอกสาร
 */
function resolveMediaRecommendations(
  llmMedia: LLMOutput["mediaRecommendations"],
  retrievedMedia: MediaEntry[]
) {
  const byCode = new Map(retrievedMedia.map((m) => [m.code, m]));
  const byItem = new Map(retrievedMedia.map((m) => [m.item.trim(), m]));

  const resolved: { entry: MediaEntry; reason: string }[] = [];
  const used = new Set<string>();

  for (const rec of llmMedia) {
    // จับคู่ด้วยรหัสก่อน (แม่นกว่า) ค่อย fallback เป็นชื่อ เผื่อ LLM ตกช่อง code
    const entry = (rec.code && byCode.get(rec.code.trim())) || byItem.get(rec.item?.trim() ?? "");
    if (!entry) {
      console.warn("ทิ้งรายการสื่อที่ไม่อยู่ใน retrieval:", rec.code ?? rec.item);
      continue;
    }
    if (used.has(entry.code)) continue;
    used.add(entry.code);
    resolved.push({ entry, reason: rec.reason });
  }

  return resolved;
}

async function callLLM(params: {
  safePayload: ReturnType<typeof buildLLMSafePayload>;
  retrievedMedia: MediaEntry[];
  retrievedIndicators: IndicatorEntry[];
}): Promise<LLMOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const { safePayload, retrievedMedia, retrievedIndicators } = params;

  // 🔒 PII GUARD — ตรวจก่อนส่งออกนอกระบบทุกครั้ง จะ throw ถ้าเจอ PII ปนมา
  assertNoPII(safePayload, "LLM request payload");

  if (process.env.USE_MOCK === "true" || !apiKey) {
    await new Promise((r) => setTimeout(r, 800)); // จำลอง latency ให้เห็น loading state
    return buildMockOutput(retrievedMedia, retrievedIndicators);
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: buildSystemPrompt(),
      messages: [
        {
          role: "user",
          content: buildUserPrompt({
            disabilityType: safePayload.disabilityType,
            abilityLevels: safePayload.abilityLevels,
            strengths: safePayload.strengths,
            gradeLevel: safePayload.gradeLevel,
            retrievedMedia,
            retrievedIndicators,
          }),
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("LLM API error:", res.status, detail);
    throw new Error("LLM_ERROR");
  }

  const data = await res.json();
  const rawText: string = data.content?.[0]?.text ?? "";
  const cleaned = rawText.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned) as LLMOutput;
  } catch {
    console.error("JSON parse failed. Raw output:", rawText);
    throw new Error("PARSE_ERROR");
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreatePlanRequest;

    if (!body.studentId) {
      return NextResponse.json({ error: "กรุณาระบุนักเรียน" }, { status: 400 });
    }

    const student = await prisma.student.findUnique({ where: { id: body.studentId } });
    if (!student) {
      return NextResponse.json({ error: "ไม่พบข้อมูลนักเรียน" }, { status: 404 });
    }

    // ── STEP 1: บันทึกผลการประเมิน (เก็บไว้ดูพัฒนาการข้ามปี) ──
    const assessment = await prisma.assessment.create({
      data: {
        studentId: student.id,
        // cast: AbilityLevels เป็น interface ที่ไม่มี index signature เลยไม่ตรงกับ
        // InputJsonObject ของ Prisma โดยตรง — โครงสร้างจริงคือ Record<string, string>
        abilityLevels: (body.abilityLevels ?? {}) as Prisma.InputJsonObject,
        strengths: body.strengths?.trim() || null,
      },
    });

    // ── STEP 2: RETRIEVAL — lookup จาก mappingTable (ไม่ใช้ AI) ──
    const retrievedMedia = retrieveMedia(
      student.disabilityType as never,
      body.abilityLevels ?? {}
    );

    // ── STEP 2.5: RETRIEVAL — ตัวชี้วัดตามหลักสูตร (ไม่ใช้ AI เช่นกัน) ──
    // ไม่ระบุวิชา → ดูจาก abilityLevels ให้เอง (reading/writing → ไทย, math → คณิต)
    // ไม่มีระดับชั้น/ไม่ตรงกลุ่มสาระ → [] แล้วระบบทำงานเหมือนก่อนมีฟีเจอร์นี้ทุกประการ
    const subjects = body.subjects?.length
      ? body.subjects
      : subjectsFromAbilityLevels(body.abilityLevels ?? {});
    const curriculumGrade = normalizeGradeLevel(body.curriculumGrade ?? student.gradeLevel);
    const retrievedIndicators = curriculumGrade
      ? retrieveIndicators({ subjects, gradeLevel: curriculumGrade })
      : [];

    // ── STEP 3: GENERATION — LLM เรียบเรียงจากข้อมูลที่ verified แล้ว ──
    // 🔒 สร้าง payload ผ่าน whitelist เท่านั้น — PII ของ student ไม่มีทางหลุดออกไป
    const safePayload = buildLLMSafePayload({
      disabilityType: student.disabilityType,
      gradeLevel: student.gradeLevel,
      abilityLevels: (body.abilityLevels ?? {}) as Record<string, string>,
      strengths: body.strengths,
    });

    let llm: LLMOutput;
    try {
      llm = await callLLM({ safePayload, retrievedMedia, retrievedIndicators });
    } catch (e) {
      const msg =
        (e as Error).message === "PARSE_ERROR"
          ? "ระบบอ่านผลลัพธ์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"
          : (e as Error).message?.startsWith("[PII GUARD]")
            ? "ระบบตรวจพบข้อมูลส่วนบุคคลในคำขอ จึงยกเลิกการส่งข้อมูลเพื่อความปลอดภัย"
            : "ระบบสร้างเอกสารขัดข้อง กรุณาลองใหม่อีกครั้ง";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    // ── STEP 4: บันทึกลง DB (เก็บทั้ง aiOriginal และ finalText) ──
    const plan = await prisma.plan.create({
      data: {
        studentId: student.id,
        assessmentId: assessment.id,
        academicYear: body.academicYear || String(new Date().getFullYear() + 543),
        term: body.term || "1",
        // ── ส่วนที่ 7: คณะกรรมการจัดทำแผน (ไม่ส่งไป LLM — ใช้ตอน export เท่านั้น) ──
        principalName: body.principalName?.trim() || null,
        responsibleTeacherName: body.responsibleTeacherName?.trim() || null,
        homeroomTeacherName: body.homeroomTeacherName?.trim() || null,
        meetingDate: body.meetingDate?.trim() || null,
        goals: {
          create: llm.iepGoals.map((g, i) => {
            // 🔒 รหัสตัวชี้วัดผ่าน gate เดียวกับสื่อ — ที่ไม่อยู่ใน retrieval ถูกทิ้ง
            const codes = resolveIndicatorCodes(g.indicatorCodes, retrievedIndicators).map(
              (ind) => ind.code
            );
            return {
              aiOriginal: g.text,
              finalText: g.text, // เริ่มต้นเท่ากัน ถ้าครูแก้ finalText จะต่างออกไป
              criterion: g.criterion ?? null,
              timeframe: g.timeframe ?? null,
              aiIndicatorCodes: codes,
              finalIndicatorCodes: codes, // เริ่มต้นเท่ากันแบบเดียวกับ aiOriginal/finalText
              isSelected: i === 0, // เลือกข้อแรกไว้ก่อน ครูเปลี่ยนได้
              orderIndex: i,
            };
          }),
        },
        media: {
          create: resolveMediaRecommendations(llm.mediaRecommendations, retrievedMedia).map(
            ({ entry, reason }) => ({
              code: entry.code,
              item: entry.item,
              category: entry.category,
              price: entry.price,
              mode: entry.mode,
              aiReason: reason,
              finalReason: reason,
            })
          ),
        },
      },
      include: {
        student: true,
        goals: { orderBy: { orderIndex: "asc" } },
        media: true,
      },
    });

    return NextResponse.json(toPlanDTO(plan), { status: 201 });
  } catch (err) {
    console.error("POST /api/plans failed:", err);
    return NextResponse.json({ error: "สร้างแผนไม่สำเร็จ" }, { status: 500 });
  }
}

/** GET /api/plans?studentId=xxx — ดึงรายการแผนของนักเรียน */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get("studentId");

    const plans = await prisma.plan.findMany({
      where: studentId ? { studentId } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        student: true,
        goals: { orderBy: { orderIndex: "asc" } },
        media: true,
      },
    });

    return NextResponse.json(plans.map(toPlanDTO));
  } catch (err) {
    console.error("GET /api/plans failed:", err);
    return NextResponse.json({ error: "ดึงข้อมูลแผนไม่สำเร็จ" }, { status: 500 });
  }
}
