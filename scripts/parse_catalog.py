"""
สกัดรายการสื่อจาก "คู่มือรายการสิ่งอำนวยความสะดวก สื่อ บริการ
และความช่วยเหลืออื่นใดทางการศึกษา พ.ศ. 2568"
(สำนักบริหารงานการศึกษาพิเศษ สพฐ.)

โครงสร้างเล่ม:
  - เนื้อหาหลัก  -> รายละเอียดแต่ละรายการ: คุณสมบัติ / ผู้ที่มีสิทธิขอรับ-ขอยืม
  - ภาคผนวก 1-2 -> ตารางสรุป: ลำดับ | รหัส | รายการ | (ราคา)

วิธีรัน:  python3 scripts/parse_catalog.py pdfs/3.txt
ผลลัพธ์:  data/mediaCatalog2568.json
"""
import json
import os
import re
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SRC = sys.argv[1] if len(sys.argv) > 1 else "pdfs/3.txt"
OUT = os.path.join(ROOT, "data", "mediaCatalog2568.json")

CODE = r"[A-Z]{2}\d{4,5}"
ZW = "\u200c"  # zero-width non-joiner ที่ปนมาจาก PDF

# ── หมวดหมู่ตามรหัส (จากหน้า "คำชี้แจง" ของคู่มือ) ──────────────
CATEGORY = {
    "AV": ("ก", "อุปกรณ์ช่วยการเห็น"),
    "AH": ("ก", "อุปกรณ์ช่วยการได้ยิน"),
    "AW": ("ก", "อุปกรณ์ช่วยการเขียน"),
    "AR": ("ก", "อุปกรณ์ช่วยการอ่าน"),
    "AD": ("ก", "อุปกรณ์ช่วยการดำเนินชีวิตประจำวัน"),
    "AS": ("ก", "เครื่องช่วยการจัดท่าทางและที่นั่ง"),
    "AC": ("ก", "คอมพิวเตอร์และการใช้งานคอมพิวเตอร์"),
    "AN": ("ก", "อุปกรณ์ช่วยการสื่อสาร"),
    "AP": ("ก", "อุปกรณ์พลศึกษาและนันทนาการ"),
    "AE": ("ก", "สื่อการเรียนรู้"),
    "BH": ("ข", "อุปกรณ์ช่วยการได้ยิน"),
    "BW": ("ข", "อุปกรณ์ช่วยการเขียน"),
    "BR": ("ข", "อุปกรณ์ช่วยการอ่าน"),
    "BD": ("ข", "อุปกรณ์ช่วยการดำเนินชีวิตประจำวัน"),
    "BC": ("ข", "คอมพิวเตอร์และการใช้งานคอมพิวเตอร์"),
    "BN": ("ข", "อุปกรณ์ช่วยการสื่อสาร"),
    "BB": ("ข", "อุปกรณ์ช่วยการเคลื่อนที่"),
    "BE": ("ข", "สื่อการเรียนรู้"),
    "BM": ("ข", "วัสดุในการทำสื่อ"),
    "BP": ("ข", "อุปกรณ์พลศึกษาและนันทนาการ"),
    "CS": ("ค", "บริการ"),
}

# ── คำบ่งชี้ประเภทความพิการ -> key ที่ระบบใช้ (lib/types.ts) ─────
DISABILITY_HINTS = [
    ("บกพร่องทางการเห็น", "visual"),
    ("บกพร่องทางการได้เห็น", "visual"),   # คู่มือใช้ทั้ง "การเห็น" และ "การได้เห็น"
    ("ตาบอด", "visual"),
    ("เห็นเลือนราง", "visual"),
    ("บกพร่องทางการได้ยิน", "hearing"),
    ("หูหนวก", "hearing"),
    ("หูตึง", "hearing"),
    ("บกพร่องทางสติปัญญา", "intellectual"),
    ("บกพร่องทางร่างกาย", "physical"),
    ("การเคลื่อนไหว", "physical"),
    ("บกพร่องทางการเรียนรู้", "learning"),
    ("บกพร่องทางการพูดและภาษา", "speech"),
    ("บกพร่องทางการพูด", "speech"),
    ("บกพร่องทางภาษา", "speech"),
    ("บกพร่องทางพฤติกรรม", "behavioral"),
    ("บกพร่องทางอารมณ์", "behavioral"),
    ("บกพร่องด้านพฤติกรรม", "behavioral"),  # คู่มือใช้ทั้ง "ทาง" และ "ด้าน"
    ("บกพร่องด้านอารมณ์", "behavioral"),
    ("พฤติกรรมหรืออารมณ์", "behavioral"),
    ("ออทิสติก", "autism"),
    ("พิการซ้อน", "multiple"),
]
ALL_TYPES = ["visual", "hearing", "intellectual", "physical", "learning",
             "speech", "behavioral", "autism", "multiple"]

