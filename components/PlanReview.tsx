/**
 * components/PlanReview.tsx — คน B ดูแล (ใหม่)
 *
 * หน้าทบทวนแผน IEP หลัง AI ร่างเสร็จ — ครูแก้ไขได้ทีละ domain section
 * (จุดเด่น/จุดที่ควรพัฒนา/เป้าหมายระยะยาว/วิธีประเมิน/ผู้รับผิดชอบ) และทีละ
 * เป้าหมายระยะสั้นภายใน section นั้น ก่อนกด "ยืนยันแผน"
 *
 * 🔑 บันทึกด้วย PATCH /api/plans/[id] — ส่งเฉพาะ field ที่ต่างจาก state เดิม
 *    ก็ได้ แต่ที่นี่เลือกส่ง "ทุก section/goal/media ที่มีอยู่" ทุกครั้งที่กด
 *    บันทึก เพื่อความง่าย (endpoint คำนวณ isEdited จาก DB เองอยู่แล้ว ไม่ต้อง
 *    ให้ client รู้ diff)
 */

"use client";

import { useEffect, useState } from "react";
import type { PlanDTO, PlanDomainSectionDTO, PlanGoalDTO, PlanMediaDTO } from "@/lib/types";

async function fetchPlan(planId: string): Promise<PlanDTO> {
  const res = await fetch(`/api/plans/${planId}`);
  if (!res.ok) throw new Error("โหลดแผนไม่สำเร็จ");
  return res.json();
}

async function savePlan(
  planId: string,
  patch: {
    domainSections?: PlanDomainSectionDTO[];
    goals?: PlanGoalDTO[];
    media?: PlanMediaDTO[];
    status?: PlanDTO["status"];
  }
): Promise<PlanDTO> {
  const body = {
    domainSections: patch.domainSections?.map((s) => ({
      id: s.id,
      finalStrengths: s.finalStrengths,
      finalDevelopmentAreas: s.finalDevelopmentAreas,
      finalLongTermGoal: s.finalLongTermGoal,
      finalEvaluationMethod: s.finalEvaluationMethod,
      responsibleTeacherName: s.responsibleTeacherName ?? "",
    })),
    goals: patch.goals?.map((g) => ({
      id: g.id,
      finalText: g.finalText,
      isSelected: g.isSelected,
      finalIndicatorCodes: g.finalIndicatorCodes,
    })),
    media: patch.media?.map((m) => ({
      id: m.id,
      finalReason: m.finalReason,
      isApproved: m.isApproved,
    })),
    status: patch.status,
  };

  const res = await fetch(`/api/plans/${planId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("บันทึกไม่สำเร็จ");
  return res.json();
}

function GoalRow({
  goal,
  onChange,
}: {
  goal: PlanGoalDTO;
  onChange: (next: PlanGoalDTO) => void;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        goal.isSelected ? "border-teal-300 bg-teal-50/40" : "border-slate-200"
      }`}
    >
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={goal.isSelected}
          onChange={(e) => onChange({ ...goal, isSelected: e.target.checked })}
          className="mt-1"
        />
        <textarea
          value={goal.finalText}
          onChange={(e) => onChange({ ...goal, finalText: e.target.value })}
          rows={2}
          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2 pl-6 text-sm">
        <div>
          <span className="text-xs text-slate-500">เกณฑ์: </span>
          {goal.criterion ?? "—"}
        </div>
        <div>
          <span className="text-xs text-slate-500">ระยะเวลา: </span>
          {goal.timeframe ?? "—"}
        </div>
      </div>
      <div className="mt-1 pl-6">
        <label className="text-xs text-slate-500">ตัวชี้วัด (คั่นด้วย , )</label>
        <input
          value={goal.finalIndicatorCodes.join(", ")}
          onChange={(e) =>
            onChange({
              ...goal,
              finalIndicatorCodes: e.target.value
                .split(",")
                .map((c) => c.trim())
                .filter(Boolean),
            })
          }
          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </div>
      {goal.isEdited && (
        <p className="mt-1 pl-6 text-xs text-amber-600">✏️ แก้ไขจากที่ AI ร่างแล้ว</p>
      )}
    </div>
  );
}

