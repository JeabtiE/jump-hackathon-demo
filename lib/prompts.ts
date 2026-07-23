/**
 * PROMPT LAYER — คน A ดูแล
 *
 * 🔑 LLM มีหน้าที่แค่ "เรียบเรียงภาษา" จากข้อมูลที่ retrieve มาแล้ว
 * ไม่มีสิทธิ์เลือกสื่อเอง ไม่มีสิทธิ์เสนอนอกเหนือจาก list ที่ส่งไปให้
 */

import fewShot from "@/data/fewShotExamples.json";
import type { AbilityLevels, MediaEntry } from "./types";

const DISABILITY_LABEL: Record<string, string> = {
  visual: "บกพร่องทางการเห็น",
  hearing: "บกพร่องทางการได้ยิน",
  intellectual: "บกพร่องทางสติปัญญา",
  physical: "บกพร่องทางร่างกาย การเคลื่อนไหว หรือสุขภาพ",
  learning: "บกพร่องทางการเรียนรู้ (LD)",
  speech: "บกพร่องทางการพูดและภาษา",
  behavioral: "บกพร่องทางพฤติกรรมหรืออารมณ์",
  autism: "ออทิสติก",
  multiple: "พิการซ้อน",
};

export function buildSystemPrompt(): string {
  const goalExamples = (fewShot.goalExamples ?? [])
    .map(
      (ex: any, i: number) => `
--- ตัวอย่างที่ ${i + 1} ---
ข้อมูลเด็ก: ${ex.input.disabilityType} | ${ex.input.ability}
สื่อที่มีให้เลือก: ${ex.input.availableMedia.join(", ")}
เป้าหมายที่เขียนได้: "${ex.output.text}"
เกณฑ์วัดผล: ${ex.output.criterion}
กรอบเวลา: ${ex.output.timeframe}`
    )
    .join("\n");

  return `คุณคือผู้ช่วยครูการศึกษาพิเศษ มีหน้าที่ช่วยร่างเนื้อหาสำหรับแผนการจัดการศึกษาเฉพาะบุคคล (IEP) เพื่อกรอกเข้าระบบ SET ของ สพฐ.

## กฎการเขียนเป้าหมายเชิงพฤติกรรม (Behavioral Objective)
1. ต้องประกอบด้วย: ผู้กระทำ + พฤติกรรมที่สังเกตได้ + เงื่อนไข + เกณฑ์วัดผล + กรอบเวลา
2. ต้องวัดผลได้เชิงปริมาณเสมอ (เช่น 8 ใน 10 ครั้ง, 15 นาที, 70%)
3. ต้องสอดคล้องกับระดับความสามารถปัจจุบัน ไม่กระโดดข้ามขั้น
4. ใช้ภาษาราชการที่กระชับ ตรงประเด็น ผ่านการอนุมัติง่าย

## ข้อจำกัดที่ห้ามละเมิด
- ห้ามแนะนำสื่อหรืออุปกรณ์ที่ไม่อยู่ในรายการที่ระบบส่งให้ (ระบบได้ตรวจสอบแล้วว่าเบิกได้จริง)
- ห้ามวินิจฉัยหรือคาดเดาอาการเพิ่มเติมจากข้อมูลที่ให้มา
- ห้ามระบุชื่อเด็กหรือข้อมูลส่วนบุคคลใดๆ ในคำตอบ

## ตัวอย่างเป้าหมายที่เขียนถูกต้อง
${goalExamples}

## รูปแบบคำตอบ
ตอบเป็น JSON เท่านั้น ไม่ต้องมีข้อความอื่นนอก JSON:
{
  "iepGoals": [
    { "id": "goal_1", "text": "...", "criterion": "...", "timeframe": "..." },
    { "id": "goal_2", "text": "...", "criterion": "...", "timeframe": "..." }
  ],
  "mediaRecommendations": [
    { "item": "ชื่อสื่อตรงตามที่ระบบส่งให้", "category": "ก หรือ ข ตามที่ระบบส่งให้", "reason": "เหตุผลที่เชื่อมโยงกับเป้าหมาย IEP ข้างต้น" }
  ]
}

สร้างเป้าหมาย 2-3 ตัวเลือกที่ต่างมุมกัน เพื่อให้ครูเลือกได้`;
}

export function buildUserPrompt(params: {
  disabilityType: string;
  abilityLevels: AbilityLevels;
  strengths?: string;
  gradeLevel?: string;
  retrievedMedia: MediaEntry[];
}): string {
  const { disabilityType, abilityLevels, strengths, gradeLevel, retrievedMedia } = params;

  const abilityText = Object.entries(abilityLevels)
    .filter(([, v]) => v)
    .map(([domain, level]) => `- ${domain}: ${level}`)
    .join("\n");

  const mediaText = retrievedMedia
    .map((m) => `- ${m.item} (บัญชี ${m.category}) — หลักการ: ${m.rationale}`)
    .join("\n");

  return `## ข้อมูลนักเรียน
ประเภทความพิการ: ${DISABILITY_LABEL[disabilityType] ?? disabilityType}
${gradeLevel ? `ระดับชั้น: ${gradeLevel}` : ""}

ระดับความสามารถปัจจุบัน:
${abilityText || "- ไม่ได้ระบุ"}

${strengths ? `จุดเด่น/สิ่งที่ทำได้: ${strengths}` : ""}

## รายการสื่อที่เบิกได้ (ระบบตรวจสอบแล้ว — ห้ามเสนอนอกเหนือจากนี้)
${mediaText || "- ไม่พบรายการสื่อที่ตรงกับข้อมูลนี้"}

จงสร้างเป้าหมาย IEP และเหตุผลประกอบการเบิกสื่อ ตามรูปแบบ JSON ที่กำหนด`;
}
