# IEP GEN

ผู้ช่วย AI สำหรับครูการศึกษาพิเศษ — กรอกข้อมูลนักเรียนครั้งเดียว ได้เป้าหมาย IEP + รายการสื่อบัญชี ก-ข พร้อมเหตุผลประกอบ และ export เป็นเอกสารฉบับจริงได้ทันที

> **JUMP THAILAND Hackathon 2026** · Empowering Teachers Track

---

## 🎯 อ่านตรงนี้ก่อนเริ่มโค้ด

**เป้าหมายรอบนี้ไม่ใช่ทำ product ให้สมบูรณ์ แต่คือทำให้ครูการศึกษาพิเศษใช้ทำงานจริงได้ทัน 31 ก.ค.**

รอบ Bootcamp เราแพ้ทีมที่มี user data จริงแล้ว รอบนี้เราจะมี — เพราะ user จริงของเราต้องทำ IEP จริงสิ้นเดือนนี้พอดี

**หลักตัดสินใจตลอดโปรเจกต์:**
> ถ้าฟีเจอร์ไหนไม่ช่วยให้ครูทำ IEP เสร็จเร็วขึ้น → ตัดทิ้ง ไม่ต้องเถียง

---

## 🚀 เริ่มต้นใช้งาน

```bash
# 1. Clone + ติดตั้ง
git clone <repo-url>
cd iep-gen
npm install

# 2. ตั้งค่า environment
cp .env.example .env
# เปิด .env ใส่ DATABASE_URL, DIRECT_URL และ ANTHROPIC_API_KEY (ถ้ามี)
# 💡 ใช้ .env ไม่ใช่ .env.local — Prisma CLI (db:push) อ่านเฉพาะ .env

# 3. สร้างตารางใน database
npm run db:push

# 4. รัน
npm run dev
# เปิด http://localhost:3000
```

> 💡 **ไม่มี ANTHROPIC_API_KEY ก็รันได้** — ระบบจะ return mock data ให้อัตโนมัติ
> แต่ **ต้องมี DATABASE_URL** เพราะระบบเก็บข้อมูลลง DB จริง

