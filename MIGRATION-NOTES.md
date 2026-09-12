# MIGRATION NOTES — เพิ่มระบบเจ้าของข้อมูล (Phase 2)

เอกสารนี้อธิบายลำดับคำสั่งที่ต้องรันด้วยมือ หลังจาก schema มี `User / Account / Session /
VerificationToken / AllowedEmail` และ `Student.userId` แล้ว

> ⚠️ ยังไม่มีใครรันคำสั่งไหนให้ — ณ ตอนนี้แก้แค่ไฟล์ `prisma/schema.prisma` กับเพิ่ม
> `scripts/backfill-owner.ts` เท่านั้น DB จริงยังไม่เปลี่ยน

---

## ทำไมต้องแบ่ง 3 จังหวะ ไม่ push รวดเดียว

`Student.userId` ปลายทางต้องเป็น **required** (ไม่งั้นกรองข้อมูลตามเจ้าของไม่ได้จริง —
`userId: null` จะหลุดตะแกรงทุกครั้ง) แต่ push คอลัมน์ required ลงตารางที่มีข้อมูลอยู่แล้ว
Postgres จะปฏิเสธทันที เพราะแถวเก่าไม่มีค่าให้ใส่

จึงต้องเดินสามจังหวะ: **optional → backfill → required**

---

## ลำดับคำสั่ง

### 0. สำรอง DB ก่อน

Supabase → Database → Backups (ขั้นที่ 3 ย้อนกลับยาก)

### 1. สร้างตาราง auth + คอลัมน์ `userId` แบบ optional

```bash
npm run db:push
```

ได้ตาราง `User`, `Account`, `Session`, `VerificationToken`, `AllowedEmail`
และคอลัมน์ `Student.userId` (ยัง null ได้) — ข้อมูลเดิมไม่กระทบ

### 2. ยกข้อมูลเก่าให้มีเจ้าของ

```bash
BACKFILL_OWNER_EMAIL=you@example.com node --env-file=.env scripts/backfill-owner.ts
```

- Node ต้องเป็น v22+ (เครื่องนี้ v24) — รัน `.ts` ได้ตรงๆ ไม่ต้องลง `tsx`
- `--env-file=.env` จำเป็น เพราะ Prisma **Client** ไม่ได้อ่าน `.env` ให้เอง (ต่างจาก Prisma CLI)
- สคริปต์ upsert `User` + `AllowedEmail` ด้วยอีเมลนั้น แล้ว `updateMany` ทุก `Student`
  ที่ `userId` เป็น null
- ♻️ รันซ้ำได้ รอบสองจะแก้ 0 แถว
- 🔒 พิมพ์ออกมาแค่จำนวนแถวกับ `userId` — ไม่มีชื่อนักเรียน ไม่มีอีเมล

**🛑 ต้องได้ `ยังไม่มีเจ้าของหลังรัน : 0 แถว` เท่านั้น** ถ้าไม่ใช่ หยุด อย่าไปขั้นที่ 3

### 3. แก้ `prisma/schema.prisma` ด้วยมือ — เอา `?` ออก 2 ที่

ใน `model Student` บล็อก `OWNERSHIP`:

```diff
- userId String?
- user   User?   @relation(fields: [userId], references: [id], onDelete: Restrict)
+ userId String
+ user   User    @relation(fields: [userId], references: [id], onDelete: Restrict)
```

ที่เหลือเหมือนเดิมทุกตัวอักษร และลบคอมเมนต์ "optional ชั่วคราวเท่านั้น" ทิ้งได้เลย

### 4. บังคับ required ลง DB จริง

```bash
npm run db:push
```

### 5. เช็คว่ายังคอมไพล์ผ่าน

```bash
npm run build
```

---

## สิ่งที่ **ไม่ได้** ทำโดยตั้งใจ

- **ไม่ใส่ `userId` ลง `Assessment`, `Plan`, `PlanDomainSection`, `PlanGoal`, `PlanMedia`**
  ทั้งหมดไต่ผ่าน `Student` เอา (`plan.student.userId`) — เจ้าของข้อมูลต้องมี
  source of truth ที่เดียว ถ้าเก็บซ้ำหลายตาราง วันหนึ่งค่ามันจะไม่ตรงกันแล้วไม่มีใครรู้ว่าอันไหนถูก
