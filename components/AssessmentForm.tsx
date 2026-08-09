/**
 * ฟอร์มกรอกระดับความสามารถ — คน B ดูแล
 *
 * 🔑 ใช้ dropdown เท่านั้น ไม่ให้ครูพิมพ์ prompt เอง
 * ⚠️ value ต้องตรงกับ key ใน data/mappingTable.json
 *    ถ้าคน A เพิ่ม key ใหม่ ต้องมาเพิ่มใน ABILITY_OPTIONS ที่นี่ด้วย
 */

"use client";

import { useState } from "react";
import type { AbilityLevels } from "@/lib/types";

const ABILITY_OPTIONS: Record<
  string,
  {
    domain: string;
    label: string;
    options: { value: string; label: string }[];
  }[]
> = {
  autism: [
    {
      domain: "communication",
      label: "การสื่อสาร",
      options: [
        { value: "no_speech_gesture_only", label: "ไม่พูด ใช้ท่าทางสื่อสาร" },
        {
          value: "single_word_only",
          label: "พูดได้เป็นคำเดี่ยว ยังไม่ต่อประโยค",
        },
      ],
    },
    {
      domain: "behavior",
      label: "พฤติกรรม",
      options: [
        { value: "frequent_off_task", label: "วอกแวกบ่อย ลุกจากที่นั่ง" },
        {
          value: "difficulty_transition",
          label: "ปรับตัวยากเมื่อเปลี่ยนกิจกรรม",
        },
      ],
    },
    {
      domain: "selfHelp",
      label: "การช่วยเหลือตนเอง",
      options: [{ value: "needs_prompting", label: "ต้องมีคนเตือนทุกขั้นตอน" }],
    },
    {
      domain: "math",
      label: "การคำนวณ",
      options: [
        {
          value: "needs_concrete_visual_support",
          label: "ต้องใช้ของจริง/สื่อรูปธรรมช่วยนับ",
        },
      ],
    },
    {
      domain: "readiness",
      label: "ความพร้อมทางการเรียนรู้",
      options: [
        {
          value: "needs_prewriting_practice",
          label: "ยังลากเส้น/คุมมือเขียนไม่ได้",
        },
        {
          value: "needs_cognitive_readiness",
          label: "ยังจับคู่/จำแนก/เรียงลำดับไม่ได้",
        },
      ],
    },
  ],
  learning: [
    {
      domain: "reading",
      label: "การอ่าน",
      options: [
        { value: "cannot_spell_2syllable", label: "สะกดคำ 2 พยางค์ไม่ได้" },
      ],
    },
    {
      domain: "writing",
      label: "การเขียน",
      options: [
        {
          value: "poor_handwriting",
          label: "เขียนไม่เป็นระเบียบ กล้ามเนื้อมือไม่แข็งแรง",
        },
      ],
    },
    {
      domain: "math",
      label: "การคำนวณ",
      options: [
        { value: "cannot_calculate_carry", label: "คำนวณการทดเลขไม่ได้" },
      ],
    },
  ],
  intellectual: [
    {
      domain: "reading",
      label: "การเรียนรู้ / การรับรู้",
      options: [
        {
          value: "needs_concrete_visual_support",
          label: "ต้องใช้สื่อรูปธรรมและภาพประกอบ",
        },
      ],
    },
    {
      domain: "math",
      label: "การคำนวณ",
      options: [
        {
          value: "needs_concrete_visual_support",
          label: "ต้องใช้ของจริง/สื่อรูปธรรมช่วยนับ",
        },
      ],
    },
    {
      domain: "selfHelp",
      label: "การช่วยเหลือตนเอง",
      options: [
        {
          value: "needs_routine_structure",
          label: "ต้องมีโครงสร้างกิจวัตรที่ชัดเจน",
        },
      ],
    },
    {
      domain: "behavior",
      label: "พฤติกรรม",
      options: [
        {
          value: "needs_simple_instruction",
          label: "สับสนกับคำสั่งที่ซับซ้อน ต้องการคำสั่งง่าย",
        },
      ],
    },
  ],
  speech: [
    {
      domain: "communication",
      label: "การสื่อสาร",
      options: [
        {
          value: "limited_expressive_language",
          label: "พูดได้จำกัด ใช้คำ/ประโยคสั้นมาก",
        },
        { value: "unclear_articulation", label: "พูดได้แต่ออกเสียงไม่ชัด" },
      ],
    },
  ],
};

const CURRENT_YEAR = String(new Date().getFullYear() + 543);

export default function AssessmentForm({
  disabilityType,
  onSubmit,
  loading,
}: {
  disabilityType: string;
  onSubmit: (payload: {
    abilityLevels: AbilityLevels;
    strengths: string;
    academicYear: string;
    term: string;
  }) => void;
  loading: boolean;
}) {
  const [abilityLevels, setAbilityLevels] = useState<Record<string, string>>(
    {},
  );
  const [strengths, setStrengths] = useState("");
  const [academicYear, setAcademicYear] = useState(CURRENT_YEAR);
  const [term, setTerm] = useState("1");

  const domains = ABILITY_OPTIONS[disabilityType] ?? [];
  const hasAnyAbility = Object.values(abilityLevels).some(Boolean);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold text-slate-900">ระดับความสามารถปัจจุบัน</h2>

      {domains.length === 0 ? (
        <p className="text-sm text-amber-600">
          ยังไม่มีข้อมูลสำหรับความพิการประเภทนี้ — คน A ต้องเพิ่มใน
          mappingTable.json ก่อน
        </p>
      ) : (
        <div className="space-y-3">
          {domains.map((d) => (
            <div key={d.domain}>
              <label className="mb-1 block text-xs text-slate-500">
                {d.label}
              </label>
              <select
                value={abilityLevels[d.domain] ?? ""}
                onChange={(e) =>
                  setAbilityLevels((prev) => ({
                    ...prev,
                    [d.domain]: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">— ไม่ระบุ —</option>
                {d.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs text-slate-500">
          จุดเด่น / สิ่งที่ทำได้ (ไม่บังคับ)
        </label>
        <textarea
          value={strengths}
          onChange={(e) => setStrengths(e.target.value)}
          rows={2}
          placeholder="เช่น ชอบวาดภาพ จดจำภาพได้ดี"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-amber-600">
          ⚠️ ห้ามกรอกชื่อจริงหรือข้อมูลระบุตัวตน
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500">
            ปีการศึกษา
          </label>
          <input
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">ภาคเรียน</label>
          <select
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </div>
      </div>

      <button
        onClick={() =>
          onSubmit({ abilityLevels, strengths, academicYear, term })
        }
        disabled={loading || !hasAnyAbility}
        className="w-full rounded-lg bg-teal-600 px-4 py-2.5 font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {loading ? "กำลังสร้าง..." : "สร้างแผน"}
      </button>
      {!hasAnyAbility && domains.length > 0 && (
        <p className="text-center text-xs text-slate-400">
          เลือกระดับความสามารถอย่างน้อย 1 ด้านก่อน
        </p>
      )}
    </div>
  );
}
