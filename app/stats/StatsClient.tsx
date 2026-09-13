/**
 * หน้าสถิติ — เครื่องเก็บหลักฐานสำหรับใบสมัคร
 * ระบบคำนวณให้อัตโนมัติ ไม่ต้องนั่งจดมือ
 *
 * ✏️ แยกเป็น 2 ชุด: "ของฉัน" (ครูที่ล็อกอินอยู่) กับ "ทั้งระบบ" (ยอดรวมทุกคน)
 *    ชุดทั้งระบบเป็นตัวเลขล้วน ไม่มีชื่อครูหรือข้อมูลนักเรียนคนใดเลย
 */

"use client";

import { useEffect, useState } from "react";
import type { PlanUsageMetrics, UsageStats } from "@/lib/types";

function buildCards(m: PlanUsageMetrics) {
  return [
    { label: "แผนทั้งหมด", value: `${m.totalPlans} ฉบับ` },
    { label: "ยืนยันแล้ว", value: `${m.finalizedPlans} ฉบับ` },
    {
      label: "เวลาเฉลี่ยต่อแผน (ร่างแผนทั้ง workflow)",
      value: m.avgDraftingSeconds
        ? `${Math.round(m.avgDraftingSeconds / 60)} นาที`
        : "-",
      note: "นับตั้งแต่กรอกแบบประเมินเสร็จ → AI ร่าง → ครูแก้/เลือก → ครูกดยืนยัน — ใช้ตัวนี้เทียบ baseline",
    },
    {
      label: "เวลาเฉลี่ย (เฉพาะแก้/เลือก → ยืนยัน)",
      value: m.avgDurationSeconds
        ? `${Math.round(m.avgDurationSeconds / 60)} นาที`
        : "-",
      note: "ตัวเลขเดิม ไม่รวมเวลากรอกแบบประเมิน/เวลา AI ร่าง — เก็บไว้อ้างอิงย้อนหลัง",
    },
    { label: "เป้าหมายที่ครูแก้", value: `${m.goalEditRate}%` },
    { label: "เหตุผลเบิกสื่อที่ครูแก้", value: `${m.mediaEditRate}%` },
    {
      label: "ครูแก้ระดับที่ AI จัดให้",
      value: m.abilityOverrideRate !== null ? `${m.abilityOverrideRate}%` : "—",
      note: `นับเฉพาะด้านที่ครูแตะเลือกเอง ${
        m.abilityConfirmationBreakdown.teacherAgreed +
        m.abilityConfirmationBreakdown.teacherOverrode
      } ด้าน · AI กรอกให้ครูไม่ได้แตะ ${
        m.abilityConfirmationBreakdown.notConfirmedByTeacher
      } ด้าน · ข้อมูลก่อนเริ่มเก็บสถานะนี้ (ไม่ทราบ) ${
        m.abilityConfirmationBreakdown.unknown
      } ด้าน`,
    },
  ];
}

function MetricSection({
  title,
  description,
  metrics,
}: {
  title: string;
  description: string;
  metrics: PlanUsageMetrics;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="mb-4 text-sm text-slate-500">{description}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {buildCards(metrics).map((c) => (
          <div
            key={c.label}
            className="rounded-xl border border-slate-200 bg-white p-5"
          >
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{c.value}</p>
            {"note" in c && c.note && (
              <p className="mt-1 text-[11px] leading-snug text-slate-400">{c.note}</p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-2 text-sm text-gray-500">
        ไม่แก้เลย {metrics.goalEditBreakdown.uneditedPct}% · แก้เล็กน้อย{" "}
        {metrics.goalEditBreakdown.minorEditPct}% · แก้เยอะ{" "}
        {metrics.goalEditBreakdown.majorEditPct}%
      </div>
    </section>
  );
}

export default function StatsClient({ authSlot }: { authSlot: React.ReactNode }) {
  const [stats, setStats] = useState<UsageStats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => {});
  }, []);

  // แถวบนสุดต้องแสดงเสมอ แม้ตอนกำลังโหลด — ไม่งั้นถ้าโหลดค้าง ครูจะกดออกจากระบบไม่ได้
  const topRow = (
    <div className="flex items-center justify-between gap-4">
      <a href="/" className="text-sm text-slate-400 hover:text-slate-600">
        ← กลับหน้าหลัก
      </a>
      {authSlot}
    </div>
  );

  if (!stats) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        {topRow}
        <p className="mt-8 text-slate-400">กำลังโหลด...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {topRow}
      <h1 className="mb-1 mt-4 text-2xl font-bold text-slate-900">
        สถิติการใช้งาน
      </h1>
      <p className="mb-8 text-sm text-slate-500">
        ตัวเลขเหล่านี้ใช้เป็นหลักฐานประกอบใบสมัคร — ระบบเก็บให้อัตโนมัติ
      </p>

      <MetricSection
        title="ของฉัน"
        description="นับเฉพาะแผนและนักเรียนที่อยู่ในความดูแลของบัญชีนี้"
        metrics={stats.mine}
      />

      <MetricSection
        title="ทั้งระบบ"
        description="ยอดรวมของครูทุกคนในระบบ — เป็นตัวเลขรวมเท่านั้น ไม่มีชื่อครูหรือข้อมูลนักเรียนรายคน"
        metrics={stats.all}
      />

      <p className="mt-2 text-xs text-slate-400">
        💡 &ldquo;เป้าหมายที่ครูแก้ %&rdquo; ยิ่งต่ำ = AI ร่างได้ตรงใจครูมากขึ้น
        · ทุกจุดที่ครูแก้คือ insight ว่าระบบยังไม่ดีพอตรงไหน
      </p>
    </main>
  );
}
