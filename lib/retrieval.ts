/**
 * RETRIEVAL LAYER — คน A ดูแล
 *
 * 🔑 หลักการสำคัญ: ชั้นนี้ไม่มี AI เลย เป็นแค่ lookup จาก mappingTable.json
 * เพราะรายการสื่อ/บัญชี ก-ข ผูกกับงบเบิกจริง ผิดพลาดไม่ได้
 * LLM จะได้เห็นเฉพาะรายการที่ retrieve มาจากที่นี่เท่านั้น (constrained generation)
 */

import mappingTableRaw from "@/data/mappingTable.json";
import type { AbilityLevels, DisabilityType, MediaEntry } from "./types";

type RawTable = Record<string, Record<string, MediaEntry[]>>;

const mappingTable = mappingTableRaw as unknown as RawTable;

/**
 * ค้นหาสื่อที่เบิกได้ ตามประเภทความพิการ + ระดับความสามารถที่ครูเลือก
 *
 * @returns รายการสื่อที่ไม่ซ้ำกัน (ถ้าเด็กมีหลายด้าน อาจได้สื่อตัวเดียวกันซ้ำ)
 */
export function retrieveMedia(
  disabilityType: DisabilityType,
  abilityLevels: AbilityLevels
): MediaEntry[] {
  const typeTable = mappingTable[disabilityType];
  if (!typeTable) return [];

  const results: MediaEntry[] = [];
  const seen = new Set<string>();

  for (const [domain, level] of Object.entries(abilityLevels)) {
    if (!level) continue;

    // key ใน mappingTable.json อยู่ในรูป "domain.level" เช่น "communication.no_speech_gesture_only"
    const key = `${domain}.${level}`;
    const entries = typeTable[key];
    if (!entries) continue;

    for (const entry of entries) {
      // dedupe ด้วยรหัส ไม่ใช่ชื่อ — ชื่อในคู่มือซ้ำกันได้ระหว่างรหัสต่างกัน
      // (เช่น "กระดานสื่อสาร" มีทั้งแบบแม่เหล็กและขนาดใหญ่) แต่รหัสไม่ซ้ำแน่นอน
      if (seen.has(entry.code)) continue;
      seen.add(entry.code);
      results.push(entry);
    }
  }

  return results;
}

/** ดึงรายการ ability level ที่มีในตาราง — ใช้ generate ตัวเลือก dropdown ให้ตรงกับข้อมูลจริง */
export function getAvailableAbilityKeys(disabilityType: DisabilityType): string[] {
  const typeTable = mappingTable[disabilityType];
  if (!typeTable) return [];
  return Object.keys(typeTable);
}

/** ประเภทความพิการที่ระบบรองรับแล้วจริง (มีข้อมูลใน mappingTable) */
export function getSupportedDisabilityTypes(): string[] {
  return Object.keys(mappingTable).filter((k) => !k.startsWith("_"));
}
