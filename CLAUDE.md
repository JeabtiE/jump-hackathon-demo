# CLAUDE.md — Project Instructions

> Read this file before answering any question about this codebase.
> It contains context that is not obvious from the code alone.

> 💡 **สำหรับทีม (Dev B):** ถ้าคุยกับ Claude บนเว็บ (claude.ai) แทน Claude Code
> ให้ก้อปไฟล์นี้**ทั้งไฟล์**แปะเป็นข้อความแรกของบทสนทนา เพื่อให้ Claude เข้าใจ
> โปรเจกต์ตรงกัน — ส่วน Claude Code อ่านไฟล์นี้อัตโนมัติอยู่แล้ว ไม่ต้องแปะ
> (แทนที่ docs/CLUADE_INSTRUCTION.md เดิมซึ่งลบไปแล้วเพราะเนื้อหาซ้ำและเก่ากว่า)

---

## 1. What this project is

**IEP GEN** is a web app that helps Thai special education teachers produce IEP (Individualized Education Program) documents.

Teachers enter a student's profile **once** using structured dropdowns — no prompt writing — and the system generates three linked outputs:

1. **IEP goals** — measurable behavioral objectives
2. **Media/equipment requisition list** — items from Thailand's official บัญชี ก / บัญชี ข (Category A / B) subsidy lists, with written justifications
3. **IIP teaching methods** *(optional, only if time allows)*

Output is delivered two ways:
- **Copy buttons** → teacher pastes into the government SET system (a web form, field by field)
- **.docx export** → the physical document the IEP committee must sign

This is being built for the **JUMP THAILAND Hackathon 2026** (Empowering Teachers track).

---

## 2. Critical context: this is not a demo

**The hard deadline is not the hackathon submission. It is 31 July**, when our domain expert — a special education teacher with 26 years of experience — must produce real IEPs for her actual students.

The team already reached the final 6 at the regional bootcamp and lost to a team that had a working product with real user data. So the strategy this round is: **ship something a real teacher actually uses, and collect the evidence.**

**The single decision rule for this project:**

> If a feature does not help the teacher finish an IEP faster, cut it. Don't debate it.

When the developer asks you whether to add something, apply this rule first.

---

## 3. Who the users are

| User | Background | Design implication |
|---|---|---|
| **Special education teachers** | Master's degree in special education, know the technical vocabulary | Want speed, minimal hand-holding |
| **Teacher aides (พี่เลี้ยงเด็กพิการ)** | Minimum qualification is high school (M.6), no teaching background | UI must work with zero domain knowledge, needs explanations everywhere |

The second group is the harder constraint and the more important one. Thai law requires every school to produce IEPs for students with disabilities, and aides are legally required to produce them too — despite having no training. **Design for the aide, not the expert.**

---

## 4. The AI architecture — the most important thing to understand

The system deliberately **separates retrieval from generation**. Do not blur this line.

```
Structured input (dropdowns)
    ↓
RETRIEVAL — exact-match lookup in data/mappingTable.json
    NO AI. Deterministic. Returns only media items that are
    actually claimable under Thai government subsidy rules.
    ↓
GENERATION — LLM (Claude API) with few-shot prompting
    Receives the retrieved list as constrained context.
    Its ONLY job is to write natural bureaucratic Thai prose.
    It may NOT propose items outside the retrieved list.
    ↓
Persist to DB: store aiOriginal AND finalText separately
    ↓
HUMAN REVIEW — teacher edits, selects, approves
    ↓
Export / Copy — never auto-submits to government systems
```

### Why this matters

Media recommendations map to **real government budget claims**. A hallucinated item means a rejected claim and wasted teacher time. Rule-based retrieval makes hallucination structurally impossible in that path.

Few-shot examples come from **real IEP documents** (anonymized) so the LLM mimics genuine bureaucratic Thai phrasing rather than inventing plausible-sounding text.

### Rules you must enforce when writing code

- ❌ Never let the LLM choose which media/equipment to recommend
- ❌ Never auto-submit anything to a government system
- ❌ Never auto-fix a consistency warning — flag it, let the teacher decide
- ✅ Always present 2–3 goal options, never a single answer (preserves teacher judgement)
- ✅ Always show the reasoning behind a recommendation (no black box)

### The design philosophy behind it

