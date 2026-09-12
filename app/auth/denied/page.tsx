/**
 * /auth/denied — บัญชีล็อกอินสำเร็จกับ Google แต่ไม่มีสิทธิ์เข้าระบบ
 *
 * มาจาก callbacks.signIn ใน auth.ts ที่ redirect มาพร้อม ?email=...
 *
 * 🎯 ครูมักมีหลายบัญชี Google การบอกว่า "บัญชีไหน" ที่เพิ่งใช้เข้ามา
 *    คือข้อมูลชิ้นเดียวที่ช่วยให้แก้ปัญหาเองได้ (อ๋อ เผลอใช้บัญชีส่วนตัว)
 *
 * ⚠️ ห้ามมีคำภาษาอังกฤษหรือ error code ในหน้านี้
 */

import { signIn } from "@/auth";

/**
 * ค่าใน ?email= มาจาก URL ซึ่งใครก็แก้ได้ — แสดงเฉพาะที่หน้าตาเป็นอีเมลจริง
 * (React escape ให้อยู่แล้ว จึงไม่ใช่ช่อง XSS แต่กันไม่ให้หน้านี้ถูกใช้
 *  แปะข้อความหลอกลวงอะไรก็ได้ผ่านลิงก์)
 */
function safeEmail(value?: string): string | null {
  if (!value) return null;
  const email = value.trim();
  if (email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export default function DeniedPage({
  searchParams,
}: {
  searchParams: { email?: string };
}) {
  const email = safeEmail(searchParams.email);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าใช้งาน</h1>

        <p className="mt-3 text-sm leading-relaxed text-slate-700">
          ระบบนี้เก็บข้อมูลส่วนบุคคลของนักเรียน จึงเปิดให้เข้าใช้เฉพาะบัญชีที่ผู้ดูแลระบบ
          เพิ่มรายชื่อไว้ล่วงหน้าแล้วเท่านั้น
        </p>

        {email && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-900">บัญชีที่ท่านเพิ่งใช้เข้าระบบ</p>
            <p className="mt-1 break-all text-sm font-medium text-amber-950">{email}</p>
          </div>
        )}

        <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
          <p className="font-medium text-slate-900">ท่านทำอะไรได้บ้าง</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>หากท่านมีบัญชี Google หลายบัญชี ลองเข้าใหม่ด้วยบัญชีของโรงเรียน</li>
            <li>
              หากใช้บัญชีถูกต้องแล้ว กรุณาแจ้งผู้ดูแลระบบ
              {email ? " พร้อมบอกอีเมลที่แสดงด้านบน" : ""} เพื่อขอเพิ่มสิทธิ์
            </li>
          </ul>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="mt-5 w-full rounded-lg bg-teal-600 px-4 py-2.5 font-medium text-white transition hover:bg-teal-700"
          >
            ลองใหม่ด้วยบัญชีอื่น
          </button>
        </form>
      </div>
    </main>
  );
}
