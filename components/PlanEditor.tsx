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
import { useTransition } from "react";

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

  const [isPending, startTransition] = useTransition();
  const selectedGoal = plan.goals.find((g) => g.isSelected);
  const isFinalized = plan.status === "finalized";
  const missingCommitteeFields =
    !plan.principalName ||
    !plan.responsibleTeacherName ||
    !plan.homeroomTeacherName ||
    !plan.meetingDate;

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
            <span className="ml-2 text-xs text-slate-400">
              บันทึกล่าสุด {savedAt}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          {!isFinalized && (
            <button
              onClick={() => patch({ status: "finalized" })}
              disabled={saving || missingCommitteeFields}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:bg-slate-300"
              title={
                missingCommitteeFields
                  ? "กรุณากรอกข้อมูลคณะกรรมการให้ครบก่อน"
                  : undefined
              }
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
              <label
                className={`mb-2 flex items-start gap-2 text-sm ${isPending ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
              >
                <input
                  type="radio"
                  name="goal"
                  checked={g.isSelected}
                  disabled={isPending}
                  onChange={() =>
                    startTransition(async () => {
                      await patch({
                        goals: plan.goals.map((x) => ({
                          id: x.id,
                          isSelected: x.id === g.id,
                        })),
                      });
                    })
                  }
                  className="mt-1"
                />
                <span className="text-xs font-medium text-slate-400">
                  ตัวเลือกที่ {i + 1}
                  {isPending && (
                    <span className="ml-2 text-teal-600 animate-pulse font-normal">
                      กำลังบันทึก...
                    </span>
                  )}
                  {g.isEdited && !isPending && (
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
                  <summary className="cursor-pointer">
                    ดูข้อความต้นฉบับที่ AI ร่าง
                  </summary>
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
          <h3 className="font-semibold text-slate-900">
            สื่อและสิ่งอำนวยความสะดวกที่เบิกได้
          </h3>
          <CopyButton
            label="คัดลอกทั้งหมด"
            text={plan.media
              .filter((m) => m.isApproved)
              .map((m) => {
                // บัญชี ก ไม่มีราคาเพราะเป็นการขอยืม — แสดง "ขอยืม" แทน
                // (ให้ตรงกับช่องจำนวนเงินใน .docx: app/api/plans/[id]/export/route.ts)
                const amount = m.price ?? (m.mode === "ขอยืม" ? "ขอยืม" : null);
                // แผนเก่าที่สร้างก่อนอ้างอิงคู่มือ 2568 ไม่มีรหัส → ตัดวงเล็บเหลี่ยมออก
                const prefix = m.code ? `[${m.code}] ` : "";
                return `${prefix}${m.item} (บัญชี ${m.category}${amount ? `, ${amount}` : ""}) — เหตุผล: ${m.finalReason}`;
              })
              .join("\n\n")}
          />
        </div>

        <div className="space-y-3">
          {plan.media.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg border p-3 ${
                m.isApproved
                  ? "border-slate-200"
                  : "border-slate-200 bg-slate-50 opacity-60"
              }`}
            >
              <div className="mb-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={m.isApproved}
                  disabled={isPending}
                  onChange={(e) => {
                    const nextIsApprove = e.target.checked;
                    startTransition(async () => {
                      await patch({
                        media: [{ id: m.id, isApproved: nextIsApprove }],
                      });
                    });
                  }}
                  className="cursor-pointer disabled:cursor-not-allowed"
                />
                <span className="font-medium text-slate-900">{m.item}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  บัญชี {m.category}
                </span>

                {isPending && (
                  <span className="text-xs text-teal-600 animate-pulse font-normal">
                    กำลังบันทึก...
                  </span>
                )}

                {m.isEdited && !isPending && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                    แก้ไขแล้ว
                  </span>
                )}
              </div>
              <textarea
                defaultValue={m.finalReason}
                onBlur={(e) => {
                  if (e.target.value !== m.finalReason) {
                    patch({
                      media: [{ id: m.id, finalReason: e.target.value }],
                    });
                  }
                }}
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
      </div>
      {/* คณะกรรมการจัดทำแผน */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="mb-3 font-semibold text-slate-900">
          คณะกรรมการจัดทำแผน
        </h3>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              ผู้บริหารสถานศึกษา/ผู้แทน
            </label>
            <input
              type="text"
              defaultValue={plan.principalName ?? ""}
              onBlur={(e) => {
                if (e.target.value !== (plan.principalName ?? "")) {
                  patch({ principalName: e.target.value });
                }
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              ครูผู้รับผิดชอบ
            </label>
            <input
              type="text"
              defaultValue={plan.responsibleTeacherName ?? ""}
              onBlur={(e) => {
                if (e.target.value !== (plan.responsibleTeacherName ?? "")) {
                  patch({ responsibleTeacherName: e.target.value });
                }
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              ครูประจำชั้น
            </label>
            <input
              type="text"
              defaultValue={plan.homeroomTeacherName ?? ""}
              onBlur={(e) => {
                if (e.target.value !== (plan.homeroomTeacherName ?? "")) {
                  patch({ homeroomTeacherName: e.target.value });
                }
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              วันที่ประชุมจัดทำแผน
            </label>
            <input
              type="date"
              defaultValue={plan.meetingDate ?? ""}
              onBlur={(e) => {
                if (e.target.value !== (plan.meetingDate ?? "")) {
                  patch({ meetingDate: e.target.value });
                }
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
