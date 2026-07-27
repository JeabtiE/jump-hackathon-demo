/**
 * หน้าหลัก — คน B ดูแล
 *
 * Flow: เลือก/เพิ่มนักเรียน → กรอกระดับความสามารถ → สร้างแผน → ตรวจแก้ → ยืนยัน → export
 * แก้ไข/ออกแบบใหม่ได้เต็มที่ นี่เป็นแค่โครงตั้งต้นให้เห็น flow
 */

"use client";

import { useEffect, useState } from "react";
import StudentPicker from "@/components/StudentPicker";
import AssessmentForm from "@/components/AssessmentForm";
import PlanEditor from "@/components/PlanEditor";
import type { AbilityLevels, PlanDTO, StudentSummary } from "@/lib/types";

export default function Home() {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [selected, setSelected] = useState<StudentSummary | null>(null);
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadStudents() {
    try {
      const res = await fetch("/api/students");
      if (res.ok) setStudents(await res.json());
    } catch {
      setError("โหลดรายชื่อนักเรียนไม่สำเร็จ");
    }
  }

  useEffect(() => {
    loadStudents();
  }, []);

  async function handleGenerate(payload: {
    abilityLevels: AbilityLevels;
    strengths: string;
    academicYear: string;
    term: string;
  }) {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      // ── เช็คว่านักเรียนคนนี้เคยมีแผนมาก่อนไหม ──
      let committeeDefaults: {
        principalName?: string;
        responsibleTeacherName?: string;
        homeroomTeacherName?: string;
      } = {};

      try {
        const prevRes = await fetch(`/api/plans?studentId=${selected.id}`);
        if (prevRes.ok) {
          const prevPlans: PlanDTO[] = await prevRes.json();
          if (prevPlans.length > 0) {
            const latest = prevPlans.reduce((a, b) =>
              new Date(a.createdAt) > new Date(b.createdAt) ? a : b,
            );
            committeeDefaults = {
              principalName: latest.principalName,
              responsibleTeacherName: latest.responsibleTeacherName,
              homeroomTeacherName: latest.homeroomTeacherName,
              // meetingDate ไม่เอามาด้วยตามสเปค — เว้นว่างไว้เสมอ
            };
          }
        }
      } catch {
        // ดึงแผนเก่าไม่สำเร็จ ไม่เป็นไร ปล่อยว่างไว้ให้ครูกรอกเองตามปกติ
      }

      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: selected.id,
          ...payload,
          ...committeeDefaults,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "เกิดข้อผิดพลาด");
        return;
      }
      setPlan(data);
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">IEP GEN</h1>
          <p className="mt-1 text-slate-600">
            กรอกข้อมูลนักเรียนครั้งเดียว รับเป้าหมาย IEP และรายการสื่อที่เบิกได้
            พร้อมเหตุผลประกอบ
          </p>
        </div>
        <a
          href="/stats"
          className="text-sm text-slate-400 hover:text-slate-600"
        >
          สถิติการใช้งาน
        </a>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <section className="space-y-4">
          <StudentPicker
            students={students}
            selected={selected}
            onSelect={(s) => {
              setSelected(s);
              setPlan(null);
            }}
            onCreated={loadStudents}
          />

          {selected && (
            <AssessmentForm
              disabilityType={selected.disabilityType}
              onSubmit={handleGenerate}
              loading={loading}
            />
          )}
        </section>

        <section>
          {loading && (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-teal-500" />
              กำลังค้นหาข้อมูลและร่างเอกสาร...
            </div>
          )}

          {!loading && !plan && (
            <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center text-slate-400">
              {selected
                ? "กรอกระดับความสามารถทางซ้าย แล้วกด “สร้างแผน”"
                : "เลือกนักเรียนทางซ้ายเพื่อเริ่มต้น"}
            </div>
          )}

          {!loading && plan && <PlanEditor plan={plan} onChange={setPlan} />}
        </section>
      </div>

      <footer className="mt-12 border-t border-slate-200 pt-4 text-xs text-slate-400">
        ⚠️ ระบบนี้ช่วยร่างเอกสารเท่านั้น
        ครูต้องตรวจสอบและยืนยันก่อนนำไปใช้จริงเสมอ ·
        ห้ามกรอกชื่อจริงหรือข้อมูลระบุตัวตนของนักเรียน
      </footer>
    </main>
  );
}