- **ไม่แตะ `lib/pii-guard.ts`** — `userId` เป็น FK ภายในระบบ ไม่ใช่ PII ของนักเรียน
  จึงไม่ต้องเพิ่มใน `PII_FIELDS` และ `buildLLMSafePayload()` เป็น whitelist อยู่แล้ว ไม่รั่วไป LLM
- **ไม่แตะ PII ZONE 16 fields และคู่ `aiXxx`/`finalXxx` ทั้งหมด** — ยืนยันด้วย `git diff -w` แล้วว่าไม่มีบรรทัดไหนถูกแก้
- **ไม่ใส่ `model Authenticator`** (WebAuthn/passkey ของ Auth.js) — เพิ่มทีหลังได้ถ้าจะใช้
- **ยังไม่เขียน query filtering** — ตอนนี้ทุก route ยัง query ข้ามเจ้าของได้เหมือนเดิม
  การกรองด้วย `where: { userId }` เป็นงานถัดไป ไม่ใช่ของ migration นี้

`onDelete: Restrict` บน `Student.user` ตั้งใจเลือกแบบนี้ — ลบบัญชีครูต้องไม่ลากข้อมูล
นักเรียนหายตามไปด้วย ต้องย้ายเจ้าของก่อนถึงจะลบ `User` ได้

---

## ✅ ประตูรหัสผ่านชั่วคราว — ลบไปแล้ว

`app/gate/**`, `app/api/gate/**` และบล็อก `GATE_PASSWORD` / `GATE_TOKEN` ใน `.env.example`
ถูกลบทิ้งแล้ว `middleware.ts` เขียนทับเป็นการบังคับล็อกอินด้วย Auth.js แทน

> 🧹 ถ้าเคยตั้ง `GATE_PASSWORD` / `GATE_TOKEN` ไว้ใน `.env` ของเครื่องตัวเอง
> หรือบน Vercel — ลบทิ้งได้เลย ไม่มีโค้ดไหนอ่านแล้ว

---

## ตั้งค่า Google Cloud Console (ทำครั้งเดียว)

ไปที่ <https://console.cloud.google.com>

### 1. สร้าง / เลือกโปรเจกต์

แถบบนซ้าย → **Select a project** → **New Project** → ตั้งชื่อ เช่น `iep-gen` → **Create**

### 2. ตั้งค่าหน้าจอขอความยินยอม (OAuth consent screen)

เมนูซ้าย → **APIs & Services** → **OAuth consent screen**

| ช่อง | ค่าที่ใส่ |
| --- | --- |
| User Type | **External** (ถ้าโรงเรียนใช้ Google Workspace และครูทุกคนอยู่โดเมนเดียวกัน เลือก **Internal** ได้ — จะไม่ต้องทำขั้น "Test users") |
| App name | `IEP GEN` |
| User support email | อีเมลของคุณ |
| Developer contact | อีเมลของคุณ |

**Scopes** — กด **Add or Remove Scopes** แล้วเลือก 3 ตัวนี้ (เป็น scope พื้นฐานที่ Auth.js
ขอให้อัตโนมัติอยู่แล้ว ไม่ต้องขอเพิ่มอะไรอีก และไม่ต้องส่งให้ Google ตรวจสอบ):

- `openid`
- `.../auth/userinfo.email`
- `.../auth/userinfo.profile`

> ⚠️ อย่าขอ scope อื่นเกินนี้ ระบบต้องการแค่ "อีเมลกับชื่อ" เพื่อยืนยันตัวตน
> ขอมากกว่านี้ = Google บังคับให้ส่งแอปเข้ารีวิว และครูจะเห็นหน้าจอเตือนน่ากลัวตอนล็อกอิน

**Test users** (เฉพาะกรณีเลือก External และยังไม่กด Publish) — กด **Add Users**
แล้วใส่อีเมล Google ของครูทุกคนที่จะใช้งาน มิฉะนั้น Google จะไม่ให้ล็อกอิน

### 3. สร้าง OAuth client

**APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**

- Application type: **Web application**
- Name: `IEP GEN Web`

