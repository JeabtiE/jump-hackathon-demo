/**
 * ฟอร์มกรอกระดับความสามารถ — คน B ดูแล
 *
 * 🔑 free-text-first: ครูพิมพ์บรรยายความสามารถเด็กด้วยภาษาของตัวเอง
 *    AI (/api/assess/classify) แปลงเป็นค่า enum มาแสดงเป็น "ข้อเสนอ" บน chip
 *    dropdown เดิมยังอยู่ครบ แต่ถูกซ่อนไว้หลังลิงก์ "ไม่ใช่? แก้ระดับ" — โผล่เฉพาะตอนแก้
 *
 * เส้นที่ห้ามข้าม (CLAUDE.md)
 *   - retrieval ใช้ abilityLevels (ค่า enum ที่ยืนยันแล้ว) เท่านั้น
 *     ข้อความดิบ (abilityFreeText) ส่งไปเป็น context/audit ไม่ใช่ตัวค้นสื่อ
 *   - AI แค่เสนอ: confidence "low" หรือตีความไม่ได้ → ไม่กรอกค่าให้เอง
 *     เตือนแล้วให้ครูเลือกเองตรงจุดนั้น (ไม่ auto-fix warning)
 *
 * ✏️ เฟส 3
 *   1. <select> ต่อ domain → <textarea> + chip ผลจัดระดับ
 *   2. loading แยกราย domain — ระหว่างรอ AI ครูพิมพ์ด้านอื่นต่อได้ ไม่บล็อกฟอร์ม
 *   3. ส่ง abilityFreeText ไปพร้อม abilityLevels ตอนกด "สร้างแผน"
 *
 * ✏️ เฟส 4 — ส่ง abilityLevelsAiSuggested (ค่าที่ AI เสนอต่อ domain) ไปด้วย
 *    เก็บเป็นหลักฐานว่าครูยืนยันตามที่ AI เสนอ หรือแก้เอง — audit อย่างเดียว
 *    ไม่ใช่ค่าที่ retrieval/generation ใช้
 */

"use client";

import { useCallback, useRef, useState } from "react";
import { ABILITY_OPTIONS } from "@/lib/ability-options";
import type {
  AbilityClassification,
  AbilityFreeText,
  AbilityLevels,
} from "@/lib/types";

const CURRENT_YEAR = String(new Date().getFullYear() + 543);

type DomainDef = (typeof ABILITY_OPTIONS)[string][number];

/** ยกตัวอย่างจาก options จริงของด้านนั้น — ช่วยพี่เลี้ยงที่ไม่มีศัพท์เฉพาะทาง */
function buildPlaceholder(d: DomainDef): string {
  const samples = d.options.slice(0, 2).map((o) => o.label);
  return samples.length > 0
    ? `เช่น ${samples.join(" / ")}`
    : "พิมพ์บรรยายว่าเด็กทำอะไรได้ / ยังทำไม่ได้ในด้านนี้";
}

function labelOf(d: DomainDef, value: string): string {
  return d.options.find((o) => o.value === value)?.label ?? value;
}

