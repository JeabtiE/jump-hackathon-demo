# CLAUDE.md — Project Instructions

> Read this file before answering any question about this codebase.
> It contains context that is not obvious from the code alone.

---

## 1. What this project is

**IEP GO** is a web app that helps Thai special education teachers produce IEP (Individualized Education Program) documents.

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

## 9. Privacy rules — non-negotiable

This system handles data about **children with disabilities** — among the most sensitive personal data categories under Thai PDPA.

- ❌ Never store a student's real name. Students are identified by a code the teacher assigns (`A-01`, `B-02`).
- ❌ Never send names, ages, or school names to the LLM API. Only disability type and ability levels go out.
- ❌ Never commit `.env.local` (contains DB credentials and API key).
- ❌ Never commit real student data — including in `data/fewShotExamples.json`. Anonymize before committing.
- ❌ Never put an API key in a client component. All LLM calls go through `app/api/**`.

If asked to add logging, analytics, or error reporting, check that no student data leaks into it.

This is also a pitch asset: the team can say the product was privacy-by-design from the first prototype because it was tested on real data from day one.

---

## 10. Development mode

The app runs without an LLM API key — `app/api/plans/route.ts` returns mock data when `ANTHROPIC_API_KEY` is absent or `USE_MOCK=true`. Developer B can build the entire UI without waiting for the AI layer.

`DATABASE_URL` **is** required (Supabase or Neon free tier).

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL
npm run db:push              # create tables
npm run dev
```

Before pushing: `npm run build` — if the build fails, Vercel can't deploy.

---

## 11. Git workflow

- Never push directly to `main` — `main` is what the teacher uses for real work
- Branch naming: `feat/…`, `fix/…`, `data/…`
- Open a PR, merge without waiting for approval (2-person team), **but tell your teammate what you merged**
- Every PR gets a Vercel preview URL — use it for user testing
- Merge and test together at the end of every working day; never let integration slip to the last day

---

## 12. Open questions — do not guess these

These are pending validation with the domain expert. If code depends on them, flag the assumption rather than inventing an answer:

1. **Does the government SET system accept file import, or must fields be typed one by one?** The current design assumes typing, which is why copy buttons exist. If import is possible, the export format needs to change.
2. **What exact section headings does the school's real IEP form use?** The structure in `app/api/plans/[id]/export/route.ts` is based on standard SET headings and has not been verified against the actual form.
3. **Which disability types are needed first?** `data/mappingTable.json` currently covers only autism and learning disabilities (LD). Other types must be added before they can be selected.
4. **What is the baseline time to produce one IEP manually?** Needed for before/after comparison. Without it the `/stats` numbers have nothing to compare against.

---

## 13. Scope discipline

**In scope for this round:**
- Student profiles persisted in DB
- Structured assessment input
- AI-generated goals (2–3 options) + media recommendations with justifications
- Teacher editing and approval
- .docx export
- Copy buttons
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

## 14. Definition of done

- [ ] The teacher opens the site from home or school and uses it **without help from the developers**
- [ ] She produces goals and a media list she confirms are **usable in real work**
- [ ] She exports a .docx that functions as the real document
- [ ] Data survives a browser close and reopen
- [ ] `/stats` shows numbers usable as evidence in the application

---

## 15. How to respond in this repo

- Answer in **Thai** unless asked otherwise — the developers work in Thai. Code, comments, and identifiers stay in English (existing code comments are in Thai; match the file you're editing).
- Prefer the smallest change that works. This codebase has 8 days of life before its most important deadline.
- When a request conflicts with a principle in this file (especially §4 AI architecture and §9 privacy), say so directly instead of silently complying.
- If something in this file is out of date relative to the code, mention it.