**Authorized JavaScript origins** — ใส่ 2 ค่า:

```
http://localhost:3000
https://<ชื่อโปรเจกต์>.vercel.app
```

**Authorized redirect URIs** — ใส่ 2 ค่า (ต้องตรงเป๊ะทุกตัวอักษร รวม `/api/auth/callback/google`):

```
http://localhost:3000/api/auth/callback/google
https://<ชื่อโปรเจกต์>.vercel.app/api/auth/callback/google
```

> ⚠️ ถ้าใช้โดเมนของตัวเอง (เช่น `https://iepgen.example.com`) ต้องเพิ่มของโดเมนนั้นด้วย
>
> ⚠️ URL ของ Vercel preview deployment เปลี่ยนทุก push (`...-git-xxx.vercel.app`)
> ลงทะเบียนไม่ไหว — ให้ทดสอบ login บน production URL หรือ localhost เท่านั้น

กด **Create** แล้วคัดลอก **Client ID** กับ **Client secret** มาใส่ `.env`:

```
AUTH_GOOGLE_ID=<Client ID>
AUTH_GOOGLE_SECRET=<Client secret>
```

### 4. สร้าง AUTH_SECRET

```bash
npx auth secret
```

คัดลอกค่าที่ได้ใส่ `AUTH_SECRET` ใน `.env`

---

## env var ที่ต้องเพิ่มบน Vercel

Vercel → โปรเจกต์ → **Settings** → **Environment Variables**
(ตั้งให้ครบทั้ง Production และ Preview)

| ชื่อ | ค่า | หมายเหตุ |
| --- | --- | --- |
| `DATABASE_URL` | connection string port **6543** | มีอยู่แล้ว |
| `DIRECT_URL` | connection string port **5432** | มีอยู่แล้ว |
| `ANTHROPIC_API_KEY` | API key | มีอยู่แล้ว |
| `AUTH_SECRET` | ผลจาก `npx auth secret` | 🆕 **ใหม่** |
| `AUTH_GOOGLE_ID` | Client ID จากขั้นที่ 3 | 🆕 **ใหม่** |
| `AUTH_GOOGLE_SECRET` | Client secret จากขั้นที่ 3 | 🆕 **ใหม่** |

- `AUTH_URL` **ไม่ต้องตั้ง** — Auth.js เดา host เองได้บน Vercel และเปิด `trustHost: true` ไว้แล้ว
- `USE_MOCK` ตั้งหรือไม่ตั้งก็ได้ — บน production ตั้ง `true` ก็ยังบังคับล็อกอินอยู่ดี
- 🧹 ลบ `GATE_PASSWORD` / `GATE_TOKEN` ทิ้งได้แล้ว

---

## ลำดับการทดสอบ login ครั้งแรก

1. ทำขั้นที่ 1–5 ของหัวข้อ "ลำดับคำสั่ง" ด้านบนให้ครบก่อน
   — **`scripts/backfill-owner.ts` ต้องรันแล้ว** เพราะมันคือตัวที่ใส่อีเมลคุณลง `AllowedEmail`
   ถ้าข้ามขั้นนี้ คุณจะล็อกอินไม่ผ่านเอง แล้วเจอหน้า `/auth/denied` ทั้งที่เป็นเจ้าของระบบ
2. `npm run dev` → เปิด <http://localhost:3000>
3. ต้องถูกเด้งไป `/auth/signin` → กดปุ่มเดียวที่มี → Google ให้เลือกบัญชี
4. เลือกอีเมลที่ตรงกับ `BACKFILL_OWNER_EMAIL` → เข้าหน้าแรกได้
5. ลองเลือกอีเมลอื่น → ต้องเจอหน้า `/auth/denied` ที่บอกอีเมลนั้น (ไม่ใช่หน้า error อังกฤษ)

### เพิ่มครูคนใหม่

ยังไม่มีหน้า UI ให้เพิ่ม (เป็นงาน Phase 3) ตอนนี้ใช้ `npm run db:studio` เปิด Prisma Studio
แล้ว insert แถวลงตาราง `AllowedEmail` — **ใส่อีเมลเป็นตัวพิมพ์เล็กทั้งหมด**
เพราะ `callbacks.signIn` เทียบแบบ lowercase
