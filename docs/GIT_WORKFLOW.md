# Git Workflow — ทำงานร่วมกัน 2 คน

## 🚀 ขั้นตอนครั้งแรก (เจ้าของ repo ทำ)

### 1. Push โปรเจกต์ขึ้น GitHub

```bash
cd iep-go
git init
git add .
git commit -m "init: project scaffold"
git branch -M main

# สร้าง repo บน github.com ก่อน (ตั้งเป็น Private) แล้ว:
git remote add origin https://github.com/<username>/iep-go.git
git push -u origin main
```

> หรือถ้ามี GitHub CLI: `gh repo create iep-go --private --source=. --push`

### 2. เชิญเพื่อนเข้ามาแก้ไขได้

**บน GitHub:**
```
เปิด repo → Settings → Collaborators → Add people
→ ใส่ username หรืออีเมล GitHub ของเพื่อน → เลือกสิทธิ์ "Write"
```

เพื่อนจะได้อีเมลเชิญ กด **Accept invitation** แล้วจะ push ได้ทันที

> **สิทธิ์ Write** = clone, push, สร้าง branch, เปิด PR ได้ (พอสำหรับทีมเรา)
> ไม่ต้องให้ Admin เพราะเพื่อนไม่ต้องแก้ setting repo

### 3. เชื่อม Vercel

```
vercel.com → Add New Project → Import Git Repository → เลือก iep-go
→ Environment Variables → เพิ่ม ANTHROPIC_API_KEY
→ Deploy
```

หลังจากนี้ทุกครั้งที่ push เข้า `main` จะ deploy อัตโนมัติ

---

## 👥 ขั้นตอนของเพื่อน (คนที่ถูกเชิญ)

```bash
# 1. Clone
git clone https://github.com/<username>/iep-go.git
cd iep-go

# 2. ติดตั้ง
npm install

# 3. ตั้ง env (ใช้ mock ได้ ไม่ต้องมี API key)
cp .env.example .env.local

# 4. รัน
npm run dev
```

---

## 🔄 Workflow ประจำวัน

### กติกาหลัก

| กฎ | เหตุผล |
|---|---|
| ❌ ห้าม push ตรงเข้า `main` | main = ตัวที่แม่ใช้งานจริง พังไม่ได้ |
| ✅ ทำ branch เสมอ แล้วเปิด PR | Vercel สร้าง Preview URL ให้ทุก PR — ส่งให้แม่ทดลองได้โดยไม่กระทบตัวจริง |
| ✅ merge ได้เลยไม่ต้องรอ approve | ทีมเล็ก เวลาน้อย — แต่**ต้องบอกอีกคนใน chat ว่า merge อะไรไป** |
| ✅ pull ก่อนเริ่มงานทุกครั้ง | ป้องกัน conflict |

### คำสั่งที่ใช้ประจำ

```bash
# เริ่มงานใหม่
git checkout main
git pull origin main
git checkout -b feat/profile-form

# ระหว่างทำงาน (commit บ่อยๆ ได้)
git add .
git commit -m "add dropdown for ability levels"

# push ขึ้น GitHub
git push -u origin feat/profile-form

# → ไปเปิด Pull Request บน GitHub → Merge → บอกอีกคน
```

### ตั้งชื่อ branch

```
feat/xxx    ฟีเจอร์ใหม่      เช่น feat/copy-button
fix/xxx     แก้บั๊ก          เช่น fix/loading-not-showing
data/xxx    เพิ่มข้อมูล       เช่น data/add-ld-mapping
```

### Commit message

แค่ให้อ่านรู้เรื่องว่าทำอะไร ไม่ต้องเคร่ง convention:

✅ `add mapping table for autism`
✅ `fix loading state not showing`
✅ `update prompt to include criterion`

❌ `update` / `fix bug` / `.` — ย้อนดูทีหลังไม่รู้ว่าคืออะไร



## 📅 จังหวะการทำงาน

บอกกันว่าวันนี้จะแตะไฟล์ไหน — ป้องกันชนกันตั้งแต่ต้น

ทำงานบน branch ตัวเอง commit บ่อยๆ

ทั้งคู่ merge เข้า main แล้ว**เปิด production URL ทดสอบด้วยกัน**
→ ถ้าพัง แก้เลยวันนั้น อย่าปล่อยข้ามคืน



## 🗂 ใครแตะไฟล์ไหน (ลด conflict)


คน A (domain + AI)          คน B (frontend + infra)
─────────────────────       ──────────────────────
app/api/generate/route.ts   app/page.tsx
lib/prompts.ts              app/layout.tsx
lib/retrieval.ts            app/globals.css
data/mappingTable.json      components/*
data/fewShotExamples.json   tailwind.config.ts

        ⚠️ lib/types.ts = ร่วมกัน
        แก้เมื่อไหร่ ต้องบอกอีกคนก่อนเสมอ




## ⚠️ ถ้าเจอ Merge Conflict

เกิดยากเพราะแบ่งไฟล์กันชัด แต่ถ้าเกิด:

```bash
git pull origin main
# VS Code จะไฮไลต์จุดที่ชนให้ — เลือกว่าจะเก็บส่วนไหน
git add .
git commit -m "resolve conflict"
git push
```

**ถ้าไม่แน่ใจว่าจะเก็บส่วนไหน — โทรหากันก่อน อย่าเดา** โดยเฉพาะ `lib/types.ts`



## 🔐 ความปลอดภัย — ห้ามพลาด

| สิ่งที่ห้าม | ผลที่ตามมา |
|---|---|
| commit `.env.local` | API key หลุด = โดนใช้จนเงินหมด (แม้ repo private ก็ไม่ควรเสี่ยง) |
| ใส่ API key ใน client component | เห็นได้จาก browser devtools ทันที |
| commit ข้อมูลเด็กจริง | ผิดหลัก PDPA — รวมถึงใน `fewShotExamples.json` ด้วย |

**ถ้าเผลอ commit API key ไปแล้ว:**
1. ไป revoke key ทิ้งทันทีที่ console.anthropic.com
2. สร้าง key ใหม่
3. อย่าแค่ลบ commit — git history ยังเก็บไว้อยู่



## 🧪 เช็คก่อน push ทุกครั้ง

```bash
npm run build   # ถ้า build ไม่ผ่าน Vercel ก็ deploy ไม่ได้
```

ใช้เวลาไม่กี่วินาที แต่กัน production พังได้เยอะ