# วลีที่ระบุ "ทุกประเภท" อย่างชัดเจน — ชนะเสมอ แม้จะมีวลีเจาะจงอยู่ด้วย
# (เช่น "บกพร่องทางการเรียนรู้และบุคคลทุกประเภทความพิการ" = ทุกประเภทจริง)
ALL_TYPE_PHRASES = [
    "ทุกประเภทความพิการ",
    "พิการทุกประเภท",
    "ความพิการประเภทอื่น",
    "พิการประเภทอื่น",
]

# วลีร่ม: ใช้ได้ต่อเมื่อไม่มีวลีเจาะจงเลย
# เพราะส่วนใหญ่มันเป็น "คำขยาย" ของประเภทที่ระบุไว้ก่อนหน้า ไม่ใช่วลีครอบจักรวาล
#   "บุคคลที่มีความบกพร่องทางร่างกาย ที่มีความต้องการจำเป็นพิเศษ ที่ต้องใช้โต๊ะ..."  -> physical เท่านั้น
#   "บุคคลที่มีความต้องการจำเป็นพิเศษ ที่จำเป็นต้องใช้สื่อที่ต้องจัดทำขึ้นพิเศษ..."   -> ทุกประเภท
FALLBACK_ANY_PHRASES = [
    "ความต้องการจำเป็นพิเศษ",
    "ความต้องการพิเศษ",
]


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace(ZW, "")).strip()


def squash(s: str) -> str:
    """ตัดช่องว่างทั้งหมดออก

    PDF ตัดบรรทัดกลางคำ ทำให้คีย์เวิร์ดขาดเป็น "บกพร่อง ทางสติปัญญา"
    การเทียบแบบ substring ตรง ๆ จึงพลาด — ต้อง squash ทั้งสองฝั่งก่อนเทียบ
    """
    return re.sub(r"[\s‌]+", "", s)


# ── เครดิตรูปภาพ vs. footer ของหน้า ────────────────────────────
# เดิมโค้ดตัดข้อความทิ้งที่ "ที่มา :" เหมือนกับ footer แต่สองอย่างนี้ไม่เหมือนกัน:
#
#   footer ("สำนักบริหารงานการศึกษาพิเศษ") = จบหน้าจริง -> ตัดทิ้งถูกแล้ว
#   "ที่มา : <url>"                        = caption ลอยของรูป ไม่ได้จบอะไร
#
# caption ลอยไปตกก่อนเนื้อความ "ผู้ที่มีสิทธิ" ได้ เพราะ PDF จัดคอลัมน์ เช่น BE04102:
#       ผู้ที่มีสิทธิขอรับ
#           ที่มา : https://www.facebook.com/
#           บุคคลทุกประเภทความพิการ เพื่อเปิด...        share/p/16fzW8wT4u/
# ตัดที่ "ที่มา :" -> เหลือสตริงว่าง -> eligibilityText = null ทั้งที่ในเล่มมีข้อความ
# จึงต้อง "ลบเครดิตออก" ไม่ใช่ "ตัดตั้งแต่เครดิต"
FOOTER_RE = r"สำนักบริหารงานการศึกษาพิเศษ"

_CREDIT_RE = re.compile(r"ที่มา\s*:\s*\S*")
_URL_RE = re.compile(r"(?:https?://|www\.)\S*")
# เศษ URL ที่ตัดบรรทัดมาอยู่ปนกับข้อความไทย
# (เช่น "share/p/16fzW8wT4u/", "manual.pdf", "shopBrowser.php?assortme")
# จำกัดไว้เฉพาะ token ที่เป็น ASCII ล้วน ยาว >= 4 และมี / . ? อยู่ข้างใน
# ข้อความสิทธิ์ภาษาไทยไม่มี token แบบนี้ (ASCII ที่พบจริงคือ "A4" "USB" "10-12" ซึ่งไม่เข้าเกณฑ์)
# ส่วน "/" เดี่ยว ๆ จากหน่วยราคา ("บาท / เล่ม") ยาวไม่ถึงเกณฑ์
_URL_TAIL_RE = re.compile(r"(?<!\S)(?=[!-~]*[/.?])[!-~]{4,}(?!\S)")


