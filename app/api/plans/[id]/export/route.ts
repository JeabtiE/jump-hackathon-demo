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
 *
 * ✏️ 17 ส.ค. 2569 — ส่วนที่ 5 เปลี่ยนจากตารางแบนเดียว (คอลัมน์ ที่/จุดประสงค์/เกณฑ์/
 *    ระยะเวลา/ตัวชี้วัด) เป็นตาราง merged-cell ต่อ domain:
 *      คอลัมน์ 1 (ด้าน + จุดเด่น + จุดที่ควรพัฒนา + เป้าหมายระยะยาว + วิธีประเมิน +
 *                ผู้รับผิดชอบ) → rowSpan ครอบทุกแถวเป้าหมายระยะสั้นของ domain นั้น
 *      คอลัมน์ 2-5 (ที่ / จุดประสงค์เชิงพฤติกรรม / เกณฑ์ / ระยะเวลา / ตัวชี้วัด)
 *                → 1 แถวต่อ 1 เป้าหมายระยะสั้นที่เลือกไว้
 *    docx library แทรกแถว continuation ของ rowSpan ให้เองอัตโนมัติ — ห้ามใส่ cell
 *    ว่างเติมมือในแถวถัดไปของคอลัมน์ 1 ไม่งั้นจะกลายเป็นสลับ column
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
  VerticalAlign,
} from "docx";
import { prisma } from "@/lib/db";
import { lookupIndicators } from "@/lib/curriculum-retrieval";
import { personalizeForExport } from "@/lib/pii-guard";
import { getDomainLabel } from "@/lib/ability-options";

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
 * ขนาดตัวอักษร หน่วยเป็น "ครึ่งพอยต์" (half-points) ตาม TextRun.size ของ docx
 * ⚠️ ไม่ใช่พอยต์ — 16pt ต้องเขียน 32 ถ้าเขียน 16 จะได้ 8pt (เล็กจนอ่านไม่ออก)
 */
const BODY_SIZE = 32; // 16pt — เนื้อหาทั้งหมด รวมหัวข้อและช่องในตาราง
const TITLE_SIZE = 40; // 20pt — ชื่อเอกสารทั้งฉบับเท่านั้น

/**
 * ขนาด A4 หน่วย twips — เป็น "ฐานแนวตั้ง" เสมอ
 * ⚠️ ห้ามสลับ width/height เองเมื่อจะทำหน้าแนวนอน — docx สลับให้อัตโนมัติแล้ว
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
 */
function thaiDate(iso?: string | null): string | null {
  const m = iso?.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const [, y, mm, dd] = m;
  const monthName = THAI_MONTHS[Number(mm) - 1];
  if (!monthName) return null;

  return `${Number(dd)} ${monthName} ${Number(y) + 543}`;
}

function birthDateText(iso?: string | null): string {
  return thaiDate(iso) ?? val(iso);
}

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
    children: [new TextRun({ text, bold: true, size: BODY_SIZE, font: FONT })],
  });
}

function body(text: string, opts: { indent?: boolean; italics?: boolean } = {}) {
  return new Paragraph({
    spacing: { after: 100 },
    indent: opts.indent ? { left: 400 } : undefined,
    children: [new TextRun({ text, size: BODY_SIZE, font: FONT, italics: opts.italics })],
  });
}

/** เส้นให้กรอกมือแบบสั้น — BLANK ปกติยาวเกินสำหรับช่องในตาราง */
const CELL_BLANK = "..........";

function supplyCellText(mode?: string | null): string {
  return `${CELL_BLANK} / ${mode?.trim() || CELL_BLANK}`;
}

