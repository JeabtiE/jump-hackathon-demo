# MIGRATION NOTES — เพิ่มระบบเจ้าของข้อมูล (Phase 2)

เอกสารนี้อธิบายลำดับคำสั่งที่ต้องรันด้วยมือ หลังจาก schema มี `User / Account / Session /
VerificationToken / AllowedEmail` และ `Student.userId` แล้ว

> 📍 **สถานะปัจจุบัน**: ขั้นที่ 1–2 รันไปแล้ว (DB มี 4 แถว มีเจ้าของครบ ไม่มี `userId` เป็น null)
> `prisma/schema.prisma` แก้เป็น **ขั้นที่ 3 เรียบร้อยแล้ว** — เหลือแค่รัน `npm run db:push` (ขั้นที่ 4)

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

### 3. แก้ `prisma/schema.prisma` — ✅ ทำแล้ว

แก้ไป 2 อย่างพร้อมกันใน `model Student`:

**3.1 `userId` เป็น required**

```diff
- userId String?
- user   User?   @relation(fields: [userId], references: [id], onDelete: Restrict)
+ userId String
+ user   User    @relation(fields: [userId], references: [id], onDelete: Restrict)
```

**3.2 `code` ไม่ unique ทั้ง DB อีกต่อไป — unique แค่ภายในครูคนเดียวกัน**

```diff
- code String @unique
+ code String
...
+ @@unique([userId, code])
```

ครูคนละคนต้องใช้รหัสนักเรียนซ้ำกันได้ — "A-01" ของครู ก กับ "A-01" ของครู ข
เป็นคนละคนและไม่ควรชนกัน

> ⚠️ **3.2 ทำได้ก็ต่อเมื่อ 3.1 เสร็จแล้วเท่านั้น** ถ้า `userId` ยัง nullable อยู่
> Postgres ถือว่า `NULL` ไม่เท่ากับ `NULL` → แถวที่ไม่มีเจ้าของจะใส่ `code` ซ้ำกันได้
> ไม่จำกัด constraint จะไม่ทำงานจริงตามที่ตั้งใจ

### 4. บังคับลง DB จริง ← **เหลือแค่ขั้นนี้**

```bash
npm run db:push
```

Prisma จะทำ 2 อย่าง: เปลี่ยน `userId` เป็น `NOT NULL` และสลับ unique constraint
ของ `code` เป็น composite `(userId, code)`

ตรวจแล้วว่าข้อมูลปัจจุบันพร้อม — ถ้า `db:push` ล้ม มีแค่ 2 สาเหตุ:

| error | แปลว่า | แก้ยังไง |
| --- | --- | --- |
| `column "userId" contains null values` | ยังมีนักเรียนไม่มีเจ้าของ | กลับไปรันขั้นที่ 2 |
| `could not create unique index` | ครูคนเดียวกันมีรหัสซ้ำกันอยู่ | แก้รหัสที่ซ้ำใน Prisma Studio ก่อน |

> ⚠️ ปิด `npm run dev` และ Prisma Studio ก่อนรัน — ทั้งคู่ล็อกไฟล์ engine ของ Prisma ไว้
> ทำให้ `prisma generate` ล้มด้วย `EPERM ... query_engine-windows.dll.node`

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
- **ไม่ลบ `@@index([userId])`** ทั้งที่ `@@unique([userId, code])` สร้าง index ที่มี `userId`
  เป็นคอลัมน์นำอยู่แล้ว (ซ้ำซ้อนทางเทคนิค) — ปล่อยไว้ก่อน ลบทีหลังได้ถ้าอยากประหยัดพื้นที่ index

> ✅ **query filtering ทำเสร็จแล้ว** — ทุก route ใน `app/api/**` กรองด้วย `userId` ผ่าน
> `lib/auth-guard.ts` เรียบร้อย ดูตารางสรุปเงื่อนไขการกรองของแต่ละ route ได้ที่ท้ายเอกสารนี้

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

---

## ตารางสรุป: แต่ละ route กรองด้วยอะไร

ทุก route เรียก `requireUserId()` จาก [`lib/auth-guard.ts`](lib/auth-guard.ts) เป็นบรรทัดแรก
(ยกเว้น `app/api/auth/**` ซึ่งเป็นของ Auth.js เอง)

| Route | Method | เงื่อนไขที่ใช้กรอง | ไม่ผ่าน |
| --- | --- | --- | --- |
| `/api/students` | GET | `where: { userId }` | 401 |
| `/api/students` | POST | `userId` จาก session เท่านั้น · เช็ค code ซ้ำ `{ userId, code }` | 401 · 409 |
| `/api/students/[id]` | GET | `findFirst({ id, userId })` | 401 · 404 |
| `/api/students/[id]` | PATCH | ยืนยันเจ้าของก่อน · เช็ค code ซ้ำในขอบเขตตัวเอง | 401 · 404 · 409 |
| `/api/students/[id]` | DELETE | `deleteMany({ id, userId })` → `count === 0` | 401 · 404 |
| `/api/students/[id]/history` | GET | `findFirst({ id, userId })` | 401 · 404 |
| `/api/plans` | GET | `{ student: { userId }, ...(studentId && { studentId }) }` | 401 |
| `/api/plans` | POST | ยืนยันเจ้าของ **ก่อนยิง LLM** | 401 · 404 |
| `/api/plans/[id]` | GET | `{ id, student: { userId } }` | 401 · 404 |
| `/api/plans/[id]` | PATCH | scope เจ้าของ + ทุก section/goal/media id ต้องอยู่ในแผนนี้ | 401 · 404 · 400 |
| `/api/plans/[id]/export` | GET | `{ id, student: { userId } }` | 401 · 404 |
| `/api/assess/classify` | POST | มี session เท่านั้น (ไม่แตะ DB) | 401 |
| `/api/stats` | GET | `mine` กรอง `student.userId` · `all` ไม่กรอง | 401 |

**ตอบ 404 เสมอ ไม่มี 403 เลย** — 403 เท่ากับยืนยันว่า id นั้นมีอยู่จริงในระบบ
เดาไล่ id ไปเรื่อยๆ ก็นับจำนวนนักเรียนทั้งระบบได้ วิธีบังคับกฎนี้คือใส่ `userId`
ลงใน `where` ตั้งแต่แรก ผลลัพธ์จึงเป็น "ไม่เจอ" โดยธรรมชาติ

### ยังไม่ได้ทำ

- **quota ต่อคนของ `/api/assess/classify`** — ครูที่ล็อกอินแล้วยังยิง LLM ได้ไม่จำกัด
- **หน้า UI สำหรับเพิ่ม `AllowedEmail`** — ตอนนี้ต้อง insert ผ่าน Prisma Studio
