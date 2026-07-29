/**
 * เลือก/เพิ่มนักเรียน — คน B ดูแล
 *
 * 🔒 ฟอร์มนี้เก็บข้อมูลส่วนบุคคลของนักเรียน (PII)
 *    ข้อมูลนี้ใช้เฉพาะตอน export เอกสาร .docx เท่านั้น ไม่เคยถูกส่งไป AI
 *    → ครูกรอกครั้งเดียว ปีถัดไปดึงมาใช้ซ้ำได้เลย ไม่ต้องกรอกในเอกสารเองอีก
 */

"use client";

import { useState } from "react";
import type {
  CreateStudentRequest,
  DisabilityType,
  StudentSummary,
} from "@/lib/types";
import BirthDatePicker from "./birthDatePicker";

const DISABILITY_OPTIONS: {
  value: DisabilityType;
  label: string;
  ready: boolean;
}[] = [
  { value: "autism", label: "ออทิสติก", ready: true },
  { value: "learning", label: "บกพร่องทางการเรียนรู้ (LD)", ready: true },
  { value: "intellectual", label: "บกพร่องทางสติปัญญา", ready: true },
  { value: "speech", label: "บกพร่องทางภาษาและการสื่อสาร", ready: true },
  { value: "behavioral", label: "บกพร่องทางพฤติกรรมหรืออารมณ์", ready: false },
];

const GRADE_OPTION = [
  { value: "ป1", label: "ป1" },
  { value: "ป2", label: "ป2" },
  { value: "ป3", label: "ป3" },
  { value: "ป4", label: "ป4" },
  { value: "ป5", label: "ป5" },
  { value: "ป6", label: "ป6" },
];

const RELATIONSHIP = [
  { value: "FATHER", label: "บิดา(พ่อ)" },
  { value: "MOTHER", label: "มารดา(แม่)" },
  { value: "GUADIAN", label: "ผู้ปกครองตามกฎหมาย" },
  { value: "RELATIVE", label: "ญาติ / ญาติผู้ใหญ่" },
];

const EMPTY: CreateStudentRequest = {
  code: "",
  disabilityType: "autism",
  gradeLevel: "",
  fullName: "",
  nationalId: "",
  disabilityCardNo: "",
  birthDate: "",
  religion: "",
  disabilityDetail: "",
  fatherName: "",
  motherName: "",
  guardianName: "",
  guardianRelation: "",
  address: "",
  phone: "",
  schoolName: "",
  affiliation: "",
  medicalNote: "",
  educationHistory: "",
};

