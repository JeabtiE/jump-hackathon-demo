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
    ("บกพร่องทางภาษา", "speech"),
    ("บกพร่องทางพฤติกรรม", "behavioral"),
    ("บกพร่องทางอารมณ์", "behavioral"),
    ("ออทิสติก", "autism"),
    ("พิการซ้อน", "multiple"),
]
ALL_TYPES = ["visual", "hearing", "intellectual", "physical", "learning",
             "speech", "behavioral", "autism", "multiple"]


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", s.replace(ZW, "")).strip()


def parse_disability(text: str):
    """'ผู้ที่มีสิทธิขอรับ' -> list ของ disabilityType"""
    if not text:
        return []
    if "ทุกประเภทความพิการ" in text or "พิการทุกประเภท" in text:
        return ALL_TYPES[:]
    out = []
    for kw, key in DISABILITY_HINTS:
        if kw in text and key not in out:
            out.append(key)
    return out


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
        pm = re.search(r"([\d,]+(?:\.\d+)?)\s*บาท(?:\s*/\s*\S+)?\s*$", rest)
        if pm:
            price = clean(pm.group(0))
            rest = rest[:pm.start()]
        name = clean(rest)
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
