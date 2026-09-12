/**
 * /privacy — นโยบายความเป็นส่วนตัว
 *
 * 🔑 ต้องเปิดได้โดยไม่ต้องล็อกอิน — Google ขอตรวจหน้านี้ตอน publish OAuth consent screen
 *    ถ้าเปิดไม่ได้ (โดนเด้งไปหน้าล็อกอิน) การ publish จะไม่ผ่าน
 *    → middleware.ts ต้องมี "/privacy" ใน PUBLIC_PATHS เสมอ ห้ามถอดออก
 *
 * Server Component ธรรมดา ไม่แตะ session ไม่แตะ DB — จึง prerender เป็น static ได้
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "นโยบายความเป็นส่วนตัว — IEP GEN",
  description:
    "ระบบเก็บข้อมูลอะไรบ้าง ข้อมูลนักเรียนไม่เคยถูกส่งไปยังระบบ AI และสิทธิของผู้ใช้",
};

/** หัวข้อระดับ 2 — แยกออกมาเพื่อให้ระยะห่างเท่ากันทุกหัวข้อ */
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-700">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    // max-w-2xl กันบรรทัดยาวเกินจนสายตาหาต้นบรรทัดถัดไปไม่เจอ
    <main className="mx-auto max-w-2xl px-4 py-8">
      <a href="/" className="text-sm text-slate-400 hover:text-slate-600">
        ← กลับหน้าหลัก
      </a>

      <article className="mt-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">
          นโยบายความเป็นส่วนตัว — IEP GEN
        </h1>
        <p className="mt-1 text-sm text-slate-500">ปรับปรุงล่าสุด: กันยายน 2569</p>

        <Section title="ระบบนี้คืออะไร">
          <p>
            IEP GEN เป็นเครื่องมือช่วยครูการศึกษาพิเศษร่างเอกสารแผนการจัดการศึกษาเฉพาะบุคคล
            (IEP) อยู่ในระหว่างการพัฒนา และเปิดให้ใช้งานเฉพาะบัญชีที่ได้รับอนุญาตไว้ล่วงหน้าเท่านั้น
          </p>
        </Section>

        <Section title="ข้อมูลที่เก็บ">
          <p>
            <strong className="font-semibold text-slate-900">ข้อมูลของผู้ใช้ (ครู)</strong>{" "}
            — อีเมลและชื่อจากบัญชี Google ใช้เพื่อยืนยันตัวตนและแยกข้อมูลของครูแต่ละคนออกจากกัน
          </p>
          <p>
            <strong className="font-semibold text-slate-900">ข้อมูลของนักเรียน</strong>{" "}
            — เฉพาะข้อมูลที่ครูกรอกเข้ามาเอง ได้แก่ ชื่อ-นามสกุล วันเกิด ข้อมูลผู้ปกครอง ที่อยู่
            เบอร์โทรศัพท์ ประเภทความพิการ ระดับชั้น และข้อมูลด้านการเรียน
            ข้อมูลเหล่านี้จำเป็นต่อการออกเอกสาร IEP ตามแบบฟอร์มของทางราชการ
          </p>
        </Section>

        <Section title="ข้อมูลของนักเรียนไม่เคยถูกส่งไปยังระบบ AI">
          <p>
            ระบบใช้ AI ช่วยร่างข้อความ แต่{" "}
            <strong className="font-semibold text-slate-900">
              ไม่มีการส่งชื่อ เลขประจำตัวประชาชน ที่อยู่ เบอร์โทรศัพท์ ข้อมูลผู้ปกครอง
              หรือข้อมูลทางการแพทย์ของนักเรียนไปยังผู้ให้บริการ AI
            </strong>
          </p>
          <p>
            ข้อมูลที่ถูกส่งไปมีเพียงประเภทความพิการ ระดับชั้น และระดับความสามารถ
            โดยข้อความที่ AI ร่างจะใช้คำว่า &ldquo;นักเรียน&rdquo; แทนชื่อจริง
            ชื่อจริงจะถูกใส่กลับเข้าไปในเอกสารภายในระบบของเราเท่านั้น
            ข้อจำกัดนี้บังคับไว้ในระดับโค้ด ไม่ใช่เพียงข้อตกลงในการใช้งาน
          </p>
        </Section>

        <Section title="ใครเข้าถึงข้อมูลได้">
          <p>
            ครูแต่ละคนเห็นเฉพาะนักเรียนที่ตนเองกรอกเข้ามา
            ครูคนอื่นในระบบไม่สามารถเห็นหรือแก้ไขข้อมูลของนักเรียนที่ไม่ใช่ของตนได้
            ผู้พัฒนาระบบเข้าถึงฐานข้อมูลได้ในทางเทคนิคเพื่อการดูแลระบบ
          </p>
        </Section>

        <Section title="ข้อมูลถูกเก็บที่ไหน">
          <p>
            ฐานข้อมูลให้บริการโดย Supabase ซึ่งมีเซิร์ฟเวอร์อยู่ต่างประเทศ
            การใช้งานระบบนี้จึงมีการส่งข้อมูลออกนอกราชอาณาจักร
            ก่อนนำข้อมูลนักเรียนจริงเข้าระบบ
            ควรตรวจสอบกับสถานศึกษาว่าอนุญาตให้จัดเก็บข้อมูลในระบบภายนอกได้หรือไม่
          </p>
        </Section>

        <Section title="สิทธิของท่าน">
          <p>
            ท่านสามารถขอให้ลบข้อมูลนักเรียนรายบุคคลหรือบัญชีของท่านได้
            โดยติดต่อผู้พัฒนาที่อีเมลด้านล่าง
            ระบบมีฟังก์ชันลบข้อมูลนักเรียนพร้อมแผนทั้งหมดที่เกี่ยวข้อง
          </p>
        </Section>

        <Section title="ระบบนี้ไม่ใช่เอกสารฉบับสมบูรณ์">
          <p>
            ข้อความที่ระบบร่างเป็นเพียงร่างเบื้องต้น ครูต้องตรวจสอบและยืนยันทุกครั้งก่อนนำไปใช้จริง
            ระบบไม่ส่งข้อมูลไปยังระบบของทางราชการโดยอัตโนมัติ
          </p>
        </Section>

        <Section title="ติดต่อ">
          <p>
            <a
              href="mailto:nattapat_srirung@cmu.ac.th"
              className="text-teal-700 underline hover:text-teal-800"
            >
              nattapat_srirung@cmu.ac.th
            </a>
          </p>
        </Section>
      </article>

      <footer className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 pt-4 text-xs text-slate-400">
        <a href="/" className="hover:text-slate-600">
          กลับหน้าหลัก
        </a>
        <a href="/auth/signin" className="hover:text-slate-600">
          ลงชื่อเข้าใช้
        </a>
        <a
          href="mailto:nattapat_srirung@cmu.ac.th"
          className="hover:text-slate-600"
        >
          ติดต่อผู้พัฒนา
        </a>
      </footer>
    </main>
  );
}
