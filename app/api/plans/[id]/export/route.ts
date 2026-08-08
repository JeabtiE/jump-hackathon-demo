/**
 * /api/plans/[id]/export — คน A ดูแล
 *
 * Export แผน IEP เป็นไฟล์ .docx ที่กรอกข้อมูลครบทุกส่วน พร้อมพิมพ์และเซ็นได้เลย
 *
 * ✅ โครงสร้างหัวข้อ/เลขส่วน อ้างอิงจากแบบฟอร์มจริงของโรงเรียนบ้านสันโค้ง
 *    (เชียงรายจรูญราษฎร์) สพป.ชร.เขต1 ยืนยันจากตัวอย่างแผน IEP จริง 4 ฉบับ (24 ก.ค.)
 *
 * 🔒 จุดนี้คือที่เดียวในระบบที่ PII ถูกนำมาใช้
 *    - ส่วนที่ 1-4 เติมจากข้อมูลใน DB
 *    - ข้อความเป้าหมายที่ AI เขียนว่า "นักเรียน" ถูกแทนที่ด้วยชื่อจริงตรงนี้
 *    LLM ไม่เคยเห็นชื่อเด็กเลยตลอดกระบวนการ
 */

import { NextResponse } from "next/server";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  PageOrientation,
} from "docx";
import { prisma } from "@/lib/db";
import { lookupIndicators } from "@/lib/curriculum-retrieval";
import { personalizeForExport } from "@/lib/pii-guard";

const DISABILITY_LABEL: Record<string, string> = {
  visual: "บกพร่องทางการเห็น",
  hearing: "บกพร่องทางการได้ยิน",
  intellectual: "บกพร่องทางสติปัญญา",
  physical: "บกพร่องทางร่างกาย การเคลื่อนไหว หรือสุขภาพ",
  learning: "บกพร่องทางการเรียนรู้ (LD)",
  speech: "บกพร่องทางการพูดและภาษา",
  behavioral: "บกพร่องทางพฤติกรรมหรืออารมณ์",
  autism: "ออทิสติก",
  multiple: "พิการซ้อน",
};

const FONT = "TH Sarabun New";
const BLANK = "..............................";

/**
 * ขนาด A4 หน่วย twips — เป็น "ฐานแนวตั้ง" เสมอ
 *
 * ⚠️ ห้ามสลับ width/height เองเมื่อจะทำหน้าแนวนอน
 *    PageSize ของ docx สลับให้อัตโนมัติแล้วเมื่อ orientation = LANDSCAPE
 *    (node_modules/docx/build/index.mjs → `const flip = orientation === LANDSCAPE`)
 *    ถ้าสลับเองด้วยจะกลายเป็นสลับสองรอบ = ได้ขนาดแนวตั้งกลับมา
 *    แต่ติดแท็ก orient="landscape" ไว้ → Word/LibreOffice เรนเดอร์ผิดแบบเงียบๆ
 */
const A4 = { width: 11906, height: 16838 };
const PORTRAIT_PAGE = { page: { size: { ...A4, orientation: PageOrientation.PORTRAIT } } };
const LANDSCAPE_PAGE = { page: { size: { ...A4, orientation: PageOrientation.LANDSCAPE } } };

