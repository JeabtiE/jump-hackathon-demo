/**
 * หน้าสถิติ — เครื่องเก็บหลักฐานสำหรับใบสมัคร
 * ระบบคำนวณให้อัตโนมัติ ไม่ต้องนั่งจดมือ
 */

"use client";

import { useEffect, useState } from "react";
import type { UsageStats } from "@/lib/types";

export default function StatsPage() {
  const [stats, setStats] = useState<UsageStats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  if (!stats) {
    return (
      <main className="mx-auto max-w-3xl p-8 text-slate-400">กำลังโหลด...</main>
    );
  }

  const cards = [
    { label: "แผนทั้งหมด", value: `${stats.totalPlans} ฉบับ` },
    { label: "ยืนยันแล้ว", value: `${stats.finalizedPlans} ฉบับ` },
    {
      label: "เวลาเฉลี่ยต่อแผน (ร่างแผนทั้ง workflow)",
      value: stats.avgDraftingSeconds
        ? `${Math.round(stats.avgDraftingSeconds / 60)} นาที`
        : "-",
      note: "นับตั้งแต่กรอกแบบประเมินเสร็จ → AI ร่าง → ครูแก้/เลือก → ครูกดยืนยัน — ใช้ตัวนี้เทียบ baseline",
    },
    {
      label: "เวลาเฉลี่ย (เฉพาะแก้/เลือก → ยืนยัน)",
      value: stats.avgDurationSeconds
        ? `${Math.round(stats.avgDurationSeconds / 60)} นาที`
        : "-",
      note: "ตัวเลขเดิม ไม่รวมเวลากรอกแบบประเมิน/เวลา AI ร่าง — เก็บไว้อ้างอิงย้อนหลัง",
    },
    { label: "เป้าหมายที่ครูแก้", value: `${stats.goalEditRate}%` },
    { label: "เหตุผลเบิกสื่อที่ครูแก้", value: `${stats.mediaEditRate}%` },
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <a href="/" className="text-sm text-slate-400 hover:text-slate-600">
        ← กลับหน้าหลัก
      </a>
      <h1 className="mb-1 mt-4 text-2xl font-bold text-slate-900">
        สถิติการใช้งาน
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        ตัวเลขเหล่านี้ใช้เป็นหลักฐานประกอบใบสมัคร — ระบบเก็บให้อัตโนมัติ
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
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
        ไม่แก้เลย {stats.goalEditBreakdown.uneditedPct}% · แก้เล็กน้อย{" "}
        {stats.goalEditBreakdown.minorEditPct}% · แก้เยอะ{" "}
        {stats.goalEditBreakdown.majorEditPct}%
      </div>

      <p className="mt-6 text-xs text-slate-400">
        💡 &ldquo;เป้าหมายที่ครูแก้ %&rdquo; ยิ่งต่ำ = AI ร่างได้ตรงใจครูมากขึ้น
        · ทุกจุดที่ครูแก้คือ insight ว่าระบบยังไม่ดีพอตรงไหน
      </p>
    </main>
  );
}
