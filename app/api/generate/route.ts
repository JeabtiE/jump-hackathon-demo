/**
 * API ENDPOINT — คน A ดูแล
 *
 * Pipeline: Request → Retrieval (rule-based) → Generation (LLM) → Response
 *
 * 💡 ถ้าไม่มี API key หรือตั้ง USE_MOCK=true → คืน mock data
 *    คน B พัฒนา UI ได้ทันทีโดยไม่ต้องรอ API เสร็จ
 */

import { NextResponse } from "next/server";
import { retrieveMedia } from "@/lib/retrieval";
import { buildSystemPrompt, buildUserPrompt } from "@/lib/prompts";
import type { GenerateRequest, GenerateResponse } from "@/lib/types";

const MOCK_RESPONSE: GenerateResponse = {
  iepGoals: [
    {
      id: "goal_1",
      text: "[MOCK] นักเรียนสามารถใช้บัตรภาพ PECS เพื่อสื่อสารความต้องการพื้นฐาน 3 อย่าง ได้ถูกต้อง 8 ใน 10 ครั้ง ภายในภาคเรียนที่ 1",
      criterion: "8 ใน 10 ครั้ง",
      timeframe: "ภายในภาคเรียนที่ 1",
    },
    {
      id: "goal_2",
      text: "[MOCK] นักเรียนสามารถชี้เลือกภาพในสมุดภาพสื่อสารเพื่อบอกความต้องการ ได้ถูกต้อง 7 ใน 10 ครั้ง ภายในภาคเรียนที่ 1",
      criterion: "7 ใน 10 ครั้ง",
      timeframe: "ภายในภาคเรียนที่ 1",
    },
  ],
  mediaRecommendations: [
    {
      item: "บัตรภาพสัญลักษณ์ PECS",
      category: "ก",
      reason:
        "[MOCK] เนื่องจากนักเรียนยังไม่สามารถสื่อสารด้วยคำพูด การใช้ระบบสื่อสารทางเลือกด้วยภาพจะช่วยให้แสดงความต้องการได้ตรงประเด็นมากขึ้น สอดคล้องกับเป้าหมายที่กำหนดไว้",
    },
  ],
  consistencyWarnings: [],
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as GenerateRequest;

    // ── Validation ──
    if (!body.disabilityType) {
      return NextResponse.json({ error: "กรุณาระบุประเภทความพิการ" }, { status: 400 });
    }

    // ── STEP 1: RETRIEVAL (ไม่ใช้ AI — lookup จาก mappingTable) ──
    const retrievedMedia = retrieveMedia(body.disabilityType, body.abilityLevels ?? {});

    // ── Mock mode: ให้คน B พัฒนา UI ได้โดยไม่ต้องมี API key ──
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (process.env.USE_MOCK === "true" || !apiKey) {
      await new Promise((r) => setTimeout(r, 800)); // จำลอง latency ให้เห็น loading state
      return NextResponse.json({
        ...MOCK_RESPONSE,
        mediaRecommendations:
          retrievedMedia.length > 0
            ? retrievedMedia.map((m) => ({
                item: m.item,
                category: m.category,
                reason: `[MOCK] ${m.rationale}`,
              }))
            : MOCK_RESPONSE.mediaRecommendations,
      });
    }

    // ── STEP 2: GENERATION (LLM เรียบเรียงจากข้อมูลที่ retrieve มา) ──
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
              disabilityType: body.disabilityType,
              abilityLevels: body.abilityLevels ?? {},
              strengths: body.strengths,
              gradeLevel: body.gradeLevel,
              retrievedMedia,
            }),
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("LLM API error:", res.status, detail);
      return NextResponse.json(
        { error: "ระบบสร้างเอกสารขัดข้อง กรุณาลองใหม่อีกครั้ง" },
        { status: 502 }
      );
    }

    const data = await res.json();
    const rawText = data.content?.[0]?.text ?? "";

    // ── STEP 3: Parse JSON จาก LLM ──
    let parsed: GenerateResponse;
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("JSON parse failed. Raw output:", rawText);
      return NextResponse.json(
        { error: "ระบบอ่านผลลัพธ์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" },
        { status: 502 }
      );
    }

    // ── STEP 4: Consistency check (rule-based พื้นฐาน) ──
    const warnings: string[] = [];
    for (const goal of parsed.iepGoals ?? []) {
      if (!goal.criterion) warnings.push(`เป้าหมาย "${goal.text.slice(0, 30)}..." ยังไม่มีเกณฑ์วัดผล`);
      if (!goal.timeframe) warnings.push(`เป้าหมาย "${goal.text.slice(0, 30)}..." ยังไม่มีกรอบเวลา`);
    }
    parsed.consistencyWarnings = warnings;

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json({ error: "เกิดข้อผิดพลาดที่ไม่คาดคิด" }, { status: 500 });
  }
}
