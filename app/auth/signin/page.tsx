/**
 * /auth/signin — หน้าลงชื่อเข้าใช้
 *
 * 🎯 ผู้ใช้จริงคือพี่เลี้ยงเด็กพิการ วุฒิ ม.6 — หน้านี้ต้องมี "ปุ่มเดียว" ไม่มีช่องกรอกอะไรเลย
 *    ไม่มีคำภาษาอังกฤษ ไม่มี error code ให้เห็น
 *
 * เป็น Server Component + server action — ไม่ต้องมี "use client" ให้ JS โหลดเพิ่ม
 */

import { signIn } from "@/auth";

/**
 * แปลง error code ของ Auth.js เป็นภาษาไทย
 * ⚠️ ห้ามแสดง code ดิบให้ครูเห็นไม่ว่ากรณีใด — ที่ไม่รู้จักให้ตกลงมาที่ FALLBACK
 */
const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: "บัญชีนี้ยังไม่ได้รับสิทธิ์ให้เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
  Configuration: "ระบบยังตั้งค่าการเข้าสู่ระบบไม่เรียบร้อย กรุณาแจ้งผู้ดูแลระบบ",
  Verification: "ลิงก์เข้าสู่ระบบหมดอายุแล้ว กรุณาลองใหม่อีกครั้ง",
  OAuthAccountNotLinked: "อีเมลนี้เคยเข้าใช้งานด้วยวิธีอื่น กรุณาใช้บัญชีเดิมที่เคยใช้",
};

const FALLBACK_ERROR = "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";

export default function SignInPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const errorMessage = searchParams.error
    ? (ERROR_MESSAGES[searchParams.error] ?? FALLBACK_ERROR)
    : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">IEP GEN</h1>
        <p className="mt-1 text-sm text-slate-600">
          ผู้ช่วยครูการศึกษาพิเศษร่างแผน IEP
        </p>

        {errorMessage && (
          <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {errorMessage}
          </p>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="mt-6 flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <GoogleLogo />
            ลงชื่อเข้าใช้ด้วยบัญชี Google
          </button>
        </form>

        <p className="mt-5 text-xs leading-relaxed text-slate-500">
          ระบบนี้เก็บข้อมูลส่วนบุคคลของนักเรียน จึงเปิดให้เฉพาะบัญชีที่ได้รับสิทธิ์ไว้แล้วเท่านั้น
          หากเข้าไม่ได้ กรุณาติดต่อผู้ดูแลระบบเพื่อขอเพิ่มอีเมลของท่าน
        </p>

        {/* ให้ครูอ่านได้ก่อนตัดสินใจกดล็อกอิน — /privacy เปิดได้โดยไม่ต้องล็อกอิน */}
        <p className="mt-3 text-xs text-slate-400">
          <a href="/privacy" className="underline hover:text-slate-600">
            นโยบายความเป็นส่วนตัว
          </a>
        </p>
      </div>
    </main>
  );
}

/** โลโก้ Google — ฝังเป็น SVG ไม่โหลดรูปจากข้างนอก */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
