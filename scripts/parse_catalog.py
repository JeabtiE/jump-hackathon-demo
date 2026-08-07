"""
สกัดรายการสื่อจาก "คู่มือรายการสิ่งอำนวยความสะดวก สื่อ บริการ
และความช่วยเหลืออื่นใดทางการศึกษา พ.ศ. 2568"
(สำนักบริหารงานการศึกษาพิเศษ สพฐ.)

โครงสร้างเล่ม:
  - เนื้อหาหลัก  -> รายละเอียดแต่ละรายการ: คุณสมบัติ / ผู้ที่มีสิทธิขอรับ-ขอยืม
  - ภาคผนวก 1-2 -> ตารางสรุป: ลำดับ | รหัส | รายการ | (ราคา)

วิธีรัน:  python3 parse_catalog.py pdfs/3.txt
ผลลัพธ์:  mediaCatalog2568.json
"""
import json
import re
import sys
from collections import Counter

SRC = sys.argv[1] if len(sys.argv) > 1 else "pdfs/3.txt"
OUT = "mediaCatalog2568.json"

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
_EDITORIAL_WORDS = r"ปรับคุณสมบัติ|ปรับราคา|ปรับรายการ|เพิ่มเติม|รายการใหม่"
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

        # ตัดเครดิตรูปภาพและ header/footer ของหน้า
        spec = re.split(r"ที่มา\s*:|สำนักบริหารงานการศึกษาพิเศษ", spec)[0]
        rest = re.split(r"ที่มา\s*:|สำนักบริหารงานการศึกษาพิเศษ", rest)[0]

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
    details = parse_details("\n".join(lines[:appendix_at]))

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

    json.dump(out, open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    # ── สรุปคุณภาพการสกัด ──
    n = len(out)
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