def strip_credits(s: str) -> str:
    """ลบเครดิตรูปภาพ/URL ออก โดยไม่ตัดข้อความที่ตามมาทิ้ง"""
    s = _CREDIT_RE.sub(" ", s)
    s = _URL_RE.sub(" ", s)
    return _URL_TAIL_RE.sub(" ", s)


# ── รหัสที่ถูกตัดตัวอักษรตัวแรกหลุดไปคนละบรรทัด/คนละคอลัมน์ ──────
# ตาราง "รายการ | รหัส | ราคา" ในเนื้อหาหลักถูกสกัดมาแบบเซลล์แตก ตัวแรกของรหัส
# หลุดไปอยู่ต่างหาก ทำให้ CODE ([A-Z]{2}\d{4,5}) จับไม่ติด -> parse_details()
# หารหัสไม่เจอ -> รายการนั้นไม่มี eligibility เลย (ทั้งที่ในเล่มมีข้อความอยู่)
# ตำแหน่งของตัวที่หลุดไม่แน่นอน เจอมาแล้ว 3 แบบ:
#     บรรทัดถัดไป   "  E1802" / "B"                    (BE1802, BE1809, BN0102, BM0148)
#     บรรทัดเดียวกัน "กระดานปักหมุด 50 เม็ด B  E1859"   (BE1859)
#     บรรทัดก่อนหน้า "ขนาด 120 แกรม B" / "M0160 3"      (BM0160)
# จึงไม่ใช้กฎตามตำแหน่ง แต่เก็บ "ตัวอักษรเดี่ยว" ที่อยู่ในหน้าต่างรอบ ๆ มาเป็นตัวเลือก
# แล้วยืนยันกับรหัสจริงจากภาคผนวก (ตารางสรุป รหัสไม่แตก) — ต้องเหลือคำตอบเดียว
# เท่านั้นจึงจะซ่อม ถ้ากำกวมให้ปล่อยไว้ ห้ามเดา
#     (E1802 เติมได้ทั้ง AE1802/BE1802 — ลำพังภาคผนวกจึงตัดสินไม่ได้
#      ต้องอาศัยตัวอักษรที่อยู่ใกล้เป็นตัวเสนอ)
_ORPHAN_RE = re.compile(r"(?<![A-Za-z])([A-Z])(\d{4,5})(?!\d)")
_LONE_RE = re.compile(r"(?<!\S)([A-Z])(?!\S)")


def repair_split_codes(body: str, valid_codes) -> tuple[str, list]:
    """ต่อรหัสที่ตัวอักษรตัวแรกหลุด ให้กลับเป็นรหัสเต็มก่อนส่งให้ parse_details()"""
    lines = body.split("\n")
    fixed = []

    for i, ln in enumerate(lines):
        def sub(m):
            letter, digits = m.group(1), m.group(2)
            near = "\n".join(
                [lines[i - 1] if i else "", ln[:m.start()], lines[i + 1] if i + 1 < len(lines) else ""]
            )
            cands = {
                L + letter + digits
                for L in _LONE_RE.findall(near)
                if L + letter + digits in valid_codes
            }
            if len(cands) != 1:
                return m.group(0)
            code = cands.pop()
            fixed.append(f"{m.group(0)} -> {code} (บรรทัด {i})")
            return code

        lines[i] = _ORPHAN_RE.sub(sub, ln)

    return "\n".join(lines), fixed


def parse_disability(text: str):
    """'ผู้ที่มีสิทธิขอรับ' -> list ของ disabilityType"""
    if not text:
        return []
    t = squash(text)

    if any(squash(p) in t for p in ALL_TYPE_PHRASES):
        return ALL_TYPES[:]

    out = []
    for kw, key in DISABILITY_HINTS:
        if squash(kw) in t and key not in out:
            out.append(key)
    if out:
        return out

    if any(squash(p) in t for p in FALLBACK_ANY_PHRASES):
        return ALL_TYPES[:]
    return []