The team's position is that **good AI should make people smarter, not more dependent**. Every recommendation carries its rationale so the user learns the underlying principle. This is a deliberate stance, not decoration — if you propose a change that removes explanations or reduces teacher decision points, flag the tradeoff.

---

## 5. Tech stack and why each was chosen

| Tech | Reason |
|---|---|
| **Next.js 14 (App Router)** | Frontend + API in one project. API keys must stay server-side; a separate Express server would mean two deployments for a 2-person team on an 8-day timeline. |
| **TypeScript** | `lib/types.ts` is the contract between the two devs. The compiler enforces it so a renamed field fails at build time, not while the teacher is using it. |
| **Tailwind CSS** | Fast UI without naming classes or switching files. Verbose JSX is an accepted tradeoff. |
| **Prisma + PostgreSQL** | Schema-as-code generates types automatically. Postgres (not SQLite) because Vercel is serverless — file-based DBs are wiped on redeploy. Supabase free tier. |
| **docx (npm)** | Server-side Word generation. Word not PDF, because committees edit the document before signing. |
| **Vercel** | Auto-deploy from `main`, plus a **preview URL per PR** — lets the teacher test a branch without touching the production instance she relies on for real work. |

### Deliberately NOT used

- **Auth libraries** — single user for now; adds complexity without speeding up IEP creation
- **Redux/Zustand** — state is shallow, `useState` is sufficient
- **Vector DB / embeddings** — data is structured; exact-match lookup is more accurate and faster than semantic search here
- **LangChain** — one LLM call site; a plain `fetch` is easier to read and debug
- **Docker** — Vercel handles it

If the developer asks about adding any of these, the default answer is no unless it directly serves the 31 July deadline.

---

## 6. Database design

Five tables. The non-obvious decisions:

**`Assessment` is separate from `Plan`** — Thai law requires plans be reviewed at least annually. Separating assessment from plan lets us track a student's development across years and regenerate only what changed. This is the main differentiator against competitors, who only offer downloadable templates with no memory.

**`aiOriginal` and `finalText` are stored separately on `PlanGoal`** (and `aiReason`/`finalReason` on `PlanMedia`). This is not redundancy — it makes the system automatically record what the teacher changed. That data is:
- Evidence for the hackathon application (how accurate is the AI?)
- Product insight (every edit marks a place the system underperformed)

**`Plan.createdAt` → `finalizedAt`** gives time-per-plan without manual stopwatch tracking.

**`PlanMedia.isApproved` defaults to `true` — intentional, not a bug.** Media items come from the rule-based retrieval (verified against the government subsidy lists), so the system proposes them ready-to-claim; the teacher's job is to *remove* items, not to tick every item on every plan (16 students × every plan would violate the "if it doesn't make the teacher faster, cut it" rule). If the teacher removes every item, a consistency warning in `lib/serializers.ts` asks her to confirm — do not "fix" this default to `false`.

The `/stats` page surfaces all of this. **Never "clean up" this apparent duplication.**

---

## 7. File ownership

Split by layer, not by feature, so both devs work in parallel without blocking.

```
Developer A (domain + AI)          Developer B (frontend + infra)
─────────────────────────          ──────────────────────────────
prisma/schema.prisma               app/page.tsx
app/api/**                         app/stats/page.tsx
lib/prompts.ts                     components/**
lib/retrieval.ts                   tailwind.config.ts
lib/serializers.ts
lib/db.ts
lib/pii-guard.ts  🔒
data/*.json

           ⚠️ lib/types.ts is SHARED
           Changing it requires telling the other dev first.
```

If you are helping Developer B, avoid editing files in A's column unless asked, and vice versa. If a change requires touching `lib/types.ts`, say so explicitly and remind them to notify their teammate.

---

## 8. Data contract

Both devs code against `lib/types.ts`. Key endpoints:

```
GET    /api/students           → StudentSummary[]
POST   /api/students           → create student (code only, never a real name)
POST   /api/plans              → CreatePlanRequest → PlanDTO
GET    /api/plans?studentId=   → PlanDTO[]
GET    /api/plans/[id]         → PlanDTO
PATCH  /api/plans/[id]         → UpdatePlanRequest → PlanDTO
GET    /api/plans/[id]/export  → .docx download
GET    /api/stats              → UsageStats
```