/** แสดงค่าถ้ามี ไม่มีก็เว้นบรรทัดให้กรอกมือ */
function val(v?: string | null): string {
  return v?.trim() || BLANK;
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/**
 * ตัวแปลงกลาง: "2018-10-05" → "5 ตุลาคม 2561" (พ.ศ.)
 * แยกสตริงตรงๆ ไม่ผ่าน new Date() เพราะ Date จะตีความเป็น UTC แล้ววันเพี้ยนใน +07:00
 * parse ไม่ได้ → คืน null ให้ผู้เรียกตัดสินใจ fallback เอง
 */
function thaiDate(iso?: string | null): string | null {
  const m = iso?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const [, y, mm, dd] = m;
  const monthName = THAI_MONTHS[Number(mm) - 1];
  if (!monthName) return null;

  return `${Number(dd)} ${monthName} ${Number(y) + 543}`;
}

/**
 * วันเกิดในส่วนที่ 1: แปลงเป็นไทยถ้าเป็นรูปแบบ ISO จาก date picker
 * parse ไม่ได้ → พิมพ์ค่าเดิมออกไป (นักเรียนเก่าเก็บเป็นข้อความอิสระ เช่น "5 ต.ค. 2561"
 * ข้อมูลของครูต้องไม่หาย — ห้าม fallback เป็น BLANK)
 */
function birthDateText(iso?: string | null): string {
  return thaiDate(iso) ?? val(iso);
}

/**
 * "2026-07-27" → "ประชุมวันที่ 27 เดือน กรกฎาคม พ.ศ. 2569"
 * ไม่มีค่า/รูปแบบไม่ถูกต้อง → คืนบรรทัดเว้นว่างให้ครูกรอกมือเหมือนเดิม
 */
function thaiMeetingDateLine(iso?: string | null): string {
  const converted = thaiDate(iso);
  if (!converted) return `ประชุมวันที่ ${BLANK} เดือน ${BLANK} พ.ศ. ${BLANK}`;

  const [dd, monthName, yearBE] = converted.split(" ");
  return `ประชุมวันที่ ${dd} เดือน ${monthName} พ.ศ. ${yearBE}`;
}

function heading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, size: 32, font: FONT })],
  });
}

function body(text: string, opts: { indent?: boolean; italics?: boolean } = {}) {
  return new Paragraph({
    spacing: { after: 100 },
    indent: opts.indent ? { left: 400 } : undefined,
    children: [new TextRun({ text, size: 28, font: FONT, italics: opts.italics })],
  });
}

/** เส้นให้กรอกมือแบบสั้น — BLANK ปกติยาวเกินสำหรับช่องในตาราง */
const CELL_BLANK = "..........";

/**
 * ช่อง "ผู้จัดหา / วิธีการ" ของส่วนที่ 6
 * - วิธีการ: เติมจากคู่มือ 2568 (ขอรับ / ขอยืม / รับบริการ)
 * - ผู้จัดหา: ระบบไม่เก็บ (ผู้ปกครอง / สถานศึกษา / สถานพยาบาล) → เว้นให้ครูกรอก
 */
function supplyCellText(mode?: string | null): string {
  return `${CELL_BLANK} / ${mode?.trim() || CELL_BLANK}`;
}

/**
 * ช่อง "จำนวนเงินที่ขออุดหนุน" — ราคาตามคู่มือ
 * บัญชี ก เป็นการขอยืมครุภัณฑ์ ไม่มีราคาและไม่ขอเงินอุดหนุน → ระบุให้ชัดแทนเว้นว่าง
 * เพื่อไม่ให้ดูเหมือนระบบลืมกรอก
 */
function amountCellText(m: { price: string | null; mode: string | null }): string {
  if (m.price?.trim()) return m.price.trim();
  return m.mode === "ขอยืม" ? "— (ขอยืม)" : CELL_BLANK;
}

/**
 * บรรทัด "ปรับจากตัวชี้วัด" ใต้เป้าหมาย — คืน [] ถ้าไม่มีรหัส
 * เป้าหมายด้านทักษะ (สื่อสาร/ช่วยเหลือตนเอง) ไม่อ้างตัวชี้วัดโดยปกติ
 * และแผนที่สร้างก่อนมีฟีเจอร์นี้ก็ไม่มี → ต้องไม่มีบรรทัดว่างโผล่ในเอกสาร
 */
function indicatorLine(codes: string[]) {
  if (!codes.length) return [];
  return [body(`     ปรับจากตัวชี้วัด: ${codes.join(", ")}`, { indent: true })];
}

/**
 * บล็อกกางข้อความตัวชี้วัดท้ายส่วนที่ 5
 * ครูการศึกษาพิเศษรู้รหัสอยู่แล้ว แต่พี่เลี้ยงเด็กพิการ (วุฒิ ม.6) ไม่รู้ว่า
 * "ท 1.1 ป.1/1" คืออะไร — CLAUDE.md §3 ให้ออกแบบเพื่อพี่เลี้ยง ไม่ใช่เพื่อผู้เชี่ยวชาญ
 */