# ── ราคาท้ายชื่อรายการ ─────────────────────────────────────────
# ฉบับ 2568 มีคำกำกับการแก้ไขห้อยท้ายราคา ทำให้ regex เดิม (ที่ anchor ราคาไว้ท้ายสุด)
# จับไม่ติด ราคาเลยค้างอยู่ในชื่อ เช่น "แทนแกรมสี่เหลี่ยม 295 บาท ปรับคุณสมบัติ"
# หน่วยหลังราคาก็มีหลายรูป: "บาท/" "บาท / เรื่อง" "บาท/12 แท่ง" "บาท / 10 แผ่น"
#
# หมายเหตุ: ต้อง anchor ที่คำว่า "บาท" เสมอ ห้ามจับตัวเลขลอย ๆ ท้ายชื่อ
# เพราะชื่อจริงจำนวนมากลงท้ายด้วยตัวเลขที่เป็นสเปก ไม่ใช่ราคา
# เช่น "ขนาด 500 GB", "ดินน้ำมัน ... ขนาด 1,000 กรัม", "พู่กัน ขนาดเบอร์ 12"
_EDITORIAL_WORDS = r"ปรับคุณสมบัติ|ปรับราคา|ปรับรายการ|ปรับรหัส|เพิ่มเติม|รายการใหม่"
_EDITORIAL = rf"(?:\s*(?:{_EDITORIAL_WORDS}))*"
_UNIT = r"(?:\s*/\s*(?:[\d,]+\s*)?[^\s]*)?"
PRICE_RE = re.compile(rf"\s*([\d,]+(?:\.\d+)?\s*บาท{_UNIT}){_EDITORIAL}\s*$")

# คำกำกับการแก้ไขที่ห้อยท้าย "ชื่อรายการ" โดยไม่มีราคาตามมา
# PRICE_RE ตัดให้เฉพาะตอนที่ห้อยหลังราคา แต่รายการที่ไม่มีราคาในตารางสรุป
# (เช่น AC0505 "…ระบบปฏิบัติการไอโอเอส ปรับคุณสมบัติ") ไม่มีอะไรไปตัด คำเลยค้างในชื่อ
# รวม "/" ที่ค้างจากหน่วยราคาที่ขาดหาย (AR0105 "…(OCR) ปรับคุณสมบัติ/") ไว้ด้วย
#
# anchor ท้ายสุดเสมอ และเทียบเป็นคำเต็ม — ชื่อจริงมีคำว่า "ปรับ" อยู่กลางชื่อได้
# (เช่น "รถเข็นแบบปรับพนักพิงเอนไปด้านหลัง") ห้ามไปตัดโดน
NAME_TAIL_RE = re.compile(rf"(?:\s*(?:{_EDITORIAL_WORDS})|\s*/)+\s*$")


def parse_index(lines):
    """ตารางสรุปในภาคผนวก: ลำดับ | รหัส | รายการ | (ราคา)"""
    items = {}
    pat = re.compile(rf"^\s*\d+\s+({CODE})\s+(.+?)\s*$")
    for ln in lines:
        m = pat.match(ln.replace(ZW, ""))
        if not m:
            continue
        code, rest = m.group(1), m.group(2)
        price = None
        pm = PRICE_RE.search(rest)
        if pm:
            # ตัด "/" ห้อยท้ายที่หน่วยขาดหาย (เช่น "100 บาท/")
            price = re.sub(r"\s*/\s*$", "", clean(pm.group(1)))
            rest = rest[:pm.start()]
        name = NAME_TAIL_RE.sub("", clean(rest))
        if not name:
            continue
        prev = items.get(code)
        if prev is None or (price and not prev.get("price")):
            items[code] = {"code": code, "name": name, "price": price}
    return items