`PATCH` only ever writes to `finalText` / `finalReason` / `isSelected` / `isApproved` / `status`. It must never overwrite `aiOriginal` or `aiReason`.

---

## 9. Privacy architecture — the PII boundary

This system handles data about **children with disabilities** — among the most sensitive personal data categories under Thai PDPA.

The design separates two questions that are often conflated:

| Question | Answer |
|---|---|
| May we store PII in our own database? | **Yes** — the school already holds this data lawfully, and the exported IEP document legally requires it (name, ID number, guardian details, medical notes). Storing it is what saves the teacher from re-typing sections 1–4 every time. |
| May PII leave our system and reach the LLM API? | **Never** — the model does not need a child's name to draft a behavioral objective. |

### How the boundary is enforced

```
DB (Supabase / AIS Cloud)
├── 🔒 PII ZONE — fullName, nationalId, disabilityCardNo, birthDate,
│                 religion, disabilityDetail, fatherName, motherName,
│                 guardianName, guardianRelation, address, phone,
│                 schoolName, affiliation, medicalNote, educationHistory
│                 ↓ never crosses this line ↓
├══════════════ PII BOUNDARY ══════════════
│                 ↓ allowed through ↓
└── disabilityType, gradeLevel, abilityLevels, strengths
                  ↓
            LLM API (Claude)
                  ↓
    Goal text using the word "นักเรียน" — never a real name
                  ↓
    Export: PII pulled from DB, "นักเรียน" replaced with the real name
                  ↓
    Complete .docx — teacher fills in nothing by hand
```

`lib/pii-guard.ts` enforces this in code, not by convention:

- **`PII_FIELDS`** — the canonical list, must stay in sync with the PII ZONE block in `prisma/schema.prisma`. Add a PII column to the schema → add it here too.
- **`buildLLMSafePayload()`** — a **whitelist** builder. New schema fields don't leak by default because anything not explicitly listed is dropped.
- **`assertNoPII()`** — called immediately before every `fetch` to the LLM API. Throws if a PII field name appears anywhere in the serialized payload. This catches the classic mistake of spreading a Prisma object straight into a request body.
- **`scrubFreeText()`** — last-resort net over the one free-text field the teacher types herself (`strengths`). Strips Thai ID numbers, phone numbers, and name-prefixed strings (`เด็กชาย…`, `นาง…`).
- **`personalizeForExport()`** — runs on **our** side, after the LLM has returned, swapping `"นักเรียน"` for the real name in the .docx only.

The prompt in `lib/prompts.ts` instructs the model to always write `"นักเรียน"` instead of a name. That instruction is what makes the export-time substitution possible — **do not remove it.**

### Hard rules

- ❌ Never call the LLM API with anything other than the output of `buildLLMSafePayload()`
- ❌ Never remove or bypass the `assertNoPII()` call in `app/api/plans/route.ts`
- ❌ Never commit `.env` (contains DB credentials and API key)
- ❌ Never commit real student data — including in `data/fewShotExamples.json`. Anonymize first.
- ❌ Never put an API key in a client component. All LLM calls go through `app/api/**`.
- ❌ Never log PII (no `console.log(student)` — log IDs or codes instead)
- ✅ `DELETE /api/students/[id]` exists so data can be erased on request (PDPA)

### Why this is also a pitch asset

The honest version of the claim is precise and stronger than "we don't store anything": **not one child's name has ever been sent to an AI model, and the architecture makes it impossible to do so by accident** — while the teacher still gets a complete document with zero manual re-entry. That directly answers the concern teachers actually have about pasting student data into ChatGPT.

> ⚠️ Nobody on this team is a lawyer. Whether the school permits storing student data in an external system is a policy question for the school, especially before rolling out beyond a single teacher.

---

## 10. Development mode

The app runs without an LLM API key — `app/api/plans/route.ts` returns mock data when `ANTHROPIC_API_KEY` is absent or `USE_MOCK=true`. Developer B can build the entire UI without waiting for the AI layer.