function indicatorReferenceBlock(codes: string[]) {
  const entries = lookupIndicators(codes);
  if (entries.length === 0) return [];

  return [
    new Paragraph({ spacing: { before: 200 } }),
    body("ตัวชี้วัดที่อ้างถึงในแผนนี้ (หลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พ.ศ. 2551)", {
      italics: true,
    }),
    ...entries.map((e) => body(`${e.code}  ${e.text}`, { indent: true })),
  ];
}

function cell(text: string, opts: { bold?: boolean } = {}) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, size: 22, font: FONT, bold: opts.bold })],
      }),
    ],
  });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const plan = await prisma.plan.findUnique({
      where: { id: params.id },
      include: {
        student: true,
        assessment: true,
        goals: { orderBy: { orderIndex: "asc" } },
        media: true,
      },
    });

    if (!plan) return NextResponse.json({ error: "ไม่พบแผน" }, { status: 404 });

    const s = plan.student;
    const selectedGoals = plan.goals.filter((g) => g.isSelected);
    const approvedMedia = plan.media.filter((m) => m.isApproved);
    const abilityLevels = (plan.assessment.abilityLevels as Record<string, string>) ?? {};

    /**
     * เอกสารจริงแบ่งเป็น 3 ส่วนที่วางหน้ากระดาษต่างกัน
     * (ยืนยันจาก sectPr ในไฟล์ .docx ของแผนจริง)
     *   A แนวตั้ง  — หัวเอกสาร + ส่วนที่ 1-4
     *   B แนวนอน  — ส่วนที่ 5-6 สองตารางที่กว้างที่สุดในเอกสาร
     *   C แนวตั้ง  — ส่วนที่ 7-8 ลายเซ็นกรรมการและความเห็นผู้ปกครอง
     */
    const doc = new Document({
      sections: [
        // ── A: แนวตั้ง — หัวเอกสาร + ส่วนที่ 1-4 ──
        {
          properties: PORTRAIT_PAGE,
          children: [
            // ── หัวเอกสาร ──
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 80 },
              children: [
                new TextRun({ text: "แผนการจัดการศึกษาเฉพาะบุคคล", bold: true, size: 40, font: FONT }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 60 },
              children: [
                new TextRun({ text: "(Individualized Education Program : IEP)", size: 28, font: FONT }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
              children: [
                new TextRun({
                  text: "ก่อนการศึกษาขั้นพื้นฐาน  ☐        ระดับการศึกษาขั้นพื้นฐาน  ☐",
                  size: 24,
                  font: FONT,
                }),
              ],
            }),
            body(
              `ชื่อสถานศึกษา ${val(s.schoolName)}  ระดับ ${val(s.gradeLevel)}  สังกัด ${val(s.affiliation)}`
            ),
            body(`ปีการศึกษา ${plan.academicYear}   ภาคเรียนที่ ${plan.term}`),

            // ── ส่วนที่ 1: ข้อมูลทั่วไป ──
            heading("1. ข้อมูลทั่วไป"),
            body(`ชื่อ-ชื่อสกุล  ${val(s.fullName)}`),
            body(`เลขประจำตัวประชาชน  ${val(s.nationalId)}`),
            body(`ทะเบียนคนพิการเลขที่  ${val(s.disabilityCardNo)}`),
            body(`วัน/เดือน/ปีเกิด  ${birthDateText(s.birthDate)}     ศาสนา  ${val(s.religion)}`),
            body(
              `ประเภทความพิการ  ${DISABILITY_LABEL[s.disabilityType] ?? s.disabilityType}   ลักษณะ  ${val(s.disabilityDetail)}`
            ),
            body(`ชื่อ-ชื่อสกุลบิดา  ${val(s.fatherName)}`),
            body(`ชื่อ-ชื่อสกุลมารดา  ${val(s.motherName)}`),
            body(
              `ชื่อ-ชื่อสกุลผู้ปกครอง  ${val(s.guardianName)}   เกี่ยวข้องเป็น  ${val(s.guardianRelation)}`
            ),
            body(`ที่อยู่ผู้ปกครองที่ติดต่อได้  ${val(s.address)}`),
            body(`โทรศัพท์  ${val(s.phone)}`),

            // ── ส่วนที่ 2: ข้อมูลด้านการแพทย์ ──
            heading("2. ข้อมูลด้านการแพทย์ หรือด้านสุขภาพ"),
            body(val(s.medicalNote)),

            // ── ส่วนที่ 3: ข้อมูลด้านการศึกษา ──
            heading("3. ข้อมูลด้านการศึกษา"),
            body(val(s.educationHistory)),

            // ── ส่วนที่ 4: ข้อมูลอื่นๆ ──
            heading("4. ข้อมูลอื่นๆ ที่จำเป็น"),
            body(val(plan.assessment.strengths ?? s.note)),
          ],
        },

        // ── B: แนวนอน — ส่วนที่ 5-6 (ตารางกว้าง) ──
        {
          properties: LANDSCAPE_PAGE,
          children: [
            // ── ส่วนที่ 5: แนวทางการศึกษาและการวางแผน ──
            heading("5. การกำหนดแนวทางการศึกษาและการวางแผนการจัดการศึกษาพิเศษ"),

            body("ระดับความสามารถในปัจจุบัน", { italics: true }),
            ...(Object.entries(abilityLevels).filter(([, v]) => v).length > 0
              ? Object.entries(abilityLevels)
                  .filter(([, v]) => v)
                  .map(([domain, level]) => body(`• ${domain}: ${level}`, { indent: true }))
              : [body("(ไม่ได้ระบุ)", { indent: true })]),

            new Paragraph({ spacing: { before: 200 } }),
            body("เป้าหมายระยะยาว 1 ปี และจุดประสงค์เชิงพฤติกรรม (เป้าหมายระยะสั้น)", {
              italics: true,
            }),
            ...(selectedGoals.length > 0
              ? selectedGoals.flatMap((g, i) => [
                  // 🔒 แทนที่คำว่า "นักเรียน" ด้วยชื่อจริง — ทำฝั่งเราหลัง LLM คืนผลแล้ว
                  body(`${i + 1}. ${personalizeForExport(g.finalText, s.fullName)}`, {
                    indent: true,
                  }),
                  body(
                    `     เกณฑ์การประเมิน: ${g.criterion ?? "-"}   ระยะเวลา: ${g.timeframe ?? "-"}`,
                    { indent: true }
                  ),
                  ...indicatorLine(g.finalIndicatorCodes),
                ])
              : [body("(ยังไม่ได้เลือกเป้าหมาย)", { indent: true })]),

            // กางข้อความตัวชี้วัดของเป้าหมายที่เลือกไว้ทั้งหมด (ไม่ซ้ำ)
            ...indicatorReferenceBlock(selectedGoals.flatMap((g) => g.finalIndicatorCodes)),

            // ── ส่วนที่ 6: สิ่งอำนวยความสะดวก ──
            heading(
              "6. ความต้องการสิ่งอำนวยความสะดวก เทคโนโลยีสิ่งอำนวยความสะดวก สื่อ บริการ และความช่วยเหลืออื่นใดทางการศึกษา"
            ),
            ...(approvedMedia.length > 0
              ? [
                  new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [
                      new TableRow({
                        children: [
                          cell("ที่", { bold: true }),
                          cell("รายการ", { bold: true }),
                          cell("รหัส", { bold: true }),
                          cell("ผู้จัดหา / วิธีการ", { bold: true }),
                          cell("จำนวนเงินที่ขออุดหนุน", { bold: true }),
                          cell("เหตุผลและความจำเป็น", { bold: true }),
                          cell("ผู้ประเมิน", { bold: true }),
                        ],
                      }),
                      ...approvedMedia.map(
                        (m, i) =>
                          new TableRow({
                            children: [
                              cell(String(i + 1)),
                              cell(`${m.item}  (บัญชี ${m.category})`),
                              cell(m.code?.trim() || CELL_BLANK),
                              cell(supplyCellText(m.mode)),
                              cell(amountCellText(m)),
                              cell(personalizeForExport(m.finalReason, s.fullName)),
                              cell(CELL_BLANK),
                            ],
                          })
                      ),
                    ],
                  }),
                  body(
                    "หมายเหตุ: ช่อง รหัส / วิธีการ / จำนวนเงิน เติมจากคู่มือรายการสิ่งอำนวยความสะดวก สื่อ บริการฯ พ.ศ. 2568 (สำนักบริหารงานการศึกษาพิเศษ สพฐ.) — กรุณาตรวจสอบกับประกาศฉบับล่าสุดก่อนยื่นเบิก ส่วนช่อง ผู้จัดหา (1.ผู้ปกครอง 2.สถานศึกษา 3.สถานพยาบาล) และ ผู้ประเมิน ระบบยังไม่เก็บข้อมูลนี้ กรุณากรอกด้วยมือ",
                    { italics: true }
                  ),
                ]
              : [body("(ยังไม่มีรายการสื่อที่อนุมัติ)", { indent: true })]),
          ],
        },

        // ── C: แนวตั้ง — ส่วนที่ 7-8 (ลายเซ็น) ──
        {
          properties: PORTRAIT_PAGE,
          children: [
            // ── ส่วนที่ 7: คณะกรรมการ ──
            heading("7. คณะกรรมการจัดทำแผนการจัดการศึกษาเฉพาะบุคคล"),
            ...[
              { name: val(plan.principalName), role: "ผู้บริหารสถานศึกษา/ผู้แทน" },
              { name: val(s.guardianName), role: "บิดา มารดา หรือผู้ปกครอง" },
              { name: val(plan.responsibleTeacherName), role: "ครูผู้รับผิดชอบ" },
              { name: val(plan.homeroomTeacherName), role: "ครูประจำชั้น" },
            ].flatMap((c) => [
              new Paragraph({
                spacing: { before: 260 },
                children: [new TextRun({ text: `${c.name}   ${c.role}`, size: 26, font: FONT })],
              }),
              new Paragraph({
                children: [new TextRun({ text: `ลงชื่อ ${BLANK}`, size: 24, font: FONT })],
              }),
            ]),
            body(thaiMeetingDateLine(plan.meetingDate)),

            // ── ส่วนที่ 8: ความเห็นผู้ปกครอง ──
            heading("8. ความเห็นของบิดา มารดา หรือผู้ปกครอง"),
            body(
              "การจัดทำแผนการจัดการศึกษาเฉพาะบุคคลฉบับนี้ ข้าพเจ้า  ☐ เห็นด้วย   ☐ ไม่เห็นด้วย เหตุผล ..............................."
            ),
            new Paragraph({ spacing: { before: 260 } }),
            body(`ลงชื่อ ${BLANK}`),
            body(`(${val(s.guardianName)})  บิดา / มารดา / ผู้ปกครอง`),
            body(`วันที่ ${BLANK} เดือน ${BLANK} พ.ศ. ${BLANK}`),

            // ── หมายเหตุท้ายเอกสาร ──
            new Paragraph({
              spacing: { before: 500 },
              children: [
                new TextRun({
                  text: "เอกสารนี้จัดทำโดยระบบ IEP GEN เพื่อช่วยร่างเนื้อหา ครูผู้สอนได้ตรวจสอบและรับรองความถูกต้องแล้ว",
                  size: 22,
                  italics: true,
                  font: FONT,
                }),
              ],
            }),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `IEP_${s.code}_${plan.academicYear}_เทอม${plan.term}.docx`;

    // แปลงเป็น Uint8Array เพราะ Buffer ของ @types/node 20.19+ ไม่ตรงกับ BodyInit แล้ว
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (err) {
    console.error("GET /api/plans/[id]/export failed:", err);
    return NextResponse.json({ error: "สร้างไฟล์เอกสารไม่สำเร็จ" }, { status: 500 });
  }
}
