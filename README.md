# IEP GENERATE

AI สำหรับครูการศึกษาพิเศษ กรอกข้อมูลเด็กครั้งเดียว ได้เป้าหมาย IEP + รายการสื่อบัญชี ก-ข พร้อมเหตุผลประกอบ

**JUMP THAILAND Hackathon 2026**

## 🎯 เป้าหมาย

**ไม่ได้ทำแพลตฟอร์มให้สมบูรณ์ ทำเพื่อแค่ให้ทันครูการพิเศษกลุ่มเป้าหมายทดลองใช้จริง ภายในสิ้นเดือน 31 กค.**

**หลักตัดสินใจตลอดโปรเจกต์:**
รายละเอียดเต็ม: [`docs/DEV_PLAN.md`](docs/DEV_PLAN.md)


## 🚀 เริ่มต้นใช้งาน

```bash
# 1. Clone
git clone <repo-url>
cd iep-gen

# 2. ติดตั้ง dependencies
npm install

# 3. ตั้งค่า environment
cp .env.example .env.local
# แล้วเปิด .env.local ใส่ API key จริง

# 4. รัน
npm run dev
# เปิด http://localhost:3000
```

> 💡 **ไม่มี API key ก็รันได้** ระบบจะ return mock data ให้อัตโนมัติ (ดู `USE_MOCK` ใน `.env.example`)

> คน B พัฒนา UI ได้ทันทีโดยไม่ต้องรอ API เสร็จ



## 📁 โครงสร้างไฟล์โปรเจกต์ + ใครดูแลไฟล์ไหน

```
iep-gen/
├── app/
│   ├── page.tsx                 👤 คน B  หน้าหลัก
│   ├── layout.tsx               👤 คน B
│   ├── globals.css              👤 คน B
│   └── api/generate/route.ts    👤 คน A  API endpoint
├── components/                  👤 คน B  UI components
│   ├── ProfileForm.tsx
│   ├── ResultPanel.tsx
│   └── CopyButton.tsx
├── lib/
│   ├── types.ts                 ⚠️ ร่วมกัน (contract) — แก้ต้องบอกอีกคน
│   ├── prompts.ts               👤 คน A  system prompt + few-shot
│   └── retrieval.ts             👤 คน A  lookup mapping table
├── data/
│   ├── mappingTable.json        👤 คน A  ระดับความสามารถ → สื่อ ก/ข
│   └── fewShotExamples.json     👤 คน A  ตัวอย่าง IEP จริง
└── docs/
    ├── DEV_PLAN.md              แผนงานเต็ม + timeline
    └── GIT_WORKFLOW.md          วิธีทำงานร่วมกันบน GitHub
```

ไฟล์เดียวที่ทั้งคู่แตะคือ `lib/types.ts` (ตัว contract) — **ถ้าจะแก้ต้องบอกอีกคนก่อนเสมอ**




## 🔌 Data Contract (สำคัญที่สุด)

ทั้งคู่ยึด type ใน [`lib/types.ts`](lib/types.ts) เป็นหลัก ใครเสร็จก่อนไม่ต้องรออีกคน

**Request:** `POST /api/generate`
```json
{
  "disabilityType": "autism",
  "abilityLevels": {
    "communication": "no_speech_gesture_only",
    "behavior": "frequent_off_task"
  },
  "strengths": "ชอบวาดภาพ จดจำภาพได้ดี",
  "gradeLevel": "ป.2"
}
```

**Response:**
```json
{
  "iepGoals": [
    { "id": "goal_1", "text": "...", "criterion": "8 ใน 10 ครั้ง", "timeframe": "ภายในภาคเรียนนี้" }
  ],
  "mediaRecommendations": [
    { "item": "บัตรภาพ PECS", "category": "ก", "reason": "..." }
  ],
  "iipMethods": [
    { "id": "method_1", "text": "...", "linkedGoalId": "goal_1" }
  ]
}
```



## 🧠 หลักการออกแบบ AI 

| ส่วน | ใครตัดสินใจ | เหตุผล |
|---|---|---|
| สื่อ/บัญชี ก-ข ที่แนะนำ | **mappingTable.json** (rule-based) | ผูกกับงบเบิกจริง ผิดไม่ได้  **ห้ามให้ LLM คิดเอง** |
| ภาษา/การเรียบเรียง | **LLM** (few-shot prompting) | ต้องการภาษาราชการที่ลื่นไหล |
| การยืนยันขั้นสุดท้าย | **ครู** | ระบบไม่ auto-submit เข้าระบบราชการเด็ดขาด |

**เหตุผล:** ป้องกัน hallucination ในจุดที่ผิดพลาดไม่ได้ LLM ทำหน้าที่แค่เรียบเรียงภาษาจากข้อมูลที่ verified มาแล้ว





## 🔒 กฎเรื่องข้อมูลเด็ก (ห้ามละเมิด)

ข้อมูลเด็กพิเศษ = ข้อมูลอ่อนไหวของผู้เยาว์

- ❌ **ห้าม commit `.env.local`** — API key หลุด = โดนใช้จนเงินหมด
- ❌ **ห้ามเก็บชื่อจริงเด็ก** ในระบบ/log ใดๆ ใช้รหัสแทน (เด็ก A, B, C)
- ❌ **ห้ามส่งชื่อ/อายุ/โรงเรียน ไป LLM API** — ส่งเฉพาะประเภทความพิการ + ระดับความสามารถ
- ❌ **ห้าม commit ข้อมูลเด็กจริง** รวมถึงใน `fewShotExamples.json` (ลบชื่อก่อนเสมอ)
- ❌ **ห้ามใส่ API key ใน client component** — เรียกจาก API route ฝั่ง server เท่านั้น

> จุดนี้เป็นจุดแข็งตอน pitch ด้วย — บอกได้ว่า "privacy-by-design ตั้งแต่ prototype แรก"



## 🛠 Tech Stack

- **Next.js 14** (App Router) — frontend + API ในโปรเจกต์เดียว
- **TypeScript** + **Tailwind CSS**
- **Claude API** (Anthropic) — เรียกจาก server side เท่านั้น
- **Vercel** — deploy อัตโนมัติจาก `main`
- **ไม่มี database** — mapping table เก็บเป็น JSON ใน repo



## 📚 เอกสารเพิ่มเติม

- [`docs/DEV_PLAN.md`](docs/DEV_PLAN.md) — แผนงานเต็ม timeline การแบ่งงาน
- [`docs/GIT_WORKFLOW.md`](docs/GIT_WORKFLOW.md) — วิธีทำงานร่วมกันบน GitHub
