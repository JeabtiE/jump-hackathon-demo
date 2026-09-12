/**
 * scripts/backfill-owner.ts — ยกข้อมูลเก่าทั้งหมดให้มีเจ้าของ (Phase 2 · ครั้งเดียวจบ)
 *
 * ก่อนมี auth ทุกแถวใน Student ไม่มี userId — สคริปต์นี้ยกให้ครูเจ้าของระบบคนแรก
 * เพื่อให้เปลี่ยน Student.userId จาก String? เป็น String (required) ได้โดยไม่พัง
 *
 * 🔒 กฎการ log ของไฟล์นี้: พิมพ์ได้แค่ "จำนวนแถว" กับ userId (cuid)
 *    ห้ามพิมพ์ชื่อนักเรียน รหัสนักเรียน หรือ PII ใดๆ และไม่พิมพ์อีเมลเจ้าของด้วย
 *    (อีเมลก็เป็นข้อมูลส่วนบุคคล — terminal log ไปโผล่ใน CI/screenshot ได้)
 *
 * ♻️ idempotent — รันซ้ำได้ไม่จำกัด รอบสองจะแก้ 0 แถว (upsert + where userId: null)
 *
 * ⚠️ ไม่แตะ lib/pii-guard.ts และไม่ import อะไรจาก lib/ เลย — สคริปต์นี้ยืนคนเดียวได้
 */

import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * ตัวกรอง "นักเรียนที่ยังไม่มีเจ้าของ"
 *
 * ⚠️ ต้อง cast เพราะหลัง migrate เสร็จ Student.userId เป็น NOT NULL แล้ว →
 *    Prisma Client รุ่นใหม่ไม่ยอมให้ filter ด้วย null อีก (type error) แต่ไฟล์นี้
 *    ยังต้องคอมไพล์ผ่าน เพราะ tsconfig กวาด scripts/*.ts เข้า npm run build ด้วย
 *
 * ตอน runtime คิวรีนี้จะ match 0 แถวเสมอหลัง migrate ซึ่งถูกต้องแล้ว —
 * สคริปต์กลายเป็น no-op ที่รันซ้ำได้ปลอดภัย ไม่ใช่พฤติกรรมที่ผิด
 */
const ORPHAN_FILTER = { userId: null } as unknown as Prisma.StudentWhereInput;

async function main(): Promise<void> {
  const email = (process.env.BACKFILL_OWNER_EMAIL ?? "").trim().toLowerCase();

  if (!email) {
    console.error("❌ ไม่ได้ตั้ง BACKFILL_OWNER_EMAIL");
    console.error("   ตัวอย่าง: BACKFILL_OWNER_EMAIL=teacher@example.com node --env-file=.env scripts/backfill-owner.ts");
    process.exit(1);
  }

  // เช็คหยาบๆ พอกันพิมพ์ผิดแบบเห็นชัด — ไม่ต้อง regex เป๊ะ และห้าม echo ค่ากลับออกมา
  if (!email.includes("@") || email.startsWith("@") || email.endsWith("@")) {
    console.error("❌ BACKFILL_OWNER_EMAIL ไม่ใช่รูปแบบอีเมล");
    process.exit(1);
  }

  // ── 1. User เจ้าของข้อมูล ──
  // update: {} โดยตั้งใจ — รันซ้ำต้องไม่ไปเขียนทับ name/image ที่ได้มาตอน login จริง
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email },
  });
  console.log(`✅ User พร้อมแล้ว (userId: ${user.id})`);

  // ── 2. ใส่ allowlist ด้วย ไม่งั้นสร้าง User ไว้แต่ login ไม่ผ่าน ──
  await prisma.allowedEmail.upsert({
    where: { email },
    update: {},
    create: { email, note: "เจ้าของข้อมูลเดิมก่อนมีระบบ auth (backfill)" },
  });
  console.log("✅ AllowedEmail พร้อมแล้ว");

  // ── 3. ยกนักเรียนที่ยังไม่มีเจ้าของ ──
  // ⚠️ where: { userId: null } เท่านั้น — ห้ามใช้ updateMany แบบไม่มี where
  //    ไม่งั้นรันรอบสองจะแย่งนักเรียนของครูคนอื่นมาเป็นของเจ้าของคนแรก
  const before = await prisma.student.count({ where: ORPHAN_FILTER });
  const { count } = await prisma.student.updateMany({
    where: ORPHAN_FILTER,
    data: { userId: user.id },
  });

  // ── 4. ยืนยันว่าเหลือ 0 จริง ก่อนจะไปเปลี่ยนเป็น required ──
  const stillOrphan = await prisma.student.count({ where: ORPHAN_FILTER });
  const total = await prisma.student.count();

  console.log("──────────────────────────────");
  console.log(`นักเรียนทั้งหมด        : ${total} แถว`);
  console.log(`ไม่มีเจ้าของก่อนรัน    : ${before} แถว`);
  console.log(`ยกเจ้าของสำเร็จ        : ${count} แถว`);
  console.log(`ยังไม่มีเจ้าของหลังรัน : ${stillOrphan} แถว`);
  console.log("──────────────────────────────");

  if (stillOrphan > 0) {
    console.error("❌ ยังมีนักเรียนที่ไม่มีเจ้าของ — ห้ามเปลี่ยน userId เป็น required");
    process.exit(1);
  }

  if (count === 0 && before === 0) {
    console.log("ℹ️  ไม่มีอะไรต้องแก้ (เคยรันไปแล้ว หรือยังไม่มีข้อมูลนักเรียน)");
  }

  console.log("✅ พร้อมเปลี่ยน Student.userId เป็น required แล้ว — ดู MIGRATION-NOTES.md ขั้นตอนที่ 3");
}

main()
  .catch((err) => {
    // ⚠️ err ของ Prisma อาจมีค่าที่ทำให้ query พังติดมาด้วย — พิมพ์แค่ message ไม่พิมพ์ทั้งก้อน
    console.error("❌ backfill ล้มเหลว:", (err as Error).message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/*
═══════════════════════════════════════════════════════════════
 สถานะ: ขั้นที่ 1–3 ทำเสร็จแล้ว เหลือขั้นที่ 4
 ลำดับเต็ม + เหตุผลแต่ละขั้น อยู่ใน MIGRATION-NOTES.md
═══════════════════════════════════════════════════════════════

 0) ✅ สำรอง DB (Supabase → Database → Backups)

 1) ✅ สร้างตาราง auth + คอลัมน์ userId แบบ optional
       npm run db:push

 2) ✅ ยกข้อมูลเก่าให้มีเจ้าของ
       BACKFILL_OWNER_EMAIL=you@example.com node --env-file=.env scripts/backfill-owner.ts
       → ต้องได้ "ยังไม่มีเจ้าของหลังรัน : 0 แถว" เท่านั้น

 3) ✅ แก้ prisma/schema.prisma แล้ว — userId เป็น required
       และ code เปลี่ยนจาก @unique ทั้ง DB เป็น @@unique([userId, code])

 4) ⬅️ เหลือขั้นนี้: บังคับลง DB จริง (ปิด dev server + Prisma Studio ก่อน)
       npm run db:push

 5) เช็คว่า client ใหม่ยังคอมไพล์ผ่าน
       npm run build

 ℹ️ หลังขั้นที่ 4 สคริปต์นี้กลายเป็น no-op (userId เป็น NOT NULL แล้ว ไม่มีแถวไร้เจ้าของ
    ให้ยกอีก) เก็บไว้เป็นหลักฐานว่า migrate มายังไง และไว้ใช้กับ DB ชุดใหม่ในอนาคต
*/
