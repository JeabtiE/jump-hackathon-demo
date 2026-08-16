# IEP GEN

AI-assisted generation of Individualized Education Programs (IEPs) for Thai special education teachers.

Built for **JUMP THAILAND Hackathon 2026** (Empowering Teachers track).

## The problem

Thai law requires every school to produce an Individualized Education Program for each student with a disability, reviewed at least once a year. In practice, drafting a single IEP by hand — adjusting behavioral objectives, curriculum indicators, and equipment requisitions across every subject — takes a special education teacher **1–2+ days per student**. Many schools also rely on teacher aides with no special-education training to help produce these documents, despite being legally required to do so.

IEP GEN lets a teacher enter a student's profile once, using structured dropdowns instead of free-text prompts, and generates:

1. **IEP goals** — measurable behavioral objectives, grounded in the official Thai national curriculum indicators
2. **Media/equipment recommendations** — items from Thailand's official บัญชี ก / บัญชี ข (Category A/B) subsidy catalog, with written justifications
3. A **.docx export** matching the real committee-signed IEP document format, and **copy buttons** for pasting into the government SET system

## Design principles

- **Retrieval before generation.** Which curriculum indicators and which subsidized equipment a student is eligible for is decided by deterministic, rule-based lookup against official government data files — never by the LLM. The model's only job is to phrase natural, bureaucratically-correct Thai prose from a list it's already been given. It can narrow that list to what fits the plan's goals, but it can never propose an item or a code that wasn't handed to it.
- **No child's name ever reaches the LLM.** Personally identifiable information is stored in the database (the school already holds it lawfully, and the exported document legally requires it), but a whitelist boundary (`lib/pii-guard.ts`) guarantees it never leaves the system in a request to the AI API. Names are substituted back into the document only at export time, on our own server.
- **The teacher stays in control.** The system always presents multiple goal options rather than a single answer, always shows its reasoning, and never auto-submits anything to a government system. Every AI-drafted goal and every AI-drafted justification is stored alongside the teacher's final, edited version — so the system can measure its own accuracy over time instead of operating as a black box.

## Tech stack

| | |
|---|---|
| Framework | Next.js 14 (App Router) — frontend and API routes in one deployment |
| Language | TypeScript |
| Database | PostgreSQL (via Prisma), hosted on Supabase |
| AI | Claude API (Anthropic), few-shot prompted against real (anonymized) IEP examples |
| Document export | `docx` (Node) |
| Styling | Tailwind CSS |
| Hosting | Vercel, with a preview deployment per pull request |

## Getting started

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL, DIRECT_URL, and ANTHROPIC_API_KEY
npm run db:push           # create tables
npm run dev
```

The app works without an Anthropic API key: if `ANTHROPIC_API_KEY` is unset (or `USE_MOCK=true`), API routes return mock data so the frontend can be developed independently of the AI layer. A database connection is still required.

## Project structure

```
app/
  page.tsx                        student list + plan creation flow
  stats/page.tsx                  usage statistics dashboard
  api/
    students/                     student CRUD
    plans/                        plan creation, editing, .docx export
    stats/                        usage statistics endpoint

components/                       shared UI components

lib/
  types.ts                        shared request/response types (frontend + API contract)
  prompts.ts                      LLM system prompts
  retrieval.ts                    rule-based media/equipment lookup
  curriculum-retrieval.ts         rule-based curriculum indicator lookup
  pii-guard.ts                    PII whitelist enforcement before any LLM call
  serializers.ts, db.ts

prisma/
  schema.prisma                   database schema

data/
  mappingTable.json               curated media/equipment catalog served to retrieval
  mediaCatalog2568.json           full official government catalog (688 items)
  curriculum.json                 national curriculum indicators (Thai, Math)
  fewShotExamples.json            anonymized real IEP excerpts used for few-shot prompting
  goalMediaPairs.json             anonymized real goal→media pairings

scripts/                          data-pipeline and verification scripts (see below)
```

## Data pipeline

The media/equipment and curriculum indicator data files are derived from official government source documents through a small set of scripts, rather than hand-edited:

```
official PDF (not committed to the repo)
   ↓ scripts/parse_catalog.py
data/mediaCatalog2568.json          the full official catalog
   ↓ scripts/fix_media_catalog.mjs  (npm run fix:media, idempotent)
   ↓ scripts/build_mapping.py       curated selection
data/mappingTable.json              what the app actually serves
   ↓ scripts/validate_media_catalog.mjs  (npm run validate:media)
```

`data/curriculum.json` is produced similarly via `parse_curriculum.py` / `build_curriculum.py`, with `scripts/verify_math_text_repair.mjs` (`npm run verify:math`) mechanically verifying a font-encoding repair applied to the Math indicator text.

Source PDFs are intentionally excluded from version control; the generator scripts remain in the repo so the derived JSON files can be rebuilt or re-verified without needing the original documents on hand.

## Available scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build (also runs `prisma generate`) |
| `npm run db:push` | Push the Prisma schema to the database |
| `npm run db:studio` | Open Prisma Studio |
| `npm run test:api` | API integration smoke tests |
| `npm run test:pii` | Verifies no PII field ever reaches the LLM request payload |
| `npm run test:warnings` | Consistency-warning logic tests |
| `npm run test:curriculum` | Curriculum indicator retrieval tests |
| `npm run validate:media` | Validates `mappingTable.json` against the official catalog |
| `npm run verify:math` | Verifies the Math curriculum text repair changed nothing it shouldn't |
| `npm run fix:media` | Rebuilds the media catalog from its intermediate JSON (idempotent) |

## Scope

**In scope:** four disability types (autism, learning disabilities, intellectual disability, speech/communication), AI-generated goals and media recommendations with teacher review and editing, .docx export, and a usage statistics page.

**Out of scope for this round:** authentication/multi-user accounts, all nine official SET disability categories, direct integration with government systems, and PDF export. The system is a single-teacher tool by design; it complements the existing manual-entry government workflow rather than replacing it.

## Privacy

This system handles data about children with disabilities — a sensitive personal data category under Thailand's PDPA. See `lib/pii-guard.ts` for the enforcement mechanism. Data storage and processing decisions here are made per this project's own risk assessment, not as legal advice; a school evaluating this system for real use should make its own determination in consultation with its data protection obligations.
