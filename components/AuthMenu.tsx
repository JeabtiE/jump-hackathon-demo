/**
 * components/AuthMenu.tsx — ปุ่มวงกลมรูปโปรไฟล์ + เมนูที่กดแล้วเปิดลงมา
 *
 * เป็น client component เพราะต้องจำสถานะเปิด/ปิด และดักคลิกนอกเมนูกับปุ่ม Esc
 * ส่วนที่ต้องใช้ session (และ server action) อยู่ที่ AuthHeader.tsx ฝั่ง server
 *
 * ⚠️ Tailwind ล้วน ไม่มี library เพิ่ม
 */

"use client";

import { useEffect, useRef, useState } from "react";

export default function AuthMenu({
  email,
  image,
  signOutAction,
}: {
  email: string;
  image: string | null;
  /** server action ที่นิยามไว้ใน AuthHeader.tsx — client นิยามเองไม่ได้ */
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // ไม่ต้องดักอะไรเลยตอนเมนูปิดอยู่ — ผูก listener เฉพาะตอนเปิด
    if (!open) return;

    function handlePointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      // ดึง focus กลับไปที่ปุ่ม ไม่งั้นคนใช้คีย์บอร์ดจะหลงว่าตอนนี้อยู่ตรงไหนของหน้า
      buttonRef.current?.focus();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // รูปจาก Google โหลดไม่ขึ้นได้ (ลิงก์หมดอายุ/โดนบล็อก) → ถอยไปใช้ตัวอักษรแรกแทน
  const showImage = image && !imageFailed;
  const initial = email.trim().charAt(0).toUpperCase();

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="เมนูบัญชีผู้ใช้"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="auth-menu-panel"
        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-teal-600 text-sm font-bold text-white transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
      >
        {showImage ? (
          /*
            ใช้ <img> ธรรมดาไม่ใช่ next/image โดยตั้งใจ — next/image ต้องประกาศ
            โดเมนของ Google ใน remotePatterns ของ next.config ไม่งั้น runtime error
            รูป avatar เล็กแค่ 36px ไม่คุ้มกับการเพิ่ม config
            referrerPolicy="no-referrer" จำเป็น — ไม่งั้น Google ตอบ 403 ในบางเบราว์เซอร์
          */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          initial
        )}
      </button>

      {open && (
        <div
          id="auth-menu-panel"
          className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {/*
            ส่วนหัว: อีเมลเต็ม — ครูหลายคนมีทั้งบัญชีส่วนตัวและบัญชีโรงเรียน
            ต้องตรวจได้ว่ากำลังใช้บัญชีไหนอยู่
            ⚠️ truncate ต้องมีขอบให้ตัด (w-60 ของกล่องแม่) และ title ให้ชี้เมาส์ดูตัวเต็มได้
          */}
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">ลงชื่อเข้าใช้ในชื่อ</p>
            <p
              title={email}
              className="mt-0.5 truncate text-sm font-medium text-slate-900"
            >
              {email}
            </p>
          </div>

          <a
            href="/privacy"
            className="block px-4 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50"
          >
            นโยบายความเป็นส่วนตัว
          </a>

          {/* กดแล้วออกเลย ไม่มีหน้าต่างยืนยัน — ไม่ใช่การลบข้อมูล กดพลาดก็ล็อกอินใหม่ได้ */}
          <form action={signOutAction}>
            <button
              type="submit"
              className="block w-full border-t border-slate-200 px-4 py-2.5 text-left text-sm text-slate-700 transition hover:bg-slate-50"
            >
              ออกจากระบบ
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
