"""
สกัดตัวชี้วัดและสาระการเรียนรู้แกนกลาง จาก 2 ไฟล์:
  - ตัวชี้วัดกลุ่มสาระภาษาไทย (encoding เพี้ยนแบบ mac_roman -> ต้องถอดรหัส)
  - ตัวชี้วัดกลุ่มสาระคณิตศาสตร์ ฉบับปรับปรุง 2560 (encoding ปกติ)

โครงสร้างต้นฉบับ: ตาราง 2 คอลัมน์ [ชั้น + ตัวชี้วัด] | [สาระการเรียนรู้แกนกลาง]
pdftotext -layout รักษาคอลัมน์ซ้าย-ขวาไว้เป็นบรรทัดคู่ขนานได้ไม่แน่นอน
จึงอ่านจาก PyMuPDF ทีละ block ตามตำแหน่ง (bbox) แทน

วิธีรัน:  python3 parse_curriculum.py
ผลลัพธ์:  curriculum_thai.json, curriculum_math.json
"""
import json
import re
import sys

import fitz  # PyMuPDF

# ── ตารางถอดรหัสสำหรับไฟล์ที่ font เพี้ยน (thai.pdf) ──────────────
_TABLE = {}
for _b in range(128, 256):
    try:
        _TABLE[bytes([_b]).decode("mac_roman")] = bytes([_b]).decode("tis-620")
    except Exception:
        pass
_TABLE.update({"\u00e0": "\u0e48", "\u00e2": "\u0e49",
               "\u00e4": "\u0e4a", "\u00e3": "\u0e4b", "\u00e5": "\u0e4c"})


def fix_encoding(s: str) -> str:
    return "".join(_TABLE.get(c, c) for c in s)


# ── ตารางถอดรหัสสำหรับไฟล์ math.pdf (font เพี้ยนเฉพาะบางสระ/วรรณยุกต์) ──
_MATH_TABLE = {
    "\u011e": "",       # Ğ : glyph ปลอมที่ปนอยู่หน้า ำ เสมอ (สĞำนัก -> สำนัก) ตัดทิ้ง
    "\uf710": "\u0e31",  # ั  mai han akat  (ปัญหา)
    "\uf70b": "\u0e49",  # ้  mai tho        (ต้อง)
    "\u00ff": "\u0e35",  # ี  sara i         (เรียน)
    "\uf712": "\u0e47",  # ็  mai taikhu     (เป็น)
    "\uf70e": "\u0e4c",  # ์  thanthakhat    (ศาสตร์)
    "\u011d": "\u0e4c",  # ĝ  = ์ เช่นกัน (พบใน heading font อีกชุด)
    "\u0114": "\u0e48",  # Ĕ  ่  mai ek
    "\u0115": "\u0e49",  # ĕ  ้
    "\u0118": "\u0e4c",  # Ę  ์
    "\u0119": "\u0e48",  # ę  ่
    "\u011a": "\u0e49",  # Ě  ้
    "\u00e9": "\u0e35",  # é  ี
    "\u00ea": "\u0e35",  # ê  ี
    "\uf701": "\u0e34",  # ิ  sara i (short)
    "\uf702": "\u0e35",  # ี
    "\uf706": "\u0e49",  # ้
    "\uf70a": "\u0e48",  # ่
    "\uf70c": "\u0e4a",  # ๊  mai tri
    "\uf705": "\u0e48",  # ่  (พบใน "ฝ่ำย")
}


def fix_math_encoding(s: str) -> str:
    return "".join(_MATH_TABLE.get(c, c) for c in s)


THAI_NUM = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")


def thai_to_arabic(s: str) -> str:
    return s.translate(THAI_NUM)


# ป.1 - ป.6 / ม.1 - ม.6 (รวมช่วงชั้น ม.1-3, ม.4-6 ที่บางสาระเขียนรวม)
GRADE_ORDER = ["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6",
               "ม.1", "ม.2", "ม.3", "ม.4", "ม.5", "ม.6"]

