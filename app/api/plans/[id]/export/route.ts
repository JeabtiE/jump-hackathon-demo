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
} from "docx";
import { prisma } from "@/lib/db";
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

/** แสดงค่าถ้ามี ไม่มีก็เว้นบรรทัดให้กรอกมือ */
function val(v?: string | null): string {
  return v?.trim() || BLANK;
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

    const doc = new Document({
      sections: [
        {
          properties: {},
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
            body(`วัน/เดือน/ปีเกิด  ${val(s.birthDate)}     ศาสนา  ${val(s.religion)}`),
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
                ])
              : [body("(ยังไม่ได้เลือกเป้าหมาย)", { indent: true })]),

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
                              cell(BLANK),
                              cell(BLANK),
                              cell(BLANK),
                              cell(personalizeForExport(m.finalReason, s.fullName)),
                              cell(BLANK),
                            ],
                          })
                      ),
                    ],
                  }),
                  body(
                    "หมายเหตุ: ช่อง รหัส / ผู้จัดหา (1.ผู้ปกครอง 2.สถานศึกษา 3.สถานพยาบาล) / วิธีการ (1.ขอรับเงินอุดหนุน 2.ขอยืม) / จำนวนเงิน — ระบบยังไม่เก็บข้อมูลนี้ กรุณากรอกด้วยมือตามระเบียบการเบิกจ่ายของศูนย์การศึกษาพิเศษ",
                    { italics: true }
                  ),
                ]
              : [body("(ยังไม่มีรายการสื่อที่อนุมัติ)", { indent: true })]),

            // ── ส่วนที่ 7: คณะกรรมการ ──
            heading("7. คณะกรรมการจัดทำแผนการจัดการศึกษาเฉพาะบุคคล"),
            ...[
              { name: BLANK, role: "ผู้บริหารสถานศึกษา/ผู้แทน" },
              { name: val(s.guardianName), role: "บิดา มารดา หรือผู้ปกครอง" },
              { name: BLANK, role: "ครูผู้รับผิดชอบ" },
              { name: BLANK, role: "ครูประจำชั้น" },
            ].flatMap((c) => [
              new Paragraph({
                spacing: { before: 260 },
                children: [new TextRun({ text: `${c.name}   ${c.role}`, size: 26, font: FONT })],
              }),
              new Paragraph({
                children: [new TextRun({ text: `ลงชื่อ ${BLANK}`, size: 24, font: FONT })],
              }),
            ]),
            body(`ประชุมวันที่ ${BLANK} เดือน ${BLANK} พ.ศ. ${BLANK}`),

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