**หา DATABASE_URL ฟรีได้จาก:** [Supabase](https://supabase.com) (แนะนำ) หรือ [Neon](https://neon.tech)
→ สมัคร → สร้าง project → Settings → Database → คัดลอก Connection string (URI)
→ `DATABASE_URL` ใช้ port 6543 ต่อท้าย `?pgbouncer=true&connection_limit=1`,
   `DIRECT_URL` ใช้ port 5432 (สำหรับ `db:push` — ดูคอมเมนต์ใน `.env.example`)
→ ตอน deploy Vercel ต้องตั้ง env **ทั้งสองตัว** ไม่งั้น build fail

**คำสั่งที่ใช้บ่อย:**
```bash
npm run db:push     # sync schema.prisma → database
npm run db:studio   # เปิด GUI ดูข้อมูลใน DB
npm run build       # เช็คว่า build ผ่านก่อน push
```

---

## 📁 โครงสร้างโปรเจกต์ + ใครดูแลไฟล์ไหน

```
iep-gen/
├── prisma/
│   └── schema.prisma            👤 คน A  โครงสร้าง database
├── app/
│   ├── page.tsx                 👤 คน B  หน้าหลัก
│   ├── stats/page.tsx           👤 คน B  หน้าสถิติ (เก็บหลักฐาน)
│   └── api/
│       ├── students/route.ts    👤 คน A  จัดการนักเรียน
│       ├── students/[id]/       👤 คน A  ดู/แก้/ลบนักเรียนรายคน
│       ├── plans/route.ts       👤 คน A  สร้างแผน (pipeline หลัก)
│       ├── plans/[id]/route.ts  👤 คน A  แก้ไข/ยืนยันแผน
│       ├── plans/[id]/export/   👤 คน A  export .docx
│       └── stats/route.ts       👤 คน A  สถิติการใช้งาน
├── components/                  👤 คน B  UI ทั้งหมด
│   ├── StudentPicker.tsx
│   ├── AssessmentForm.tsx
│   ├── PlanEditor.tsx
│   └── CopyButton.tsx
├── lib/
│   ├── types.ts                 ⚠️ ร่วมกัน (contract) — แก้ต้องบอกอีกคน
│   ├── db.ts                    👤 คน A  Prisma client
│   ├── pii-guard.ts             👤 คน A  🔒 บังคับ PII boundary
│   ├── retrieval.ts             👤 คน A  lookup mapping table
│   ├── prompts.ts               👤 คน A  system prompt + few-shot
│   └── serializers.ts           👤 คน A  Prisma model → DTO
└── data/
    ├── mappingTable.json        👤 คน A  ระดับความสามารถ → สื่อ ก/ข
    └── fewShotExamples.json     👤 คน A  ตัวอย่าง IEP จริง (ลบชื่อแล้ว)
```

**แบ่งไฟล์ตามเจ้าของชัดเจน → โอกาส merge conflict แทบเป็นศูนย์**

ไฟล์เดียวที่ทั้งคู่แตะคือ `lib/types.ts` — **ถ้าจะแก้ต้องบอกอีกคนก่อนเสมอ**

---

## 🔄 Flow การทำงานของระบบ

```
1. ครูเลือก/เพิ่มนักเรียน (ใช้รหัส ไม่ใช่ชื่อจริง)
                    ↓
2. กรอกระดับความสามารถ (dropdown ไม่ต้องพิมพ์ prompt)
                    ↓
3. POST /api/plans
   ├─ บันทึก Assessment ลง DB
   ├─ RETRIEVAL: lookup mappingTable.json  ← ไม่ใช้ AI
   ├─ GENERATION: LLM เรียบเรียงภาษา       ← ใช้ AI (จำกัดขอบเขต)
   └─ บันทึก Plan + Goals + Media ลง DB
                    ↓
4. ครูตรวจแก้ (PATCH /api/plans/[id])
   → แก้เฉพาะ finalText/finalReason  · aiOriginal ไม่แตะ
                    ↓
5. ครูกดยืนยัน → บันทึก finalizedAt (= เวลาที่ใช้ทำแผน)
                    ↓
6. ผลลัพธ์ใช้ได้ 2 ทาง
   ├─ ปุ่ม Copy      → กรอกเข้าระบบ SET online ทีละช่อง
   └─ Export .docx   → เอกสารฉบับจริงที่คณะกรรมการต้องเซ็น
```

---

## 🧠 หลักการออกแบบ AI (ห้ามพลาด)

| ส่วน | ใครตัดสินใจ | เหตุผล |
|---|---|---|
| สื่อ/บัญชี ก-ข ที่แนะนำ | **mappingTable.json** (rule-based) | ผูกกับงบเบิกจริง ผิดไม่ได้ — **ห้ามให้ LLM คิดเอง** |
| ภาษา/การเรียบเรียง | **LLM** (few-shot prompting) | ต้องการภาษาราชการที่ลื่นไหล |
| การยืนยันขั้นสุดท้าย | **ครู** | ระบบไม่ auto-submit เข้าระบบราชการเด็ดขาด |

LLM เห็นเฉพาะรายการสื่อที่ retrieve มาแล้วเท่านั้น → ป้องกัน hallucination ในจุดที่ผิดพลาดไม่ได้

---

## 📊 ระบบเก็บหลักฐานให้อัตโนมัติ

**นี่คือฟีเจอร์ที่ทำให้ใบสมัครเราแข็งกว่าทีมอื่น — และมันทำงานเองโดยไม่ต้องจดมือ**

DB เก็บทั้ง `aiOriginal` (ข้อความที่ AI ร่าง) และ `finalText` (หลังครูแก้) แยกกัน ระบบจึงคำนวณได้เองว่า:

- ครูแก้ข้อความที่ AI ร่างกี่ % → **AI แม่นแค่ไหน**
- ใช้เวลาทำแผน 1 ฉบับเฉลี่ยเท่าไหร่ → **เทียบกับก่อนใช้ระบบ**
- ทุกจุดที่ครูแก้ = insight ว่าระบบยังไม่ดีพอตรงไหน

ดูได้ที่หน้า `/stats`

> ⚠️ **อย่าลืมจับเวลา baseline ก่อน** ว่าปกติครูทำ IEP 1 คนใช้เวลาเท่าไหร่ ไม่งั้นไม่มีตัวเทียบ

---

## 🔒 PII Boundary — สถาปัตยกรรมความเป็นส่วนตัว

ระบบแยกคำถาม 2 ข้อที่คนมักสับสน:

| คำถาม | คำตอบ |
|---|---|
| เก็บข้อมูลส่วนตัวเด็กใน DB ได้ไหม | **ได้** — โรงเรียนถือข้อมูลนี้อยู่แล้วตามกฎหมาย และเอกสาร IEP ต้องมีข้อมูลนี้ตามระเบียบ การเก็บไว้คือสิ่งที่ทำให้ครูไม่ต้องกรอกส่วนที่ 1-4 ซ้ำทุกครั้ง |
| ส่งข้อมูลส่วนตัวไป LLM ได้ไหม | **ไม่ได้เด็ดขาด** — AI ไม่จำเป็นต้องรู้ชื่อเด็กเพื่อเขียนเป้าหมาย |

```
DB
├── 🔒 PII ZONE — ชื่อ, เลขบัตร ปชช, ที่อยู่, ชื่อผู้ปกครอง, ข้อมูลการแพทย์ ฯลฯ
│                 ↓ ห้ามข้ามเส้นนี้ ↓
├══════════ PII BOUNDARY ══════════
│                 ↓ ผ่านได้ ↓
└── ประเภทความพิการ, ระดับชั้น, ระดับความสามารถ
                  ↓
            LLM (Claude)
                  ↓
    ข้อความที่ใช้คำว่า "นักเรียน" ไม่มีชื่อจริง
                  ↓
    Export: ดึง PII จาก DB มาเติม + แทน "นักเรียน" ด้วยชื่อจริง
                  ↓
    เอกสาร .docx ครบถ้วน ครูไม่ต้องกรอกอะไรเพิ่ม
```

บังคับด้วยโค้ดใน [`lib/pii-guard.ts`](lib/pii-guard.ts) ไม่ใช่แค่ความจำ:
- `buildLLMSafePayload()` — whitelist ส่งได้เฉพาะที่ระบุไว้
- `assertNoPII()` — เรียกก่อน fetch ไป LLM ทุกครั้ง เจอ PII จะ throw ทันที
- `scrubFreeText()` — ตาข่ายกันพลาดสำหรับช่องที่ครูพิมพ์เอง
- `personalizeForExport()` — แทนที่ "นักเรียน" ด้วยชื่อจริง ทำฝั่งเราตอน export เท่านั้น

**กฎที่ห้ามละเมิด:**
- ❌ ห้ามเรียก LLM ด้วยอย่างอื่นนอกจากผลลัพธ์ของ `buildLLMSafePayload()`
- ❌ ห้ามลบ `assertNoPII()` ออกจาก `app/api/plans/route.ts`
- ❌ ห้าม commit `.env` หรือข้อมูลเด็กจริง (รวมถึงใน `fewShotExamples.json`)
- ❌ ห้ามใส่ API key ใน client component
- ❌ ห้าม log PII (อย่า `console.log(student)` — log แค่ id/code)

> ⚠️ ทีมเราไม่ใช่นักกฎหมาย เรื่องนโยบายการเก็บข้อมูลนักเรียนในระบบภายนอก ควรให้โรงเรียนยืนยันก่อนขยายไปใช้กับครูคนอื่น

---

## ❓ คำถามที่ต้องถามครูการศึกษาพิเศษก่อน (สำคัญกว่าเริ่มโค้ด)

1. **สิ้นเดือนนี้ต้องทำ IEP ให้เด็กกี่คน ความพิการประเภทไหนบ้าง**
   → ตอนนี้ `mappingTable.json` มีแค่ออทิสติก + LD ถ้าไม่ตรงต้องเพิ่มก่อน
2. **ระบบ SET มีปุ่ม import ไฟล์ไหม หรือต้องพิมพ์ทีละช่อง**
   → ถ้ามี import ต้องรู้ว่ารับไฟล์นามสกุลอะไร โครงสร้างแบบไหน
3. **แบบฟอร์ม IEP ของโรงเรียนมีหัวข้ออะไรบ้าง**
   → ตรวจว่าโครงสร้างใน `export/route.ts` ตรงกับของจริงไหม
4. **ปกติทำ IEP 1 คนใช้เวลาเท่าไหร่**
   → ตัวเลข baseline สำหรับเทียบ before/after
5. **ขอดูแผน IEP ปีก่อน 2-3 ฉบับ (ลบชื่อ)**
   → ใช้เป็น few-shot examples ที่ตรงกับ format จริง

---

## ✅ Definition of Done

- [ ] ครูเปิดเว็บจากคอมที่บ้าน/โรงเรียนแล้วใช้ได้ **โดยไม่ต้องให้เราช่วย**
- [ ] ครูกรอกข้อมูลเด็ก 1 คน แล้วได้เป้าหมาย IEP + รายการสื่อ ที่ครูบอกว่า **เอาไปใช้ได้จริง**
- [ ] ครู export ไฟล์ .docx ออกมาแล้วใช้เป็นเอกสารจริงได้
- [ ] ข้อมูลยังอยู่เมื่อปิดเบราว์เซอร์แล้วเปิดใหม่ (DB ทำงานถูกต้อง)
- [ ] หน้า `/stats` แสดงตัวเลขที่ใช้เป็นหลักฐานได้

---

## 🛠 Tech Stack

- **Next.js 14** (App Router) — frontend + API ในโปรเจกต์เดียว
- **TypeScript** + **Tailwind CSS**
- **Prisma** + **PostgreSQL** (Supabase / Neon)
- **docx** — สร้างไฟล์ Word ฝั่ง server
- **Claude API** — เรียกจาก server side เท่านั้น
- **Vercel** — deploy อัตโนมัติจาก `main`

---

## 📚 เอกสารเพิ่มเติม

- [`CLAUDE.md`](CLAUDE.md) — instruction สำหรับ Claude (ภาษาอังกฤษ) อ่านอัตโนมัติเมื่อใช้ Claude Code
- [`docs/DEV_PLAN.md`](docs/DEV_PLAN.md) — แผนงานเต็ม timeline การแบ่งงาน
- [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md) — วิธีทำงานร่วมกันบน GitHub