# ป.1 - ป.6 / ม.1 - ม.6 (รวมช่วงชั้นแบบ ม.1-3, ม.4-6 ที่บางสาระเขียนรวม)
GRADE_PAT = re.compile(r"^(ป\.[๑-๖1-6]|ม\.[๑-๖1-6](\s*[–\-]\s*[๑-๖1-6])?)\s*$")
INDICATOR_PAT = re.compile(r"^([๑-๙0-9]{1,2})\s*\.\s*(.+)")


def next_grade(g):
    """คืนชั้นถัดไปตามลำดับมาตรฐาน หรือ None ถ้ารูปแบบไม่รู้จัก (เช่น ช่วงชั้น ม.1-3)"""
    if g in GRADE_ORDER:
        i = GRADE_ORDER.index(g)
        return GRADE_ORDER[i + 1] if i + 1 < len(GRADE_ORDER) else None
    return None


# ตัวชี้วัดข้อแรกของแต่ละชั้น เช่น "1. อ่านออกเสียง..."
FIRST_ITEM_PAT = re.compile(r"^1\s*\.\s")

# หัวกระดาษ/ท้ายกระดาษที่ซ้ำทุกหน้า -> ตัดทิ้งก่อน parse เสมอ
NOISE_PAT = re.compile(
    r"ตัวชี้วัดและสาระการเรียนรู้แกนกลาง|"
    r"ตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน|"
    r"^ชั้น\s*ตัวชี้วัด\s*สาระการเรียนรู้แกนกลาง$|"
    r"^ชั้น$|^ตัวชี้วัด$|^สาระการเรียนรู้แกนกลาง$|"
    r"^[0-9]{1,3}$"  # เลขหน้าเดี่ยวๆ
)

# ตัวคั่นหมวดหมู่ทางการ: "สาระที่ N ..." และ "มาตรฐาน ท/ค N.M ..."
# ใช้ผูกรหัสมาตรฐานเข้ากับตัวชี้วัด (เช่น ท 1.1, ค 1.1) ให้ตรงกับที่เอกสาร IEP จริงอ้างอิง
#
# หมายเหตุ: ฟอนต์หัวข้อในไฟล์ math.pdf มี bug ที่ทำให้ "า" (U+0E32) แสดงเป็น
# "ำ" (U+0E33) สลับกันในคำว่า "มาตรฐาน"/"สาระ" (เช่น "มำตรฐำน" แทน "มาตรฐาน")
# จึงต้องรับทั้งสองแบบ — ตัวเลขมาตรฐานซึ่งเป็นส่วนสำคัญไม่ได้รับผลกระทบ
STRAND_PAT = re.compile(r"ส[าำ]ระที่\s*([๐-๙0-9]+)")
STANDARD_PAT = re.compile(r"ม[าำ]ตรฐ[าำ]น\s*([ทค])\s*([๐-๙0-9]+\.[๐-๙0-9]+)")

# จุดจบของเนื้อหาตัวชี้วัดจริง — หลังจากนี้เป็นอภิธานศัพท์/ภาคผนวก/รายชื่อคณะทำงาน
# ซึ่งมีข้อความยาวเป็นย่อหน้าและมีเลขนำหน้าคล้ายตัวชี้วัด ทำให้ parser สับสนได้
END_MARKERS = ["อภิธานศัพท์", "คณะผู้จัดทำ", "บรรณานุกรม", "ภาคผนวก"]


def is_noise(line: str) -> bool:
    return bool(NOISE_PAT.search(line))


def split_heading(line: str):
    """
    ถ้าบรรทัดมีข้อความหัวข้อ (สาระที่ / มาตรฐาน) ปนอยู่ท้ายบรรทัด
    (เกิดจาก PDF ตัดบล็อกไม่ตรงจุด) ให้ตัดออก คืน (เนื้อหาที่เหลือ, รหัสมาตรฐานใหม่ถ้าเจอ)
    """
    m = STANDARD_PAT.search(line)
    if m:
        return line[:m.start()].strip(" -"), f"{m.group(1)} {thai_to_arabic(m.group(2))}"
    m = STRAND_PAT.search(line)
    if m:
        return line[:m.start()].strip(" -"), None
    return line, None