function DomainSectionCard({
  section,
  onChange,
}: {
  section: PlanDomainSectionDTO;
  onChange: (next: PlanDomainSectionDTO) => void;
}) {
  const field = (
    key: "finalStrengths" | "finalDevelopmentAreas" | "finalLongTermGoal" | "finalEvaluationMethod",
    label: string
  ) => (
    <div>
      <label className="mb-1 block text-xs text-slate-500">{label}</label>
      <textarea
        value={section[key]}
        onChange={(e) => onChange({ ...section, [key]: e.target.value })}
        rows={2}
        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
      />
    </div>
  );

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">{section.domainLabel}</h3>
        {section.isEdited && <span className="text-xs text-amber-600">✏️ มีการแก้ไข</span>}
      </div>

      {field("finalStrengths", "จุดเด่น")}
      {field("finalDevelopmentAreas", "จุดที่ควรพัฒนา")}
      {field("finalLongTermGoal", "เป้าหมายระยะยาว 1 ปี")}
      {field("finalEvaluationMethod", "วิธีประเมินผล")}

      <div>
        <label className="mb-1 block text-xs text-slate-500">ผู้รับผิดชอบ</label>
        <input
          value={section.responsibleTeacherName ?? ""}
          onChange={(e) => onChange({ ...section, responsibleTeacherName: e.target.value })}
          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </div>

      <div className="space-y-2 pt-2">
        <p className="text-xs font-medium text-slate-600">เป้าหมายระยะสั้น (ติ๊กข้อที่จะใช้จริง)</p>
        {section.goals.map((g) => (
          <GoalRow
            key={g.id}
            goal={g}
            onChange={(next) =>
              onChange({
                ...section,
                goals: section.goals.map((og) => (og.id === next.id ? next : og)),
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function MediaRow({ media, onChange }: { media: PlanMediaDTO; onChange: (next: PlanMediaDTO) => void }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={media.isApproved}
          onChange={(e) => onChange({ ...media, isApproved: e.target.checked })}
          className="mt-1"
        />
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-800">
            {media.item} <span className="text-xs text-slate-400">(บัญชี {media.category})</span>
          </p>
          <textarea
            value={media.finalReason}
            onChange={(e) => onChange({ ...media, finalReason: e.target.value })}
            rows={2}
            placeholder="เหตุผลและความจำเป็น"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
      </label>
      {media.isEdited && <p className="mt-1 pl-6 text-xs text-amber-600">✏️ แก้ไขจากที่ AI ร่างแล้ว</p>}
    </div>
  );
}

export default function PlanReview({ planId }: { planId: string }) {
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlan(planId)
      .then(setPlan)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [planId]);

  if (loading) return <p className="text-sm text-slate-500">กำลังโหลดแผน...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!plan) return null;

  const handleSave = async (nextStatus?: PlanDTO["status"]) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await savePlan(planId, {
        domainSections: plan.domainSections,
        goals: plan.domainSections.flatMap((s) => s.goals),
        media: plan.media,
        status: nextStatus,
      });
      setPlan(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {plan.consistencyWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="mb-1 text-sm font-medium text-amber-800">ควรตรวจสอบก่อนยืนยันแผน:</p>
          <ul className="list-inside list-disc space-y-1 text-sm text-amber-700">
            {plan.consistencyWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {plan.domainSections.map((section) => (
        <DomainSectionCard
          key={section.id}
          section={section}
          onChange={(next) =>
            setPlan((prev) =>
              prev
                ? {
                    ...prev,
                    domainSections: prev.domainSections.map((s) =>
                      s.id === next.id ? next : s
                    ),
                  }
                : prev
            )
          }
        />
      ))}

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold text-slate-900">
          6. สิ่งอำนวยความสะดวก สื่อ บริการ
        </h3>
        {plan.media.map((m) => (
          <MediaRow
            key={m.id}
            media={m}
            onChange={(next) =>
              setPlan((prev) =>
                prev ? { ...prev, media: prev.media.map((mm) => (mm.id === next.id ? next : mm)) } : prev
              )
            }
          />
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => handleSave()}
          disabled={saving}
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก..." : "บันทึกร่าง"}
        </button>
        <button
          onClick={() => handleSave("finalized")}
          disabled={saving || plan.status === "finalized"}
          className="flex-1 rounded-lg bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {plan.status === "finalized" ? "ยืนยันแล้ว" : "ยืนยันแผน"}
        </button>
      </div>
    </div>
  );
}