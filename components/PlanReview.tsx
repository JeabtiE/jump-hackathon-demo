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
import type {
  PlanDTO,
  PlanDomainSectionDTO,
  PlanGoalDTO,
  PlanMediaDTO,
} from "@/lib/types";
import CopyButton from "./CopyButton";

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
    /** ── คณะกรรมการจัดทำแผน (ส่วนที่ 7) — field ระดับ plan ── */
    principalName?: string;
    responsibleTeacherName?: string;
    homeroomTeacherName?: string;
    /** "YYYY-MM-DD" ตรงกับที่ thaiMeetingDateLine() ใน export route คาดหวัง */
    meetingDate?: string;
  },
): Promise<PlanDTO> {
  const body = {
    domainSections: patch.domainSections?.map((s) => ({
      id: s.id,
      finalStrengths: s.finalStrengths,
      finalDevelopmentAreas: s.finalDevelopmentAreas,
      finalLongTermGoal: s.finalLongTermGoal,
      finalEvaluationMethod: s.finalEvaluationMethod,
      // ไม่ส่ง responsibleTeacherName ระดับ section แล้ว — ผู้รับผิดชอบย้ายไประดับเอกสาร
      // (PlanDTO.responsibleTeacherName) ไม่ส่งมา = PATCH ไม่แตะ ค่าเก่าใน DB คงอยู่
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
    // ช่องที่ครูยังไม่เคยแตะเป็น undefined → JSON.stringify ตัดทิ้ง → PATCH ไม่แตะค่าเดิม
    // (route เช็ค !== undefined) ส่วนช่องที่ล้างจนว่างจะส่ง "" ไปแล้ว route ทำ .trim() || null ให้เอง
    principalName: patch.principalName,
    responsibleTeacherName: patch.responsibleTeacherName,
    homeroomTeacherName: patch.homeroomTeacherName,
    meetingDate: patch.meetingDate,
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
        <label className="text-xs text-slate-500">
          ตัวชี้วัด (คั่นด้วย , )
        </label>
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
        <>
          <p className="mt-1 pl-6 text-xs text-amber-600">
            ✏️ แก้ไขจากที่ AI ร่างแล้ว
          </p>
          {/* AI recommendation ต้องโชว์ที่มาเสมอ ไม่ใช่ black box (§4/§6)
              ครูเทียบกับต้นฉบับได้ว่าจะแก้กลับไปใกล้ของเดิมไหม */}
          <details className="mt-1 pl-6 text-xs text-slate-500">
            <summary className="cursor-pointer">
              ดูข้อความต้นฉบับที่ AI ร่าง
            </summary>
            <p className="mt-1 rounded bg-slate-50 p-2">{goal.aiOriginal}</p>
          </details>
        </>
      )}
    </div>
  );
}

function DomainSectionCard({
  section,
  onChange,
  isOpen,
  onToggle,
  index,
}: {
  section: PlanDomainSectionDTO;
  onChange: (next: PlanDomainSectionDTO) => void;
  isOpen: boolean;
  onToggle: () => void;
  index: number;
}) {
  // helper สร้างช่อง textarea ของแต่ละ final* field ใน section
  function field(
    key:
      | "finalStrengths"
      | "finalDevelopmentAreas"
      | "finalLongTermGoal"
      | "finalEvaluationMethod",
    label: string,
  ) {
    return (
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-500">{label}</label>
        <textarea
          value={section[key] ?? ""}
          onChange={(e) => onChange({ ...section, [key]: e.target.value })}
          rows={3}
          className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
      >
        <h3 className="font-semibold text-slate-900">
          ข้อ 5.{index} · {section.domainLabel}
        </h3>
        <span className="flex items-center gap-2">
          {section.isEdited && (
            <span className="text-xs text-amber-600">✏️ มีการแก้ไข</span>
          )}
          <span className="text-slate-400">{isOpen ? "▲" : "▼"}</span>
        </span>
      </button>

      {isOpen && (
        <>
          {field("finalStrengths", "จุดเด่น")}
          {field("finalDevelopmentAreas", "จุดที่ควรพัฒนา")}
          {field("finalLongTermGoal", "เป้าหมายระยะยาว 1 ปี")}
          {field("finalEvaluationMethod", "วิธีประเมินผล")}

          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium text-slate-500">
              จุดประสงค์เชิงพฤติกรรม (เป้าหมายระยะสั้น)
            </p>
            {section.goals.map((goal) => (
              <GoalRow
                key={goal.id}
                goal={goal}
                onChange={(next) =>
                  onChange({
                    ...section,
                    goals: section.goals.map((g) =>
                      g.id === next.id ? next : g,
                    ),
                  })
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * ข้อความ 1 บรรทัดของสื่อ 1 รายการ สำหรับวางในระบบคูปองออนไลน์
 * ครูต้องได้ครบ 3 อย่าง: ชื่อสื่อ + รหัสสื่อ + ราคา
 *
 * แยกเป็น head (รหัส + ชื่อสื่อ) กับ meta (บัญชี + ราคา) เพื่อให้ MediaRow จัดสไตล์
 * meta ให้จางลงได้ ส่วนปุ่มคัดลอกเอามาต่อกันเป็นบรรทัดเดียว — ตรรกะรหัส/ราคาอยู่ที่เดียว
 * format เดียวกับของเดิมใน PlanEditor.tsx (commit daba634)
 */
function mediaLabelParts(m: PlanMediaDTO): { head: string; meta: string } {
  // บัญชี ก ไม่มีราคาเพราะเป็นการขอยืม — แสดง "ขอยืม" แทน
  // (ให้ตรงกับช่องจำนวนเงินใน .docx: app/api/plans/[id]/export/route.ts)
  const amount = m.price ?? (m.mode === "ขอยืม" ? "ขอยืม" : null);
  // แผนเก่าที่สร้างก่อนอ้างอิงคู่มือ 2568 ไม่มีรหัส → ตัดวงเล็บเหลี่ยมออก
  const prefix = m.code ? `[${m.code}] ` : "";
  return {
    head: `${prefix}${m.item}`,
    meta: `(บัญชี ${m.category}${amount ? `, ${amount}` : ""})`,
  };
}

function mediaCopyText(m: PlanMediaDTO): string {
  const { head, meta } = mediaLabelParts(m);
  return `${head} ${meta} — เหตุผล: ${m.finalReason}`;
}

function MediaRow({
  media,
  onChange,
}: {
  media: PlanMediaDTO;
  onChange: (next: PlanMediaDTO) => void;
}) {
  const { head, meta } = mediaLabelParts(media);
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start gap-2">
        {/* ปุ่มคัดลอกต้องอยู่นอก <label> — ถ้าอยู่ข้างในจะไปติ๊ก/ถอน checkbox ทุกครั้งที่กด */}
        <label className="flex flex-1 items-start gap-2">
          <input
            type="checkbox"
            checked={media.isApproved}
            onChange={(e) =>
              onChange({ ...media, isApproved: e.target.checked })
            }
            className="mt-1"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-800">
              {head} <span className="text-xs text-slate-400">{meta}</span>
            </p>
            <textarea
              value={media.finalReason}
              onChange={(e) =>
                onChange({ ...media, finalReason: e.target.value })
              }
              rows={2}
              placeholder="เหตุผลและความจำเป็น"
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
        </label>
        <CopyButton text={mediaCopyText(media)} />
      </div>
      {media.isEdited && (
        <>
          <p className="mt-1 pl-6 text-xs text-amber-600">
            ✏️ แก้ไขจากที่ AI ร่างแล้ว
          </p>
          <details className="mt-1 pl-6 text-xs text-slate-500">
            <summary className="cursor-pointer">
              ดูข้อความต้นฉบับที่ AI ร่าง
            </summary>
            <p className="mt-1 rounded bg-slate-50 p-2">
              {/* รายการในกลุ่ม "ครูเลือกเพิ่มได้" ไม่ได้ผ่าน AI — aiReason ว่างเปล่า
                  ถ้าไม่ดักไว้ กล่องจะเปิดออกมาว่างจนครูงงว่าพัง */}
              {media.aiReason.trim() ||
                "AI ไม่ได้แนะนำรายการนี้ — ครูเลือกเพิ่มและเขียนเหตุผลเองทั้งหมด"}
            </p>
          </details>
        </>
      )}
    </div>
  );
}

export default function PlanReview({ planId }: { planId: string }) {
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);
  /** ครูกดยืนยันแผนทั้งที่ข้อมูลคณะกรรมการยังไม่ครบ — เตือนอย่างเดียว ไม่ได้ขวาง */
  const [committeeWarned, setCommitteeWarned] = useState(false);
  /** เวลาที่บันทึกสำเร็จครั้งล่าสุด — โชว์ในแถบหัวให้ครูรู้ว่างานไม่หาย */
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    if (plan && !openSectionId)
      setOpenSectionId(plan.domainSections[0]?.id ?? null);
  }, [plan, openSectionId]);

  useEffect(() => {
    fetchPlan(planId)
      .then(setPlan)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [planId]);

  if (loading) return <p className="text-sm text-slate-500">กำลังโหลดแผน...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!plan) return null;

  const exportUrl = `/api/plans/${planId}/export`;

  /**
   * ช่องคณะกรรมการ (ส่วนที่ 7) ที่ยังว่าง — ใช้เตือนอย่างเดียว ห้ามเอาไป disable
   * ปุ่มยืนยัน ครูต้องเป็นคนตัดสินใจเองว่าจะยืนยันทั้งที่ยังไม่ครบไหม
   */
  const missingCommitteeFields =
    !plan.principalName?.trim() ||
    !plan.responsibleTeacherName?.trim() ||
    !plan.homeroomTeacherName?.trim() ||
    !plan.meetingDate?.trim();

  /** แก้ field ระดับ plan ของส่วนที่ 7 — บันทึกจริงตอนกดบันทึกร่าง/ยืนยันแผน */
  const setCommitteeField = (
    key:
      | "principalName"
      | "responsibleTeacherName"
      | "homeroomTeacherName"
      | "meetingDate",
    value: string,
  ) => setPlan((prev) => (prev ? { ...prev, [key]: value } : prev));

  /** ช่อง input 1 ช่องของฟอร์มคณะกรรมการ */
  const committeeField = (
    key:
      | "principalName"
      | "responsibleTeacherName"
      | "homeroomTeacherName"
      | "meetingDate",
    label: string,
    type: "text" | "date" = "text",
  ) => (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        type={type}
        value={plan[key] ?? ""}
        onChange={(e) => setCommitteeField(key, e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
    </div>
  );

  const handleSave = async (nextStatus?: PlanDTO["status"]) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await savePlan(planId, {
        domainSections: plan.domainSections,
        goals: plan.domainSections.flatMap((s) => s.goals),
        media: plan.media,
        status: nextStatus,
        principalName: plan.principalName,
        responsibleTeacherName: plan.responsibleTeacherName,
        homeroomTeacherName: plan.homeroomTeacherName,
        meetingDate: plan.meetingDate,
      });
      setPlan(updated);
      setSavedAt(new Date().toLocaleTimeString("th-TH"));

      // ยืนยันแผนเสร็จ = ครูต้องการเอกสารฉบับจริงไปให้คณะกรรมการเซ็น
      // เด้งดาวน์โหลดให้เลย ไม่ต้องอ้อมไปหน้าประวัติ
      // ใช้ location.href ไม่ใช่ window.open เพราะ endpoint ตอบ
      // Content-Disposition: attachment — เบราว์เซอร์จึงดาวน์โหลดโดยไม่ย้ายหน้า
      // และไม่โดน popup blocker (เรียกหลัง await ไม่นับเป็น user gesture แล้ว)
      if (nextStatus === "finalized") window.location.href = exportUrl;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  /** finalText ของทุกเป้าหมายที่ครูติ๊กเลือกไว้ ข้ามทุก section — คั่นด้วยบรรทัดว่าง */
  const selectedGoalsText = plan.domainSections
    .flatMap((s) => s.goals)
    .filter((g) => g.isSelected)
    .map((g) => g.finalText.trim())
    .filter(Boolean)
    .join("\n\n");

  /** รูปแบบเดียวกับที่ครูต้องวางในระบบคูปองออนไลน์ — ต้องมีรหัสและราคา */
  const approvedMediaText = plan.media
    .filter((m) => m.isApproved)
    .map(mediaCopyText)
    .join("\n\n");

  return (
    <div className="space-y-5">
      {/* แถบหัว — เปิดหน้ามาต้องรู้ทันทีว่ากำลังทำแผนของใคร ปีไหน เทอมไหน สถานะอะไร */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <span className="font-medium text-slate-900">
          {plan.studentFullName || plan.studentCode}
        </span>
        <span className="text-slate-500">
          ปีการศึกษา {plan.academicYear} เทอม {plan.term}
        </span>
        {plan.status === "finalized" && (
          <span className="rounded bg-teal-100 px-2 py-0.5 text-xs text-teal-700">
            ยืนยันแล้ว
          </span>
        )}
        {savedAt && !saving && (
          <span className="text-xs text-slate-400">บันทึกล่าสุด {savedAt}</span>
        )}
      </div>

      {plan.consistencyWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="mb-1 text-sm font-medium text-amber-800">
            ควรตรวจสอบก่อนยืนยันแผน:
          </p>
          <ul className="list-inside list-disc space-y-1 text-sm text-amber-700">
            {plan.consistencyWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">
          5. การเสนอแผนการจัดการศึกษาเฉพาะบุคคล
        </h3>
        {/* เป้าหมายที่เลือกไว้กระจายอยู่หลาย section — รวมทุกข้อในปุ่มเดียวระดับหน้า
            (ของเดิมใน PlanEditor เลือกได้ข้อเดียว จึงคัดลอกทีละข้อได้) */}
        <CopyButton
          label="คัดลอกเป้าหมายระยะสั้น"
          text={selectedGoalsText.length > 0 ? selectedGoalsText : undefined}
        />
      </div>

      {plan.domainSections.map((section, i) => (
        <DomainSectionCard
          key={section.id}
          section={section}
          isOpen={openSectionId === section.id}
          onToggle={() =>
            setOpenSectionId(openSectionId === section.id ? null : section.id)
          }
          index={i + 1}
          onChange={(next) =>
            setPlan((prev) =>
              prev
                ? {
                    ...prev,
                    domainSections: prev.domainSections.map((s) =>
                      s.id === next.id ? next : s,
                    ),
                  }
                : prev,
            )
          }
        />
      ))}

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">
            6. สิ่งอำนวยความสะดวก สื่อ บริการ
          </h3>
          <CopyButton
            label="คัดลอกทั้งหมด"
            text={approvedMediaText.length > 0 ? approvedMediaText : undefined}
          />
        </div>

        {plan.media.filter((m) => m.aiReason !== "").length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-teal-700">
              ระบบแนะนำตามเป้าหมายที่เลือก
            </h4>
            {plan.media
              .filter((m) => m.aiReason !== "")
              .map((m) => (
                <MediaRow
                  key={m.id}
                  media={m}
                  onChange={(next) =>
                    setPlan((prev) =>
                      prev
                        ? {
                            ...prev,
                            media: prev.media.map((mm) =>
                              mm.id === next.id ? next : mm,
                            ),
                          }
                        : prev,
                    )
                  }
                />
              ))}
          </div>
        )}

        {plan.media.filter((m) => m.aiReason === "").length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-slate-500">
              รายการอื่นที่มีสิทธิ์เบิกได้ (ครูเลือกเพิ่มได้)
            </h4>
            {plan.media
              .filter((m) => m.aiReason === "")
              .map((m) => (
                <MediaRow
                  key={m.id}
                  media={m}
                  onChange={(next) =>
                    setPlan((prev) =>
                      prev
                        ? {
                            ...prev,
                            media: prev.media.map((mm) =>
                              mm.id === next.id ? next : mm,
                            ),
                          }
                        : prev,
                    )
                  }
                />
              ))}
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold text-slate-900">
          7. คณะกรรมการจัดทำแผนการจัดการศึกษาเฉพาะบุคคล
        </h3>
        {committeeField("principalName", "ผู้บริหารสถานศึกษา/ผู้แทน")}
        {committeeField("responsibleTeacherName", "ครูผู้รับผิดชอบ")}
        {committeeField("homeroomTeacherName", "ครูประจำชั้น")}
        {committeeField("meetingDate", "วันที่ประชุมจัดทำแผน", "date")}
      </div>

      {/* soft warning — ขึ้นหลังครูกดยืนยันทั้งที่ยังไม่ครบ ไม่ได้ขวางการยืนยัน */}
      {committeeWarned && missingCommitteeFields && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          ยังกรอกข้อมูลคณะกรรมการไม่ครบ — เอกสารที่ export จะมีช่องว่าง
          กรอกเพิ่มแล้วกด &quot;บันทึกร่าง&quot; หรือดาวน์โหลดใหม่ได้ตลอด
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => handleSave()}
          disabled={saving}
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก..." : "บันทึกร่าง"}
        </button>
        <button
          onClick={() => {
            setCommitteeWarned(missingCommitteeFields);
            handleSave("finalized");
          }}
          disabled={saving || plan.status === "finalized"}
          className="flex-1 rounded-lg bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {plan.status === "finalized" ? "ยืนยันแล้ว" : "ยืนยันแผน"}
        </button>
        {/* กดโหลดเองได้ตลอด ไม่ว่าจะยืนยันแล้วหรือยัง (ครูอาจอยากดูฉบับร่างก่อน)
            และเป็นทางสำรองเผื่อการเด้งดาวน์โหลดอัตโนมัติหลังยืนยันถูกบล็อก */}
        <a
          href={exportUrl}
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-center font-medium text-slate-700 hover:bg-slate-50"
        >
          ดาวน์โหลด .docx
        </a>
      </div>
    </div>
  );
}