function amountCellText(m: { price: string | null; mode: string | null }): string {
  if (m.price?.trim()) return m.price.trim();
  return m.mode === "ขอยืม" ? "— (ขอยืม)" : CELL_BLANK;
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

function cell(
  text: string,
  opts: { bold?: boolean; rowSpan?: number; width?: number } = {}
) {
  return new TableCell({
    rowSpan: opts.rowSpan,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    verticalAlign: VerticalAlign.TOP,
    children: [
      new Paragraph({
        children: [new TextRun({ text, size: BODY_SIZE, font: FONT, bold: opts.bold })],
      }),
    ],
  });
}

/**
 * คอลัมน์ 1 ของตารางส่วนที่ 5 — สรุปทั้ง domain ในเซลล์เดียว (multi-paragraph)
 * ใช้ rowSpan ครอบทุกแถวเป้าหมายระยะสั้นของ domain นี้
 */
function domainSummaryCell(
  section: {
    domainLabel: string;
    finalStrengths: string;
    finalDevelopmentAreas: string;
    finalLongTermGoal: string;
    finalEvaluationMethod: string;
    responsibleTeacherName: string | null;
  },
  rowSpan: number
) {
  const line = (label: string, text: string) =>
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({ text: `${label}: `, bold: true, size: BODY_SIZE, font: FONT }),
        new TextRun({ text, size: BODY_SIZE, font: FONT }),
      ],
    });

  return new TableCell({
    rowSpan,
    width: { size: 22, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.TOP,
    children: [
      new Paragraph({
        spacing: { after: 100 },
        children: [new TextRun({ text: section.domainLabel, bold: true, size: BODY_SIZE, font: FONT })],
      }),
      line("จุดเด่น", section.finalStrengths || CELL_BLANK),
      line("จุดที่ควรพัฒนา", section.finalDevelopmentAreas || CELL_BLANK),
      line("เป้าหมายระยะยาว 1 ปี", section.finalLongTermGoal || CELL_BLANK),
      line("วิธีประเมินผล", section.finalEvaluationMethod || CELL_BLANK),
      line("ผู้รับผิดชอบ", section.responsibleTeacherName?.trim() || CELL_BLANK),
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
        domainSections: {
          orderBy: { orderIndex: "asc" },
          include: { goals: { orderBy: { orderIndex: "asc" } } },
        },
        media: true,
      },
    });

    if (!plan) return NextResponse.json({ error: "ไม่พบแผน" }, { status: 404 });

    const s = plan.student;
    const approvedMedia = plan.media.filter((m) => m.isApproved);
    const abilityLevels = (plan.assessment.abilityLevels as Record<string, string>) ?? {};

    // เฉพาะ domain ที่มีเป้าหมายระยะสั้นถูกเลือกไว้จริงอย่างน้อย 1 ข้อ — section ที่
    // AI ร่างมาแต่ครูไม่เลือกอะไรเลยไม่ต้องขึ้นในเอกสาร (เอกสารจริงไม่มีแถวว่างเปล่า)
    const sectionsWithSelectedGoals = plan.domainSections
      .map((sec) => ({
        ...sec,
        domainLabel: getDomainLabel(s.disabilityType, sec.domain),
        selectedGoals: sec.goals.filter((g) => g.isSelected),
      }))
      .filter((sec) => sec.selectedGoals.length > 0);

    // รวมรหัสตัวชี้วัดของเป้าหมายที่เลือกไว้ทั้งหมด (ข้าม domain) ไม่ซ้ำ — ใช้ต่อท้ายตาราง
    const allSelectedIndicatorCodes = sectionsWithSelectedGoals.flatMap((sec) =>
      sec.selectedGoals.flatMap((g) => g.finalIndicatorCodes)
    );

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
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 80 },
              children: [
                new TextRun({ text: "แผนการจัดการศึกษาเฉพาะบุคคล", bold: true, size: TITLE_SIZE, font: FONT }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 60 },
              children: [
                new TextRun({ text: "(Individualized Education Program : IEP)", size: BODY_SIZE, font: FONT }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
              children: [
                new TextRun({
                  text: "ก่อนการศึกษาขั้นพื้นฐาน  ☐        ระดับการศึกษาขั้นพื้นฐาน  ☐",
                  size: BODY_SIZE,
                  font: FONT,
                }),
              ],
            }),
            body(
              `ชื่อสถานศึกษา ${val(s.schoolName)}  ระดับ ${val(s.gradeLevel)}  สังกัด ${val(s.affiliation)}`
            ),
            body(`ปีการศึกษา ${plan.academicYear}   ภาคเรียนที่ ${plan.term}`),

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

            heading("2. ข้อมูลด้านการแพทย์ หรือด้านสุขภาพ"),
            body(val(s.medicalNote)),

            heading("3. ข้อมูลด้านการศึกษา"),
            body(val(s.educationHistory)),

            heading("4. ข้อมูลอื่นๆ ที่จำเป็น"),
            body(val(plan.assessment.strengths ?? s.note)),
          ],
        },

        // ── B: แนวนอน — ส่วนที่ 5-6 (ตารางกว้าง) ──
        {
          properties: LANDSCAPE_PAGE,
          children: [
            heading("5. การกำหนดแนวทางการศึกษาและการวางแผนการจัดการศึกษาพิเศษ"),

            body("ระดับความสามารถในปัจจุบัน", { italics: true }),
            ...(Object.entries(abilityLevels).filter(([, v]) => v).length > 0
              ? Object.entries(abilityLevels)
                  .filter(([, v]) => v)
                  .map(([domain, level]) =>
                    body(`• ${getDomainLabel(s.disabilityType, domain)}: ${level}`, { indent: true })
                  )
              : [body("(ไม่ได้ระบุ)", { indent: true })]),

            new Paragraph({ spacing: { before: 200 } }),
            body("จุดเด่น จุดที่ควรพัฒนา เป้าหมายระยะยาว และจุดประสงค์เชิงพฤติกรรม (เป้าหมายระยะสั้น) แยกตามด้าน", {
              italics: true,
            }),
            // ✏️ 17 ส.ค. 2569 — ตาราง merged-cell ต่อ domain แทนตารางแบนเดียว
            ...(sectionsWithSelectedGoals.length > 0
              ? [
                  new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows: [
                      new TableRow({
                        children: [
                          cell("ด้าน / ข้อมูลภาพรวม", { bold: true, width: 22 }),
                          cell("ที่", { bold: true, width: 5 }),
                          cell("จุดประสงค์เชิงพฤติกรรม (เป้าหมายระยะสั้น)", { bold: true, width: 38 }),
                          cell("เกณฑ์การประเมิน", { bold: true, width: 15 }),
                          cell("ระยะเวลา", { bold: true, width: 10 }),
                          cell("ตัวชี้วัดที่ปรับ", { bold: true, width: 10 }),
                        ],
                      }),
                      // แต่ละ domain → แถวแรกมีคอลัมน์ 1 (rowSpan = จำนวนเป้าหมายที่เลือกใน domain นี้)
                      // แถวถัดไปของ domain เดียวกัน "ไม่ใส่คอลัมน์ 1 เลย" — docx แทรก continuation ให้เอง
                      ...sectionsWithSelectedGoals.flatMap((sec) =>
                        sec.selectedGoals.map((g, gi) =>
                          new TableRow({
                            children: [
                              ...(gi === 0 ? [domainSummaryCell(sec, sec.selectedGoals.length)] : []),
                              cell(String(gi + 1)),
                              cell(personalizeForExport(g.finalText, s.fullName)),
                              cell(g.criterion?.trim() || CELL_BLANK),
                              cell(g.timeframe?.trim() || CELL_BLANK),
                              cell(g.finalIndicatorCodes.length ? g.finalIndicatorCodes.join(", ") : "-"),
                            ],
                          })
                        )
                      ),
                    ],
                  }),
                ]
              : [body("(ยังไม่ได้เลือกเป้าหมาย)", { indent: true })]),

            ...indicatorReferenceBlock(allSelectedIndicatorCodes),

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
            heading("7. คณะกรรมการจัดทำแผนการจัดการศึกษาเฉพาะบุคคล"),
            ...[
              { name: val(plan.principalName), role: "ผู้บริหารสถานศึกษา/ผู้แทน" },
              { name: val(s.guardianName), role: "บิดา มารดา หรือผู้ปกครอง" },
              { name: val(plan.responsibleTeacherName), role: "ครูผู้รับผิดชอบ" },
              { name: val(plan.homeroomTeacherName), role: "ครูประจำชั้น" },
            ].flatMap((c) => [
              new Paragraph({
                spacing: { before: 260 },
                children: [new TextRun({ text: `${c.name}   ${c.role}`, size: BODY_SIZE, font: FONT })],
              }),
              new Paragraph({
                children: [new TextRun({ text: `ลงชื่อ ${BLANK}`, size: BODY_SIZE, font: FONT })],
              }),
            ]),
            body(thaiMeetingDateLine(plan.meetingDate)),

            heading("8. ความเห็นของบิดา มารดา หรือผู้ปกครอง"),
            body(
              "การจัดทำแผนการจัดการศึกษาเฉพาะบุคคลฉบับนี้ ข้าพเจ้า  ☐ เห็นด้วย   ☐ ไม่เห็นด้วย เหตุผล ..............................."
            ),
            new Paragraph({ spacing: { before: 260 } }),
            body(`ลงชื่อ ${BLANK}`),
            body(`(${val(s.guardianName)})  บิดา / มารดา / ผู้ปกครอง`),
            body(`วันที่ ${BLANK} เดือน ${BLANK} พ.ศ. ${BLANK}`),

            new Paragraph({
              spacing: { before: 500 },
              children: [
                new TextRun({
                  text: "เอกสารนี้จัดทำโดยระบบ IEP GEN เพื่อช่วยร่างเนื้อหา ครูผู้สอนได้ตรวจสอบและรับรองความถูกต้องแล้ว",
                  size: BODY_SIZE,
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