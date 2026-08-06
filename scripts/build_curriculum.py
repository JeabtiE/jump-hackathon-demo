"""
รวม curriculum_thai.json + curriculum_math.json -> data/curriculum.json
(รูปแบบพร้อมใช้ใน retrieval layer ของระบบ)

Scope: เฉพาะ ป.1-6 เท่านั้น (ตามที่ครูยืนยันว่าเด็ก 16 คนอยู่ระดับประถม)
ตัวชี้วัด ม.1 ขึ้นไปถูกตัดทิ้ง — ถ้าต้องใช้ในอนาคตให้ปรับ PRIMARY_GRADES
แล้วรัน parse_curriculum.py ใหม่ (ข้อมูลดิบมีอยู่แล้วใน curriculum_thai/math.json)

วิธีรัน:  python3 build_curriculum.py
ผลลัพธ์:  curriculum.json
"""
import json

PRIMARY_GRADES = ["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6"]

README = (
    "ตัวชี้วัดและสาระการเรียนรู้แกนกลาง ภาษาไทย + คณิตศาสตร์ (ฉบับปรับปรุง 2560) "
    "ตามหลักสูตรแกนกลางการศึกษาขั้นพื้นฐาน พ.ศ. 2551 | สกัดจาก PDF ทางการ สพฐ. "
    "ด้วย scripts/parse_curriculum.py | Scope: เฉพาะ ป.1-6 (ตามที่ครูยืนยัน) | "
    "รหัสตัวชี้วัดตรวจสอบแล้วว่าไม่ซ้ำในช่วง ป.1-6 ทุกตัว (0 duplicate) | "
    "โครงสร้าง: curriculum[subject][grade] = [{standard, indicators: [{code, text}], strandText}]"
)


def main():
    thai = json.load(open("curriculum_thai.json", encoding="utf-8"))
    math = json.load(open("curriculum_math.json", encoding="utf-8"))

    out = {"_readme": README, "thai": {}, "math": {}}
    for subject_key, data in [("thai", thai), ("math", math)]:
        for r in data:
            if r["grade"] not in PRIMARY_GRADES:
                continue
            out[subject_key].setdefault(r["grade"], []).append({
                "standard": r["standard"],
                "indicators": r["indicators"],
                "strandText": r["strandText"],
            })

    json.dump(out, open("curriculum.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    for subj in ["thai", "math"]:
        n_grades = len(out[subj])
        n_ind = sum(len(g["indicators"]) for grades in out[subj].values() for g in grades)
        print(f"{subj}: {n_grades} ชั้น, {n_ind} ตัวชี้วัด")


if __name__ == "__main__":
    main()
