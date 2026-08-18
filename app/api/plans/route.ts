/**
 * /api/plans — คน A ดูแล
 *
 * POST: สร้างแผน IEP ใหม่
 *   Pipeline: บันทึก Assessment → RETRIEVAL (rule-based) → GENERATION (LLM) → บันทึกลง DB
 *
 * 🔑 หลักการ: สื่อ/บัญชี ก-ข มาจาก mappingTable เท่านั้น
 *    LLM มีหน้าที่แค่เรียบเรียงภาษา ไม่มีสิทธิ์เลือกสื่อเอง
 *
 * ✏️ 17 ส.ค. 2569 — LLMOutput เปลี่ยนจาก iepGoals แบน เป็น domainSections
 *    ที่มี goals ซ้อนข้างใน → บันทึกลง DB เป็น 2 ชั้น (PlanDomainSection → PlanGoal)
 *    mediaRecommendations ไม่แตะเลย เหมือนเดิมทุกประการ
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
import { buildAnnualContextsByPlan, toPlanDTO } from "@/lib/serializers";
import { fetchAnnualMediaContext } from "@/lib/plan-queries";
import type { CreatePlanRequest, IndicatorEntry, LLMOutput, MediaEntry } from "@/lib/types";

const INCLUDE = {
  student: true,
  domainSections: {
    orderBy: { orderIndex: "asc" as const },
    include: { goals: { orderBy: { orderIndex: "asc" as const } } },
  },
  media: true,
};

/**
 * mock output สำหรับพัฒนา UI โดยไม่ต้องมี API key
 *
 * ⚠️ สร้าง 1 domainSection ต่อ 1 domain ที่ครูกรอกระดับความสามารถไว้จริง
 *    (ไม่ใช่ทุก domain ที่มีในระบบ) — ตัวชี้วัดที่ retrieve มาแนบไว้ที่ domain
 *    แรกที่มีการเรียนวิชาการเท่านั้น (reading/writing/math) domain อื่น
 *    (communication/behavior/selfHelp) ไม่อ้างตัวชี้วัดกลุ่มสาระ
 */
function buildMockOutput(
  abilityLevels: Record<string, string>,
  media: MediaEntry[],
  indicators: IndicatorEntry[]
): LLMOutput {
  const domains = Object.keys(abilityLevels).filter((d) => abilityLevels[d]);
  const ACADEMIC_DOMAINS = new Set(["reading", "writing", "math"]);
  const firstAcademicDomain = domains.find((d) => ACADEMIC_DOMAINS.has(d));

  const domainSections = (domains.length > 0 ? domains : ["communication"]).map((domain) => ({
    domain,
    strengths: `[MOCK] นักเรียนให้ความร่วมมือเมื่อได้รับการกระตุ้นเตือนในด้าน ${domain}`,
    developmentAreas: `[MOCK] ยังต้องพัฒนาความสามารถด้าน ${domain} ตามระดับที่ประเมินไว้ (${abilityLevels[domain] ?? "ไม่ระบุ"})`,
    longTermGoal: `[MOCK] ภายในสิ้นปีการศึกษา นักเรียนจะมีความสามารถด้าน ${domain} ดีขึ้นอย่างมีนัยสำคัญ`,
    evaluationMethod: "[MOCK] สังเกตพฤติกรรม + แบบบันทึกผลการปฏิบัติงาน",
    shortTermObjectives: [
      {
        text: `[MOCK] นักเรียนสามารถใช้สื่อที่กำหนดเพื่อฝึกด้าน ${domain} ได้ถูกต้อง 8 ใน 10 ครั้ง ภายในภาคเรียนนี้`,
        criterion: "8 ใน 10 ครั้ง",
        timeframe: "ภายในภาคเรียนนี้",
        // ตัวชี้วัดผูกกับ domain วิชาการตัวแรกที่เจอเท่านั้น — domain อื่นปล่อยว่างตั้งใจ
        indicatorCodes:
          domain === firstAcademicDomain ? indicators.slice(0, 1).map((i) => i.code) : [],
      },
      {
        text: `[MOCK] นักเรียนสามารถทำกิจกรรมด้าน ${domain} ที่ได้รับมอบหมายจนเสร็จ โดยมีการเตือนไม่เกิน 2 ครั้ง ภายในภาคเรียนนี้`,
        criterion: "เตือนไม่เกิน 2 ครั้ง",
        timeframe: "ภายในภาคเรียนนี้",
        indicatorCodes: [],
      },
    ],
  }));

  return {
    domainSections,
    // ตั้งใจเลือกแค่ครึ่งเดียว (อย่างน้อย 1 รายการถ้ามีสื่อเลย) — ของจริง LLM ก็เลือกไม่ครบ
    mediaRecommendations: media.slice(0, Math.max(1, Math.ceil(media.length / 2))).map((m, i) => ({
      code: m.code,
      item: m.item,
      category: m.category,
      goalRef: i === 0 ? "goal_1" : undefined,
      reason: `[MOCK] ${m.rationale}`,
    })),
  };
}

