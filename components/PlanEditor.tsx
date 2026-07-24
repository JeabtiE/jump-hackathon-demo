/**
 * ตรวจแก้แผน + ยืนยัน + export — คน B ดูแล
 *
 * 🔑 สองอย่างที่สำคัญที่สุดในหน้านี้:
 *    1. ปุ่ม Copy — สำหรับกรอกเข้าระบบ SET online (ครูพิมพ์ทีละช่อง)
 *    2. ปุ่ม Export .docx — สำหรับเอกสารฉบับจริงที่คณะกรรมการต้องเซ็น
 *
 * การแก้ไขจะบันทึกลง finalText/finalReason เท่านั้น
 * ระบบเก็บ aiOriginal ไว้ → รู้เองว่าครูแก้อะไรบ้าง (= หลักฐานสำหรับใบสมัคร)
 */

"use client";

import { useState } from "react";
import CopyButton from "./CopyButton";
import type { PlanDTO } from "@/lib/types";

export default function PlanEditor({
  plan,
  onChange,
}: {
  plan: PlanDTO;
  onChange: (p: PlanDTO) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/plans/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        onChange(await res.json());
        setSavedAt(new Date().toLocaleTimeString("th-TH"));
      }
    } finally {
      setSaving(false);
    }
  }

  const selectedGoal = plan.goals.find((g) => g.isSelected);
  const isFinalized = plan.status === "finalized";

  return (
    <div className="space-y-5">
      {/* แถบสถานะ + ปุ่มหลัก */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm">
          <span className="font-medium text-slate-900">
            {plan.studentFullName || plan.studentCode}
          </span>
          <span className="ml-2 text-slate-500">
            ปีการศึกษา {plan.academicYear} เทอม {plan.term}
          </span>
          {isFinalized && (
            <span className="ml-2 rounded bg-teal-100 px-2 py-0.5 text-xs text-teal-700">
              ยืนยันแล้ว
            </span>
          )}
          {savedAt && !saving && (
            <span className="ml-2 text-xs text-slate-400">บันทึกล่าสุด {savedAt}</span>
          )}
        </div>

        <div className="flex gap-2">
          {!isFinalized && (
            <button
              onClick={() => patch({ status: "finalized" })}
              disabled={saving}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:bg-slate-300"
            >
              ยืนยันแผน
            </button>
          )}
          <a
            href={`/api/plans/${plan.id}/export`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ดาวน์โหลด .docx
          </a>
        </div>
      </div>

      {/* คำเตือน */}
      {plan.consistencyWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="mb-1 font-medium">ระบบพบจุดที่ควรตรวจสอบ</p>
          <ul className="list-inside list-disc space-y-0.5">
            {plan.consistencyWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* เป้าหมาย IEP */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">เป้าหมาย IEP</h3>
          <CopyButton text={selectedGoal?.finalText} />
        </div>

        <div className="space-y-3">
          {plan.goals.map((g, i) => (
            <div
              key={g.id}
              className={`rounded-lg border p-3 transition ${
                g.isSelected ? "border-teal-500 bg-teal-50" : "border-slate-200"
              }`}
            >
              <label className="mb-2 flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="goal"
                  checked={g.isSelected}
                  onChange={() =>
                    patch({
                      goals: plan.goals.map((x) => ({ id: x.id, isSelected: x.id === g.id })),
                    })
                  }
                  className="mt-1"
                />
                <span className="text-xs font-medium text-slate-400">
                  ตัวเลือกที่ {i + 1}
                  {g.isEdited && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">
                      แก้ไขแล้ว
                    </span>
                  )}
                </span>
              </label>

              <textarea
                defaultValue={g.finalText}
                onBlur={(e) => {
                  if (e.target.value !== g.finalText) {
                    patch({ goals: [{ id: g.id, finalText: e.target.value }] });
                  }
                }}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />

              {g.isEdited && (
                <details className="mt-2 text-xs text-slate-500">
                  <summary className="cursor-pointer">ดูข้อความต้นฉบับที่ AI ร่าง</summary>
                  <p className="mt-1 rounded bg-slate-50 p-2">{g.aiOriginal}</p>
                </details>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* สื่อ/บัญชี ก-ข */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">สื่อและสิ่งอำนวยความสะดวกที่เบิกได้</h3>
          <CopyButton
            label="คัดลอกทั้งหมด"
            text={plan.media
              .filter((m) => m.isApproved)
              .map((m) => `${m.item} (บัญชี ${m.category})\nเหตุผล: ${m.finalReason}`)
              .join("\n\n")}
          />
        </div>

        <div className="space-y-3">
          {plan.media.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg border p-3 ${
                m.isApproved ? "border-slate-200" : "border-slate-200 bg-slate-50 opacity-60"
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={m.isApproved}
                  onChange={(e) =>
                    patch({ media: [{ id: m.id, isApproved: e.target.checked }] })
                  }
                />
                <span className="font-medium text-slate-900">{m.item}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  บัญชี {m.category}
                </span>
                {m.isEdited && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                    แก้ไขแล้ว
                  </span>
                )}
              </div>
              <textarea
                defaultValue={m.finalReason}
                onBlur={(e) => {
                  if (e.target.value !== m.finalReason) {
                    patch({ media: [{ id: m.id, finalReason: e.target.value }] });
                  }
                }}
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