def extract_columns(pdf_path: str, fix_fn=None):
    """
    คืน list ของ dict {grade, standard, indicators: [str], strand_text: [str]}
    อ่านทีละหน้า แบ่งซ้าย/ขวาจาก bounding box กึ่งกลางหน้า
    พร้อม track รหัสมาตรฐาน (เช่น "ท 1.1") จากหัวข้อ "มาตรฐาน ท X.X" ที่คั่นอยู่
    """
    doc = fitz.open(pdf_path)
    rows = []
    current_grade = None
    current_standard = None
    buf_left, buf_right = [], []
    # เนื้อหาก่อนตารางจริง (คำนำ, "คุณภาพผู้เรียน" ภาพรวมรายช่วงชั้น ฯลฯ)
    # มีเลขมาตรฐาน/ชื่อสาระซ้ำกับตารางจริง แต่ไม่ใช่ตัวชี้วัดที่เป็นทางการ
    # -> เริ่มเก็บข้อมูลก็ต่อเมื่อเจอหัวตาราง "ชั้น/ตัวชี้วัด/สาระการเรียนรู้แกนกลาง" แล้วเท่านั้น
    table_started = False

    def flush():
        nonlocal buf_left, buf_right, current_grade
        if current_grade and (buf_left or buf_right):
            rows.append({
                "grade": current_grade,
                "standard": current_standard,
                "left_raw": buf_left[:],
                "right_raw": buf_right[:],
            })
        buf_left, buf_right = [], []

    for page in doc:
        w = page.rect.width
        blocks = page.get_text("blocks")
        blocks.sort(key=lambda b: (round(b[1], 1), b[0]))
        # ── หยุดทันทีถ้าหน้านี้เป็นส่วนอภิธานศัพท์/ภาคผนวก/คณะผู้จัดทำ ──
        page_text_raw = page.get_text()
        if fix_fn:
            page_text_raw = fix_fn(page_text_raw)
        page_text_raw = thai_to_arabic(page_text_raw)
        if table_started and any(m in page_text_raw for m in END_MARKERS):
            break
        # ใช้เช็ค page-break-rollover เฉพาะเนื้อหาชิ้นแรกสุดของหน้านี้เท่านั้น
        # (กันไม่ให้ตัวชี้วัดข้อ "1." ที่ขึ้นต้นมาตรฐานใหม่กลางหน้าโดนเข้าใจผิดว่าคือรอยตัดหน้า)
        at_page_start = True
        for b in blocks:
            x0, y0, x1, y1, text = b[0], b[1], b[2], b[3], b[4]
            text = text.strip("\n")
            if not text.strip():
                continue
            if fix_fn:
                text = fix_fn(text)
            text = thai_to_arabic(text)

            for line in text.split("\n"):
                line = line.strip()
                if not line:
                    continue

                # ── หัวข้อมาตรฐาน/สาระ: track ตลอดเวลา (ไม่ต้องรอ table_started) ──
                # เพราะหัวข้อ "มาตรฐาน ท X.X" ปรากฏก่อนหัวตาราง "ชั้น/ตัวชี้วัด/..."
                # เสมอ ถ้ารอ table_started ก่อนจะพลาดจับหัวข้อของมาตรฐานแรกสุด
                # ปลอดภัยเพราะ flush()/append จะ no-op ถ้ายังไม่มี current_grade
                std_m = STANDARD_PAT.search(line)
                if std_m:
                    kept, new_std = split_heading(line)
                    if kept and current_grade and table_started:
                        (buf_left if x0 < w * 0.5 else buf_right).append(kept)
                    flush()
                    current_standard = new_std
                    continue
                if STRAND_PAT.search(line):
                    kept, _ = split_heading(line)
                    if kept and current_grade and table_started:
                        (buf_left if x0 < w * 0.5 else buf_right).append(kept)
                    continue

                if not table_started:
                    # หัวตาราง 3 บรรทัดนี้ปรากฏเฉพาะตอนตารางตัวชี้วัดจริงเริ่มต้น
                    if line == "ตัวชี้วัด" or line == "สาระการเรียนรู้แกนกลาง":
                        table_started = True
                    continue

                gm = GRADE_PAT.match(line)
                if gm and (x0 < w * 0.35):
                    flush()
                    current_grade = line.replace(" ", "")
                    continue
                if not current_grade:
                    continue
                if is_noise(line):
                    continue

                if x0 < w * 0.5:
                    # ── กันเคสตารางตัดข้ามหน้าพอดีตรงจุดเปลี่ยนชั้น ──
                    # บางครั้ง PDF ต้นฉบับไม่แสดงป้ายชั้นใหม่ (เช่น "ป.2") ซ้ำ
                    # หลังตัดหน้า สังเกตได้จากตัวชี้วัดข้อ "1." เป็นเนื้อหา
                    # ชิ้นแรกสุดของหน้าใหม่ ทั้งที่ buffer ของชั้นเดิมมีข้อมูลอยู่แล้ว
                    # จำกัดเฉพาะ "บรรทัดแรกของหน้า" เพื่อไม่ให้ชนกับกรณีเปลี่ยน
                    # มาตรฐานใหม่กลางหน้า (ซึ่งมีการ flush() ผ่าน STANDARD_PAT อยู่แล้ว)
                    if at_page_start and FIRST_ITEM_PAT.match(line) and buf_left:
                        nxt = next_grade(current_grade)
                        if nxt:
                            flush()
                            current_grade = nxt
                    buf_left.append(line)
                else:
                    buf_right.append(line)
                at_page_start = False
    flush()
    return rows