/**
 * จับคู่รายการที่ LLM คืนมา → รายการจริงที่ retrieve มา (CLAUDE.md §4)
 * ไม่แตะจากเวอร์ชันก่อน — media ไม่ได้ผูกกับ domain section เป็นการเฉพาะ
 */
function resolveMediaRecommendations(
  llmMedia: LLMOutput["mediaRecommendations"],
  retrievedMedia: MediaEntry[]
): { entry: MediaEntry; reason: string; isApproved: boolean }[] {
  const byCode = new Map(retrievedMedia.map((m) => [m.code, m]));
  const byItem = new Map(retrievedMedia.map((m) => [m.item.trim(), m]));

  const reasonByCode = new Map<string, string>();

  for (const rec of llmMedia ?? []) {
    const entry = (rec.code && byCode.get(rec.code.trim())) || byItem.get(rec.item?.trim() ?? "");
    if (!entry) {
      console.warn("ทิ้งรายการสื่อที่ไม่อยู่ใน retrieval:", rec.code ?? rec.item);
      continue;
    }
    if (reasonByCode.has(entry.code)) continue;
    reasonByCode.set(entry.code, rec.reason ?? "");
  }

  if (reasonByCode.size === 0) {
    return retrievedMedia.map((entry) => ({
      entry,
      reason: entry.rationale,
      isApproved: true,
    }));
  }

  const picked = retrievedMedia.filter((m) => reasonByCode.has(m.code));
  const rest = retrievedMedia.filter((m) => !reasonByCode.has(m.code));

  return [
    ...picked.map((entry) => ({
      entry,
      reason: reasonByCode.get(entry.code) ?? "",
      isApproved: true,
    })),
    ...rest.map((entry) => ({ entry, reason: "", isApproved: false })),
  ];
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
    return buildMockOutput(safePayload.abilityLevels, retrievedMedia, retrievedIndicators);
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
      max_tokens: 8000,
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
  
  // เพิ่มบล็อกนี้เข้าไปใหม่ ก่อน try/catch เดิม
  if (data.stop_reason === "max_tokens") {
    console.error(
      "LLM output ถูกตัดเพราะ max_tokens ไม่พอ — เพิ่มค่า max_tokens ในคำขอ",
      { outputTokens: data.usage?.output_tokens }
    );
    throw new Error("TRUNCATED_OUTPUT");
  } 
  
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
    const subjects = body.subjects?.length
      ? body.subjects
      : subjectsFromAbilityLevels(body.abilityLevels ?? {});
    const curriculumGrade = normalizeGradeLevel(body.curriculumGrade ?? student.gradeLevel);
    const retrievedIndicators = curriculumGrade
      ? retrieveIndicators({ subjects, gradeLevel: curriculumGrade })
      : [];

    // ── STEP 3: GENERATION — LLM เรียบเรียงจากข้อมูลที่ verified แล้ว ──
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

    // ── STEP 4: บันทึกลง DB (เก็บทั้ง aiOriginal/aiXxx และ finalText/finalXxx) ──
    // ✏️ nested create 2 ชั้น: domainSections → goals
    const plan = await prisma.plan.create({
      data: {
        studentId: student.id,
        assessmentId: assessment.id,
        academicYear: body.academicYear || String(new Date().getFullYear() + 543),
        term: body.term || "1",
        principalName: body.principalName?.trim() || null,
        responsibleTeacherName: body.responsibleTeacherName?.trim() || null,
        homeroomTeacherName: body.homeroomTeacherName?.trim() || null,
        meetingDate: body.meetingDate?.trim() || null,
        domainSections: {
          create: (llm.domainSections ?? []).map((sec, si) => ({
            domain: sec.domain,
            aiStrengths: sec.strengths,
            finalStrengths: sec.strengths,
            aiDevelopmentAreas: sec.developmentAreas,
            finalDevelopmentAreas: sec.developmentAreas,
            aiLongTermGoal: sec.longTermGoal,
            finalLongTermGoal: sec.longTermGoal,
            aiEvaluationMethod: sec.evaluationMethod,
            finalEvaluationMethod: sec.evaluationMethod,
            // ครูกรอกเองตอนกด "สร้างแผน" — ไม่ระบุ = เว้นว่างให้กรอกทีหลัง
            responsibleTeacherName:
              body.responsibleTeacherByDomain?.[sec.domain]?.trim() || null,
            orderIndex: si,
            goals: {
              create: (sec.shortTermObjectives ?? []).map((g, gi) => {
                // 🔒 รหัสตัวชี้วัดผ่าน gate เดียวกับสื่อ — ที่ไม่อยู่ใน retrieval ถูกทิ้ง
                const codes = resolveIndicatorCodes(
                  g.indicatorCodes ?? [],
                  retrievedIndicators
                ).map((ind) => ind.code);
                return {
                  aiOriginal: g.text,
                  finalText: g.text,
                  criterion: g.criterion ?? null,
                  timeframe: g.timeframe ?? null,
                  aiIndicatorCodes: codes,
                  finalIndicatorCodes: codes,
                  // เลือกข้อแรกของแต่ละ domain ไว้ก่อน ครูเปลี่ยนได้ — ต่างจากเดิมที่เลือก
                  // ข้อแรกของทั้งแผนแค่ข้อเดียว เพราะตอนนี้แต่ละ domain ต้องมีอย่างน้อย
                  // 1 เป้าหมายที่ถูกเลือกไว้ล่วงหน้า ไม่งั้น section นั้นจะดูว่างเปล่าตั้งแต่แรก
                  isSelected: gi === 0,
                  orderIndex: gi,
                };
              }),
            },
          })),
        },
        media: {
          create: resolveMediaRecommendations(llm.mediaRecommendations, retrievedMedia).map(
            ({ entry, reason, isApproved }) => ({
              code: entry.code,
              item: entry.item,
              category: entry.category,
              price: entry.price,
              mode: entry.mode,
              aiReason: reason,
              finalReason: reason,
              isApproved,
            })
          ),
        },
      },
      include: INCLUDE,
    });

    const annual = await fetchAnnualMediaContext({
      studentId: plan.studentId,
      academicYear: plan.academicYear,
      excludePlanId: plan.id,
    });

    return NextResponse.json(toPlanDTO(plan, annual), { status: 201 });
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
      include: INCLUDE,
    });

    const annualByPlan = buildAnnualContextsByPlan(plans);

    return NextResponse.json(
      // ⚠️ ห้ามเขียน plans.map(toPlanDTO) — map จะส่ง index เป็นอาร์กิวเมนต์ที่ 2
      plans.map((p) => toPlanDTO(p, annualByPlan.get(p.id)))
    );
  } catch (err) {
    console.error("GET /api/plans failed:", err);
    return NextResponse.json({ error: "ดึงข้อมูลแผนไม่สำเร็จ" }, { status: 500 });
  }
}