`DATABASE_URL` **is** required (Supabase or Neon free tier), and so is `DIRECT_URL` for `db:push`.

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL + DIRECT_URL
npm run db:push           # create tables
npm run dev
```

Env notes (learned the hard way):
- Use **`.env`, not `.env.local`** — the Prisma CLI (`db:push`, `studio`) only reads `.env`; Next.js reads both, so one file covers everything.
- `DATABASE_URL` goes through Supabase's transaction pooler (port 6543) and must end with `?pgbouncer=true&connection_limit=1`. `DIRECT_URL` (port 5432) is what `db:push`/migrations use — running DDL through the transaction pooler hangs indefinitely.
- On Vercel, set **both** `DATABASE_URL` and `DIRECT_URL` as environment variables, or the deploy build fails.

Before pushing: `npm run build` — if the build fails, Vercel can't deploy.

---

## 11. Git workflow

- Never push directly to `main` — `main` is what the teacher uses for real work
- Branch naming: `feat/…`, `fix/…`, `data/…`
- Open a PR, merge without waiting for approval (2-person team), **but tell your teammate what you merged**
- Every PR gets a Vercel preview URL — use it for user testing
- Merge and test together at the end of every working day; never let integration slip to the last day

---

## 12. Answered questions (confirmed with the domain expert)

1. **SET system: file import or manual entry?** → **Confirmed: manual entry only, field by field.** No import feature exists. This validates the copy-button design — do not build SET file import.
2. **Coupon system: same as SET or separate?** → **Confirmed: separate system** ("ระบบคูปองออนไลน์ของศูนย์การศึกษาพิเศษ"). This means the media/equipment recommendations need their own copy target distinct from the IEP goals — the UI already separates these into two copy buttons, which is correct. Do not merge them into a single export blob.
3. **Which disability types are needed?** → **All four, not two.** The teacher has 16 students total across:
   - Autism (ออทิสติก) — mapping table ready
   - Learning disabilities / LD (บกพร่องทางการเรียนรู้) — mapping table ready
   - Intellectual disability (บกพร่องทางสติปัญญา) — mapping table added, **not yet validated with the teacher**
   - Speech and communication (บกพร่องทางภาษาและการสื่อสาร) — mapping table added, **not yet validated with the teacher**

   The `intellectual` and `speech` entries in `data/mappingTable.json` were drafted from a media-bank reference document, not confirmed line-by-line with the teacher yet. Treat them as a first draft — if the teacher flags a specific item as wrong or missing, fix the JSON directly, don't just note it.

4. **Baseline time per IEP?** → **1–2+ days per student** when adjusting standards/indicators across all subjects. This is significantly higher than the earlier placeholder ("half a day"). Use this updated number anywhere a time-savings claim is made (pitch deck, `/stats` page copy, etc.) — **do not use the old "half a day" figure anymore.**

   Rough scope math: 16 students × 1–2 days = 16–32 working days/year spent on IEP writing alone. This is a strong number for the pitch; if you're asked to help with pitch content, prefer this real figure over the earlier competitor-sourced estimate.

## 13. Still open — do not guess these

1. **Item codes (รหัส) for the media/equipment catalog.** Real forms reference codes like `BE1784` for specific items (confirmed from real documents: "หนังสือภาพคำศัพท์พร้อมปากกา" = `BE1784`, seen requested for two different disability types). We only have one confirmed code. `data/mappingTable.json` does not yet have a `code` field — adding one is a nice-to-have, not urgent, since the export currently leaves that column blank for manual entry.
2. **Provider/method/amount fields for coupon requests** (ผู้จัดหา, วิธีการ, จำนวนเงินที่ขออุดหนุน). The real form tracks who supplies each item (parent/school/hospital) and by what mechanism (subsidy/loan), plus a requested baht amount. The system does not currently collect this — the .docx export leaves these columns blank for the teacher to fill by hand. Confirm with the teacher whether this is worth automating before adding it.
3. ~~Whether the export should include sections 1–4~~ — **resolved 24 July.** Sections 1–4 are now populated from the PII fields on `Student` (see §9). The teacher enters them once when adding a student; every subsequent plan and every annual review reuses them.

## 14. Real document structure (confirmed 24 July from 4 real anonymized IEP examples)

The developer received 4 real filled-in IEP documents from the school (บ้านสันโค้ง, เชียงรายจรูญราษฎร์, สพป.ชร.เขต1) covering autism, intellectual disability (×2), and speech/language. **The raw files contain real student names, national ID numbers, addresses, and phone numbers — they must never be committed to this repo.** Only the anonymized structural patterns extracted from them live in `data/fewShotExamples.json` and the export template.

### What was confirmed

- **Section 5** (แนวทางการศึกษา) is organized by domain/subject, not as a flat goal list. Real domains seen: ทักษะกล้ามเนื้อมัดเล็ก/มัดใหญ่, ทักษะการสื่อสาร, ทักษะการช่วยเหลือตนเอง, ทักษะทางสังคม, และทักษะทางวิชาการแยกตามกลุ่มสาระ (ภาษาไทย อ้างอิงมาตรฐานตัวชี้วัด เช่น "ท 1.1 ป.1/1", คณิตศาสตร์ ฯลฯ). Each row states **จุดเด่น** (strengths) and **จุดที่ควรพัฒนา** (areas to develop) before the goal — this pairing is now reflected in the system prompt (`lib/prompts.ts`) and in `data/fewShotExamples.json`, which was rewritten with real (anonymized) examples across these domains.
- **Real evaluation-criterion phrasing** follows patterns like "ได้ถูกต้องอย่างน้อย 3 ใน 5 ครั้ง", "ผ่านเกณฑ์การประเมินอย่างน้อยร้อยละ 50", "ภายในวันที่ 31 มีนาคม [ปี]" — the system prompt now instructs the LLM to match these patterns, not generic phrasing.
- **Section 6** (สิ่งอำนวยความสะดวก) has more columns than our schema captures: รหัส (item code), ผู้จัดหา×วิธีการ for both "มีอยู่แล้ว" and "ต้องการ", จำนวนเงินที่ขออุดหนุน, เหตุผลและความจำเป็น, ผู้ประเมิน. The exported .docx (`app/api/plans/[id]/export/route.ts`) now renders this table with the real column headers, leaving unmapped fields (code, provider, method, amount) as blank lines for manual completion rather than inventing data we don't collect.
- **Section 7** lists exactly **four** committee signatories: ผู้บริหารสถานศึกษา/ผู้แทน, บิดา มารดา หรือผู้ปกครอง, ครูผู้รับผิดชอบ, ครูประจำชั้น — not three as originally assumed. Export template updated to match.
- **Section 8** is a parent consent block (เห็นด้วย/ไม่เห็นด้วย + signature) — present in export template.
- Sections 1–4 (identifying info, medical history, education history) are **not generated by this system** — by design, per §9. The export leaves them as a labeled placeholder for the teacher to complete by hand from the school's existing paper records before combining into the final document.

### What this changes going forward

If real example plans surface for the two disability types added speculatively (`intellectual`, `speech` in `data/mappingTable.json`), replace the placeholder entries with confirmed ones the same way — anonymize first, extract structure and phrasing, discard the rest.

---

## 15. Scope discipline

**In scope for this round:**
- Student profiles persisted in DB
- Structured assessment input
- **4 disability types**: autism, learning disabilities, intellectual disability, speech/communication — these cover all 16 real students. Do not build out the remaining 5 SET categories unless asked.
- AI-generated goals (2–3 options) + media recommendations with justifications
- Teacher editing and approval
- .docx export
- Copy buttons (kept as **two separate buttons** — IEP goals target the SET system, media recommendations target the separate coupon system. Do not merge these into one blob.)
- Usage stats page

**Explicitly out of scope:**
- Login / multi-user accounts
- All nine disability types (only what the user needs now)
- Direct integration with the SET or coupon systems
- Admin dashboards
- Mobile-optimized layouts
- PDF export

If a request falls outside this list, ask whether it helps meet the 31 July deadline before implementing it.

---

## 16. Definition of done

- [ ] The teacher opens the site from home or school and uses it **without help from the developers**
- [ ] She produces goals and a media list she confirms are **usable in real work**
- [ ] She exports a .docx that functions as the real document
- [ ] Data survives a browser close and reopen
- [ ] `/stats` shows numbers usable as evidence in the application

---

## 17. How to respond in this repo

- Answer in **Thai** unless asked otherwise — the developers work in Thai. Code, comments, and identifiers stay in English (existing code comments are in Thai; match the file you're editing).
- Prefer the smallest change that works. This codebase has 8 days of life before its most important deadline.
- When a request conflicts with a principle in this file (especially §4 AI architecture and §9 privacy), say so directly instead of silently complying.
- If something in this file is out of date relative to the code, mention it.


- Never add Co-Authored-By lines or "Generated with Claude Code" to commit messages.