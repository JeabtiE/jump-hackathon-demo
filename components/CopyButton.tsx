/**
 * ปุ่มคัดลอก — คน B ดูแล
 * ฟีเจอร์นี้สำคัญที่สุดในระบบ เพราะครูต้องเอาข้อความไปวางในระบบ SET เอง
 */

"use client";

import { useState } from "react";

export default function CopyButton({
  text,
  label = "คัดลอก",
}: {
  text?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback สำหรับ browser เก่า / http (clipboard API ต้องการ https)
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      onClick={handleCopy}
      disabled={!text}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
    >
      {copied ? "✓ คัดลอกแล้ว" : label}
    </button>
  );
}