def parse_indicators(lines):
    """รวมบรรทัดที่ตัดคำแล้วแยกเป็นข้อ ๆ ตามเลขนำหน้า '1.' '2.' ..."""
    text = " ".join(lines)
    text = re.sub(r"\s+", " ", text).strip()
    parts = re.split(r"(?=(?:^|\s)([0-9]{1,2})\.\s)", text)
    items = []
    i = 0
    matches = list(re.finditer(r"([0-9]{1,2})\.\s*", text))
    for idx, m in enumerate(matches):
        start = m.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        body = text[start:end].strip(" -")
        if body:
            items.append(body)
    return items


def grade_short(grade: str) -> str:
    """ป.1 -> ป.1 (ใช้ตามมาตรฐาน ไม่ต้องแปลง แต่กันเผื่อรูปแบบช่วงชั้น ม.1-3)"""
    return grade


def build(pdf_path, fix_fn, subject_code, subject_name):
    rows = extract_columns(pdf_path, fix_fn)
    out = []
    for r in rows:
        indicators = parse_indicators(r["left_raw"])
        strand = re.sub(r"\s+", " ", " ".join(r["right_raw"])).strip()
        if not indicators:
            continue
        std = r["standard"]  # เช่น "ท 1.1" หรือ None ถ้าไม่เจอหัวข้อก่อนหน้า
        grade = grade_short(r["grade"])
        entry_indicators = []
        for i, text in enumerate(indicators, start=1):
            code = f"{std} {grade}/{i}" if std else None
            entry_indicators.append({"code": code, "text": text})
        out.append({
            "grade": grade,
            "standard": std,
            "subject": subject_code,
            "subjectName": subject_name,
            "indicators": entry_indicators,
            "strandText": strand[:1500],
        })
    return out


def main():
    thai = build("pdfs/thai.pdf", fix_fn=fix_encoding,
                  subject_code="thai", subject_name="ภาษาไทย")
    math = build("pdfs/math.pdf", fix_fn=fix_math_encoding,
                  subject_code="math", subject_name="คณิตศาสตร์")

    json.dump(thai, open("curriculum_thai.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    json.dump(math, open("curriculum_math.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    for label, data in [("ภาษาไทย", thai), ("คณิตศาสตร์", math)]:
        n_ind = sum(len(r["indicators"]) for r in data)
        n_coded = sum(1 for r in data for i in r["indicators"] if i["code"])
        grades = sorted({r["grade"] for r in data})
        print(f"{label}: {len(data)} บล็อกชั้น/มาตรฐาน, "
              f"{n_ind} ตัวชี้วัด ({n_coded} มีรหัสมาตรฐานกำกับ), "
              f"ชั้นที่พบ = {grades}")


if __name__ == "__main__":
    main()
