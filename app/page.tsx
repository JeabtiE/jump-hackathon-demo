/**
 * หน้าหลัก — คน B ดูแล
 * แก้ไข/ออกแบบใหม่ได้เต็มที่ นี่เป็นแค่โครงตั้งต้นให้เห็น flow
 */

"use client";

import { useState } from "react";
import ProfileForm from "@/components/ProfileForm";
import ResultPanel from "@/components/ResultPanel";
import type { GenerateRequest, GenerateResponse } from "@/lib/types";

export default function Home() {
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(payload: GenerateRequest) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "เกิดข้อผิดพลาด");
        return;
      }
      setResult(data);
    } catch {
      setError("เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">IEP GO</h1>
        <p className="mt-1 text-slate-600">
          กรอกข้อมูลนักเรียนครั้งเดียว รับเป้าหมาย IEP และรายการสื่อที่เบิกได้ พร้อมเหตุผลประกอบ
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <section>
          <ProfileForm onSubmit={handleSubmit} loading={loading} />
        </section>

        <section>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
              {error}
            </div>
          )}

          {loading && (
            <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-500">
              <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-teal-500" />
              กำลังค้นหาข้อมูลและร่างเอกสาร...
            </div>
          )}

          {!loading && !result && !error && (
            <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center text-slate-400">
              กรอกข้อมูลนักเรียนทางซ้าย แล้วกด &ldquo;สร้างแผน&rdquo;
            </div>
          )}

          {!loading && result && <ResultPanel data={result} />}
        </section>
      </div>

      <footer className="mt-12 border-t border-slate-200 pt-4 text-xs text-slate-400">
        ⚠️ ระบบนี้ช่วยร่างเอกสารเท่านั้น ครูต้องตรวจสอบและยืนยันก่อนนำไปใช้จริงเสมอ ·
        ห้ามกรอกชื่อจริงหรือข้อมูลระบุตัวตนของนักเรียน
      </footer>
    </main>
  );
}
