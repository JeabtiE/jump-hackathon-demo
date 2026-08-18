/**
 * ฟอร์มกรอกระดับความสามารถ — คน B ดูแล
 *
 * 🔑 ใช้ dropdown เท่านั้น ไม่ให้ครูพิมพ์ prompt เอง
 *
 * ✏️ 17 ส.ค. 2569
 *   1. ลบ ABILITY_OPTIONS ที่ก็อปปี้ซ้ำออก → import จาก lib/ability-options.ts
 *      (single source of truth เดิมของคน A) เพิ่ม option ใหม่แก้ที่เดียวพอ
 *   2. เพิ่มช่อง "ผู้รับผิดชอบ" ต่อ domain ที่เลือกไว้ — ส่งเป็น
 *      responsibleTeacherByDomain ตอนกด "สร้างแผน" (CreatePlanRequest ใหม่)
 */

"use client";

import { useState } from "react";
import { ABILITY_OPTIONS } from "@/lib/ability-options";
import type { AbilityLevels } from "@/lib/types";

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
    responsibleTeacherByDomain: Record<string, string>;
  }) => void;
  loading: boolean;
}) {
  const [abilityLevels, setAbilityLevels] = useState<Record<string, string>>({});
  const [responsibleTeacherByDomain, setResponsibleTeacherByDomain] = useState<
    Record<string, string>
  >({});
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
        <div className="space-y-4">
          {domains.map((d) => {
            const isActive = Boolean(abilityLevels[d.domain]);
            return (
              <div key={d.domain}>
                <label className="mb-1 block text-xs text-slate-500">{d.label}</label>
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

                {/* ผู้รับผิดชอบของด้านนี้ — โผล่ทันทีที่เลือกระดับความสามารถของด้านนี้ไว้ */}
                {isActive && (
                  <div className="mt-2">
                    <label className="mb-1 block text-xs text-slate-500">
                      ผู้รับผิดชอบด้าน{d.label} (ไม่บังคับ)
                    </label>
                    <input
                      value={responsibleTeacherByDomain[d.domain] ?? ""}
                      onChange={(e) =>
                        setResponsibleTeacherByDomain((prev) => ({
                          ...prev,
                          [d.domain]: e.target.value,
                        }))
                      }
                      placeholder="เช่น ครูสุภาพร เสนนะ"
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
            );
          })}
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
        <p className="mt-1 text-xs text-amber-600">⚠️ ห้ามกรอกชื่อจริงหรือข้อมูลระบุตัวตน</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500">ปีการศึกษา</label>
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
          onSubmit({ abilityLevels, strengths, academicYear, term, responsibleTeacherByDomain })
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