export default function AssessmentForm({
  disabilityType,
  onSubmit,
  loading,
}: {
  disabilityType: string;
  onSubmit: (payload: {
    abilityLevels: AbilityLevels;
    abilityFreeText: AbilityFreeText;
    /** ค่าที่ classifier เสนอต่อ domain ก่อนครูแก้ — audit อย่างเดียว */
    abilityLevelsAiSuggested: Record<string, string>;
    strengths: string;
    academicYear: string;
    term: string;
  }) => void;
  loading: boolean;
}) {
  /** ค่าที่ยืนยันแล้ว — ค่าเดียวที่จะถูกส่งไป retrieval */
  const [abilityLevels, setAbilityLevels] = useState<Record<string, string>>({});
  /** ข้อความที่ครูพิมพ์ต่อ domain */
  const [freeText, setFreeText] = useState<Record<string, string>>({});
  /** ผลที่ AI เสนอต่อ domain (null = ยังไม่มี / เรียกไม่สำเร็จ) */
  const [results, setResults] = useState<
    Record<string, AbilityClassification | null>
  >({});
  const [classifying, setClassifying] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  /** เผย dropdown เฉพาะ domain ที่ครูกดแก้ หรือที่ AI ไม่มั่นใจ */
  const [pickerOpen, setPickerOpen] = useState<Record<string, boolean>>({});
  /** ครูเลือกระดับเองที่ domain นี้ — ห้าม auto-classify ทับ (กดปุ่มเองได้) */
  const [manual, setManual] = useState<Record<string, boolean>>({});

  const [strengths, setStrengths] = useState("");
  const [academicYear, setAcademicYear] = useState(CURRENT_YEAR);
  const [term, setTerm] = useState("1");

  /** ลำดับ request ต่อ domain — ผลเก่าที่มาช้ากว่าถูกทิ้ง ไม่เขียนทับผลใหม่ */
  const seqRef = useRef<Record<string, number>>({});
  /** ข้อความล่าสุดที่ยิงไปแล้ว — กัน onBlur ยิงซ้ำทั้งที่ครูไม่ได้แก้อะไร */
  const sentTextRef = useRef<Record<string, string>>({});

  const domains = ABILITY_OPTIONS[disabilityType] ?? [];
  const hasAnyAbility = Object.values(abilityLevels).some(Boolean);

  const classify = useCallback(
    async (domain: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const seq = (seqRef.current[domain] ?? 0) + 1;
      seqRef.current[domain] = seq;
      sentTextRef.current[domain] = trimmed;

      setClassifying((p) => ({ ...p, [domain]: true }));
      setErrors((p) => ({ ...p, [domain]: "" }));

      try {
        const res = await fetch("/api/assess/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ disabilityType, domain, text: trimmed }),
        });
        const data = await res.json();
        if (seqRef.current[domain] !== seq) return; // ผลเก่ามาช้า — ทิ้ง

        if (!res.ok) {
          setResults((p) => ({ ...p, [domain]: null }));
          setErrors((p) => ({
            ...p,
            [domain]: data?.error ?? "จัดระดับไม่สำเร็จ กรุณาเลือกระดับเอง",
          }));
          setPickerOpen((p) => ({ ...p, [domain]: true }));
          return;
        }

        const result = data as AbilityClassification;
        setResults((p) => ({ ...p, [domain]: result }));
        setManual((p) => ({ ...p, [domain]: false }));

        if (result.suggestedLevel && result.confidence === "high") {
          // มั่นใจ → ขึ้น chip เป็นค่าที่ยืนยันแล้ว ครูกด "ไม่ใช่? แก้ระดับ" ได้ตลอด
          setAbilityLevels((p) => ({
            ...p,
            [domain]: result.suggestedLevel as string,
          }));
          setPickerOpen((p) => ({ ...p, [domain]: false }));
        } else {
          // ไม่มั่นใจ → ไม่กรอกค่าให้ เตือนแล้วเผยตัวเลือกให้ครูตัดสินตรงนั้น
          setAbilityLevels((p) => {
            const next = { ...p };
            delete next[domain];
            return next;
          });
          setPickerOpen((p) => ({ ...p, [domain]: true }));
        }
      } catch {
        if (seqRef.current[domain] !== seq) return;
        setResults((p) => ({ ...p, [domain]: null }));
        setErrors((p) => ({
          ...p,
          [domain]: "เชื่อมต่อระบบจัดระดับไม่สำเร็จ กรุณาเลือกระดับเอง",
        }));
        setPickerOpen((p) => ({ ...p, [domain]: true }));
      } finally {
        if (seqRef.current[domain] === seq) {
          setClassifying((p) => ({ ...p, [domain]: false }));
        }
      }
    },
    [disabilityType],
  );

  function handleBlur(domain: string) {
    const trimmed = (freeText[domain] ?? "").trim();
    // ครูเลือกระดับเองไว้แล้ว → ไม่ยิงอัตโนมัติทับการตัดสินใจของครู
    if (!trimmed || manual[domain]) return;
    if (sentTextRef.current[domain] === trimmed) return;
    classify(domain, trimmed);
  }

  function pickLevel(domain: string, value: string) {
    setManual((p) => ({ ...p, [domain]: true }));
    setErrors((p) => ({ ...p, [domain]: "" }));
    setAbilityLevels((p) => {
      const next = { ...p };
      if (value) next[domain] = value;
      else delete next[domain];
      return next;
    });
    if (value) setPickerOpen((p) => ({ ...p, [domain]: false }));
  }

  function handleSubmit() {
    const levels: Record<string, string> = {};
    for (const [domain, value] of Object.entries(abilityLevels)) {
      if (value) levels[domain] = value;
    }
    const texts: AbilityFreeText = {};
    for (const [domain, text] of Object.entries(freeText)) {
      const trimmed = text.trim();
      if (trimmed) texts[domain] = trimmed;
    }
    // ค่าที่ AI เสนอไว้ล่าสุดต่อ domain (รวมที่ confidence low ซึ่งไม่ได้ถูกกรอกให้)
    // — ส่งไปเก็บเป็นหลักฐานว่าครูยืนยันตรงกับที่ AI เสนอหรือแก้เอง
    const aiSuggested: Record<string, string> = {};
    for (const [domain, result] of Object.entries(results)) {
      if (result?.suggestedLevel) aiSuggested[domain] = result.suggestedLevel;
    }
    onSubmit({
      abilityLevels: levels,
      abilityFreeText: texts,
      abilityLevelsAiSuggested: aiSuggested,
      strengths,
      academicYear,
      term,
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="font-semibold text-slate-900">ระดับความสามารถปัจจุบัน</h2>
        <p className="mt-1 text-xs text-slate-500">
          พิมพ์บรรยายด้วยภาษาของครูได้เลย ระบบจะช่วยจัดเป็นระดับให้ แล้วครูตรวจอีกที
        </p>
      </div>

      {domains.length === 0 ? (
        <p className="text-sm text-amber-600">
          ยังไม่มีข้อมูลสำหรับความพิการประเภทนี้ — คน A ต้องเพิ่มใน
          mappingTable.json ก่อน
        </p>
      ) : (
        <div className="space-y-5">
          {domains.map((d) => {
            const text = freeText[d.domain] ?? "";
            const busy = !!classifying[d.domain];
            const result = results[d.domain] ?? null;
            const err = errors[d.domain] ?? "";
            const confirmed = abilityLevels[d.domain] ?? "";
            const open = !!pickerOpen[d.domain];
            const isManual = !!manual[d.domain];
            const needsTeacher = !busy && !confirmed && (!!result || !!err);

            return (
              <div key={d.domain}>
                <label
                  htmlFor={`ability-${d.domain}`}
                  className="mb-1 block text-xs font-medium text-slate-600"
                >
                  {d.label}
                </label>
                {d.hint && (
                  <p className="mb-1 text-xs text-slate-400">{d.hint}</p>
                )}

                <textarea
                  id={`ability-${d.domain}`}
                  value={text}
                  onChange={(e) =>
                    setFreeText((p) => ({ ...p, [d.domain]: e.target.value }))
                  }
                  onBlur={() => handleBlur(d.domain)}
                  rows={2}
                  placeholder={buildPlaceholder(d)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />

                {text.trim() && (
                  <button
                    type="button"
                    onClick={() => classify(d.domain, text)}
                    disabled={busy}
                    className="mt-1 text-xs text-teal-700 underline underline-offset-2 hover:text-teal-800 disabled:cursor-not-allowed disabled:text-slate-400"
                  >
                    {result || err
                      ? "ให้ AI จัดระดับใหม่อีกครั้ง"
                      : "ให้ AI ช่วยจัดระดับ"}
                  </button>
                )}

                {/* chip ผลจัดระดับ — loading เฉพาะด้านนี้ ด้านอื่นพิมพ์ต่อได้ */}
                {busy && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-teal-500" />
                    กำลังจัดระดับด้านนี้...
                  </div>
                )}

                {!busy && confirmed && (
                  <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
                    <p className="text-xs font-medium text-teal-900">
                      {isManual ? "ครูเลือกเอง: " : "ระบบเข้าใจว่า: "}
                      {labelOf(d, confirmed)}
                    </p>
                    {!isManual && result?.rationale && (
                      <p className="mt-0.5 text-xs text-teal-700">
                        {result.rationale}
                      </p>
                    )}
                    {!open && (
                      <button
                        type="button"
                        onClick={() =>
                          setPickerOpen((p) => ({ ...p, [d.domain]: true }))
                        }
                        className="mt-1 text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700"
                      >
                        ไม่ใช่? แก้ระดับ
                      </button>
                    )}
                  </div>
                )}

                {needsTeacher && (
                  <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                    <p className="text-xs font-medium text-amber-900">
                      ⚠️ ช่วยเลือกระดับให้หน่อย
                    </p>
                    <p className="mt-0.5 text-xs text-amber-700">
                      {err ||
                        result?.rationale ||
                        "ระบบยังตีความข้อความนี้เป็นระดับไม่ได้"}
                    </p>
                  </div>
                )}

                {/* dropdown เดิม — โผล่เฉพาะตอนแก้ / ตอนระบบไม่มั่นใจ */}
                {open ? (
                  <select
                    value={confirmed}
                    onChange={(e) => pickLevel(d.domain, e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">— เลือกระดับ —</option>
                    {d.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  !confirmed &&
                  !busy && (
                    <button
                      type="button"
                      onClick={() =>
                        setPickerOpen((p) => ({ ...p, [d.domain]: true }))
                      }
                      className="mt-1 block text-xs text-slate-400 underline underline-offset-2 hover:text-slate-600"
                    >
                      เลือกระดับเอง
                    </button>
                  )
                )}
              </div>
            );
          })}

          <p className="text-xs text-amber-600">
            ⚠️ ห้ามพิมพ์ชื่อจริงหรือข้อมูลระบุตัวตนของเด็กในช่องบรรยาย
          </p>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs text-slate-500">
          จุดเด่น / สิ่งที่ทำได้ (ไม่บังคับ)
        </label>
        <textarea
          value={strengths}
          onChange={(e) => setStrengths(e.target.value)}
          rows={2}
          placeholder="เช่น ชอบวาดภาพ จดจำภาพได้ดี"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-amber-600">
          ⚠️ ห้ามกรอกชื่อจริงหรือข้อมูลระบุตัวตน
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500">
            ปีการศึกษา
          </label>
          <input
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">ภาคเรียน</label>
          <select
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || !hasAnyAbility}
        className="w-full rounded-lg bg-teal-600 px-4 py-2.5 font-medium text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {loading ? "กำลังสร้าง..." : "สร้างแผน"}
      </button>
      {!hasAnyAbility && domains.length > 0 && (
        <p className="text-center text-xs text-slate-400">
          ต้องมีระดับความสามารถที่ยืนยันแล้วอย่างน้อย 1 ด้านก่อน
        </p>
      )}
    </div>
  );
}