export default function StudentPicker({
  students,
  selected,
  onSelect,
  onCreated,
}: {
  students: StudentSummary[];
  selected: StudentSummary | null;
  onSelect: (s: StudentSummary) => void;
  onCreated: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<CreateStudentRequest>(EMPTY);
  const [showMore, setShowMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof CreateStudentRequest>(
    key: K,
    v: CreateStudentRequest[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: v }));
  }

  async function handleCreate() {
    if (!form.code.trim()) return setErr("กรุณาระบุรหัสนักเรียน");
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) return setErr(data.error ?? "บันทึกไม่สำเร็จ");
      setForm(EMPTY);
      setShowMore(false);
      setAdding(false);
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
  const labelCls = "mb-1 block text-xs text-slate-500";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">นักเรียน</h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-sm text-teal-600 hover:text-teal-700"
        >
          {adding ? "ยกเลิก" : "+ เพิ่ม"}
        </button>
      </div>

      {adding && (
        <div className="mb-4 space-y-3 rounded-lg bg-slate-50 p-3">
          <p className="rounded-md bg-teal-50 p-2 text-xs text-teal-800">
            🔒 ข้อมูลส่วนตัวที่กรอกจะใช้เฉพาะตอนสร้างเอกสาร ไม่ถูกส่งไปยัง AI
            และกรอกครั้งเดียวใช้ได้ทุกปี
          </p>

          {/* ── ข้อมูลจำเป็น ── */}
          <div>
            <label className={labelCls}>
              รหัสนักเรียน (สำหรับอ้างอิงในระบบ) *
            </label>
            <input
              value={form.code}
              onChange={(e) => set("code", e.target.value)}
              placeholder="เช่น A-01"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>ชื่อ-นามสกุล</label>
            <input
              value={form.fullName ?? ""}
              onChange={(e) => set("fullName", e.target.value)}
              placeholder="เช่น เด็กชายสมชาย ใจดี"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>ประเภทความพิการ *</label>
            <select
              value={form.disabilityType}
              onChange={(e) =>
                set("disabilityType", e.target.value as DisabilityType)
              }
              className={inputCls}
            >
              {DISABILITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} disabled={!o.ready}>
                  {o.label} {o.ready ? "" : "(ยังไม่พร้อมใช้)"}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>ระดับชั้น</label>
              <select
                value={form.gradeLevel ?? ""}
                onChange={(e) => set("gradeLevel", e.target.value)}
                className={inputCls}
              >
                <option value="">--เลือกระดับชั้น--</option>
                {GRADE_OPTION.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <BirthDatePicker
                value={form.birthDate ?? ""}
                onChange={(v) => set("birthDate", v)}
                labelCls={labelCls}
                inputCls={inputCls}
              />
            </div>
          </div>

          {/* ── ข้อมูลเพิ่มเติมสำหรับเอกสาร (พับเก็บได้) ── */}
          <button
            onClick={() => setShowMore((v) => !v)}
            className="text-xs text-slate-600 underline"
          >
            {showMore
              ? "ซ่อนข้อมูลเพิ่มเติม"
              : "+ ข้อมูลเพิ่มเติมสำหรับเอกสาร (กรอกทีหลังได้)"}
          </button>

          {showMore && (
            <div className="space-y-3 border-t border-slate-200 pt-3">
              <div>
                <label className={labelCls}>เลขประจำตัวประชาชน</label>
                <input
                  value={form.nationalId ?? ""}
                  onChange={(e) => set("nationalId", e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>ทะเบียนคนพิการเลขที่</label>
                <input
                  value={form.disabilityCardNo ?? ""}
                  onChange={(e) => set("disabilityCardNo", e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>ลักษณะความพิการ (รายละเอียด)</label>
                <textarea
                  value={form.disabilityDetail ?? ""}
                  onChange={(e) => set("disabilityDetail", e.target.value)}
                  rows={2}
                  placeholder="เช่น พูดไม่ได้ มีพฤติกรรมกระตุ้นตนเองซ้ำๆ"
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>ชื่อบิดา</label>
                  <input
                    value={form.fatherName ?? ""}
                    onChange={(e) => set("fatherName", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>ชื่อมารดา</label>
                  <input
                    value={form.motherName ?? ""}
                    onChange={(e) => set("motherName", e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>ชื่อผู้ปกครอง</label>
                  <input
                    value={form.guardianName ?? ""}
                    onChange={(e) => set("guardianName", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>เกี่ยวข้องเป็น</label>
                  <select
                    value={form.guardianRelation ?? ""}
                    onChange={(e) => set("guardianRelation", e.target.value)}
                    className={inputCls}
                  >
                    <option value="">-กรุณาเลือก-</option>
                    {RELATIONSHIP.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>ที่อยู่ที่ติดต่อได้</label>
                <textarea
                  value={form.address ?? ""}
                  onChange={(e) => set("address", e.target.value)}
                  rows={2}
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>โทรศัพท์</label>
                  <input
                    value={form.phone ?? ""}
                    onChange={(e) => set("phone", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>ศาสนา</label>
                  <input
                    value={form.religion ?? ""}
                    onChange={(e) => set("religion", e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>ชื่อสถานศึกษา</label>
                  <input
                    value={form.schoolName ?? ""}
                    onChange={(e) => set("schoolName", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>สังกัด</label>
                  <input
                    value={form.affiliation ?? ""}
                    onChange={(e) => set("affiliation", e.target.value)}
                    placeholder="สพป.ชร.เขต1"
                    className={inputCls}
                  />
                </div>
              </div>
              <div>
                <label className={labelCls}>ข้อมูลด้านการแพทย์/สุขภาพ</label>
                <textarea
                  value={form.medicalNote ?? ""}
                  onChange={(e) => set("medicalNote", e.target.value)}
                  rows={2}
                  placeholder="โรคประจำตัว แพ้ยา ผลตรวจทางการแพทย์"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>ประวัติการศึกษาที่ผ่านมา</label>
                <textarea
                  value={form.educationHistory ?? ""}
                  onChange={(e) => set("educationHistory", e.target.value)}
                  rows={2}
                  placeholder="เช่น โรงเรียนเรียนร่วม ... ระดับ อ.3 พ.ศ. 2567"
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {err && <p className="text-xs text-red-600">{err}</p>}
          <button
            onClick={handleCreate}
            disabled={saving}
            className="w-full rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-300"
          >
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      )}

      {students.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">
          ยังไม่มีข้อมูลนักเรียน
        </p>
      ) : (
        <ul className="space-y-1.5">
          {students.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => onSelect(s)}
                className={`w-full rounded-lg border p-3 text-left text-sm transition ${
                  selected?.id === s.id
                    ? "border-teal-500 bg-teal-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className="font-medium text-slate-900">
                  {s.fullName || s.code}
                </span>
                {s.fullName && (
                  <span className="ml-2 text-xs text-slate-400">
                    ({s.code})
                  </span>
                )}
                {s.gradeLevel && (
                  <span className="ml-2 text-slate-500">{s.gradeLevel}</span>
                )}
                <span className="mt-0.5 block text-xs text-slate-400">
                  แผนที่ทำแล้ว {s.planCount} ฉบับ
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
