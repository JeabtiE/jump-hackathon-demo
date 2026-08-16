"use client";

import { useEffect, useState } from "react";
import type { StudentHistoryDTO } from "@/lib/types";

export default function StudentHistoryPage({
  params,
}: {
  params: { id: string };
}) {
  const [data, setData] = useState<StudentHistoryDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/students/${params.id}/history`)
      .then((res) => {
        if (!res.ok) throw new Error("โหลดข้อมูลไม่สำเร็จ");
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <div className="p-8">กำลังโหลด...</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!data) return null;

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-1">ประวัติพัฒนาการ</h1>
      <p className="text-gray-500 mb-8">
        {data.fullName ?? data.code} ({data.code})
      </p>

      {data.history.length === 0 && (
        <p className="text-gray-400">ยังไม่มีข้อมูลการประเมิน</p>
      )}

      <div className="space-y-6">
        {data.history.map((entry) => (
          <div
            key={entry.assessmentId}
            className="border-l-2 border-teal-500 pl-4"
          >
            <p className="text-sm text-gray-500">
              {new Date(entry.assessedAt).toLocaleDateString("th-TH", {
                year: "numeric",
                month: "long",
              })}
            </p>
            {entry.strengths && (
              <p className="mt-1 text-sm">{entry.strengths}</p>
            )}
            <div className="mt-2 space-y-1">
              {entry.plans.map((p) => (
                <div key={p.id} className="text-sm">
                  ปีการศึกษา {p.academicYear} เทอม {p.term} — เลือกเป้าหมาย{" "}
                  {p.selectedGoalCount}/{p.goalCount} ข้อ
                  {p.status === "finalized" ? " ✓ ยืนยันแล้ว" : " (ร่าง)"}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