def parse_details(body):
    """จับคู่ รหัส -> คุณสมบัติ / ผู้ที่มีสิทธิ

    ใช้คำว่า 'คุณสมบัติ' เป็นหมุด แล้วมองย้อนหลังหารหัสที่อยู่ก่อนหน้า
    (บางรายการมี 1 คำอธิบายครอบหลายรหัส เช่น รุ่นภาษาไทย/ภาษาต่างประเทศ)
    """
    body = body.replace(ZW, "")
    marks = [m.start() for m in re.finditer("คุณสมบัติ", body)]
    details = {}

    for i, pos in enumerate(marks):
        prev_end = marks[i - 1] if i else 0
        before = body[max(prev_end, pos - 700):pos]
        codes = list(dict.fromkeys(re.findall(CODE, before)))
        if not codes:
            continue

        nxt = marks[i + 1] if i + 1 < len(marks) else len(body)
        after = body[pos + len("คุณสมบัติ"):nxt]

        m = re.search(r"ผู้ที่มีสิทธิ(ขอรับ|ขอยืม|รับบริการ)", after)
        if m:
            spec, rest, mode = after[:m.start()], after[m.end():], m.group(1)
        else:
            spec, rest, mode = after, "", None

        # ตัดที่ footer (จบหน้าจริง) แล้วค่อย "ลบ" เครดิตรูปภาพออก
        # ห้ามตัดทิ้งตั้งแต่ "ที่มา :" — caption ลอยมาก่อนเนื้อความได้ (ดู strip_credits)
        spec = strip_credits(re.split(FOOTER_RE, spec)[0])
        rest = strip_credits(re.split(FOOTER_RE, rest)[0])

        d = {
            "spec": clean(spec)[:600] or None,
            "eligibility": clean(rest)[:600] or None,
            "eligibilityMode": mode,
        }
        for c in codes:
            details[c] = d
    return details


def main():
    lines = open(SRC, encoding="utf-8").read().split("\n")

    # หาจุดเริ่มภาคผนวก 1 (ข้ามที่ปรากฏในสารบัญช่วงต้นเล่ม)
    appendix_at = next(
        (i for i, ln in enumerate(lines) if "ภาคผนวก 1" in ln and i > 1000),
        len(lines),
    )

    index = parse_index(lines[appendix_at:])

    # ภาคผนวกอ่านก่อน เพราะรหัสในตารางสรุปไม่แตก ใช้เป็นชุดรหัสอ้างอิงในการซ่อม
    body, repaired = repair_split_codes("\n".join(lines[:appendix_at]), set(index))
    details = parse_details(body)

    out = []
    for code, item in sorted(index.items()):
        account, category = CATEGORY.get(code[:2], ("?", "?"))
        d = details.get(code, {})
        elig = d.get("eligibility")
        out.append({
            "code": code,
            "name": item["name"],
            "account": account,
            "category": category,
            "price": item.get("price"),
            "spec": d.get("spec"),
            "eligibilityMode": d.get("eligibilityMode"),
            "eligibilityText": elig,
            "disabilityTypes": parse_disability(elig or ""),
        })

    # newline="\n" + ปิดท้ายด้วยบรรทัดใหม่ ให้ได้ไฟล์ตรงกับที่ fix_media_catalog.mjs เขียนแบบ byte ต่อ byte
    # (ถ้าปล่อยให้ Windows เขียน CRLF ตามค่าเริ่มต้น git จะเห็นว่าไฟล์เปลี่ยนทั้งไฟล์ทุกครั้งที่รันใหม่
    #  และเทียบผลของสองสคริปต์ไม่ได้)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")

    # ── สรุปคุณภาพการสกัด ──
    n = len(out)
    print(f"ซ่อมรหัสที่ตัวอักษรแรกหลุด : {len(repaired)} จุด")
    for r in repaired:
        print(f"   {r}")
    print(f"รายการทั้งหมด          : {n}")
    print(f"  มีราคา               : {sum(1 for i in out if i['price'])}")
    print(f"  มีคุณสมบัติ           : {sum(1 for i in out if i['spec'])}")
    print(f"  มีข้อความผู้มีสิทธิ    : {sum(1 for i in out if i['eligibilityText'])}")
    print(f"  แมปประเภทความพิการได้ : {sum(1 for i in out if i['disabilityTypes'])}")
    print()
    print("แยกตามบัญชี:", dict(Counter(i["account"] for i in out)))
    print("แยกตามประเภทความพิการ (1 รายการอยู่ได้หลายประเภท):")
    for k, v in Counter(t for i in out for t in i["disabilityTypes"]).most_common():
        print(f"   {k:<14} {v}")


if __name__ == "__main__":
    main()
