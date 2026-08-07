/**
 * scripts/test-warnings.mjs — unit test ของ consistency warnings (rule-based)
 *
 * รันได้เลยไม่ต้องเปิด server / ไม่ต้องมี DB: npm run test:warnings
 * (Node ≥ 23.6 strip type ของ lib/serializers.ts ให้เอง)
 *
 * ครอบคลุมทั้งเคสที่กฎต้อง fire และเคสที่ห้าม fire (กัน false positive)
 * ส่วนการทดสอบผ่าน HTTP จริงอยู่ใน test-api.mjs ขั้นที่ 7
 */

import {
  buildConsistencyWarnings,
  findMismatchedYears,
  hasMeasurableNumber,
  findChildNamePrefix,
  parsePriceBaht,
  buildAnnualContext,
  buildAnnualContextsByPlan,
  sumApprovedMedia,
  EMPTY_ANNUAL,
} from "../lib/serializers.ts";

let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}`);
    console.error(`     คาด: ${JSON.stringify(expected)}`);
    console.error(`     ได้:  ${JSON.stringify(actual)}`);
  }
}

/** goal/media/plan พื้นฐานที่ "ถูกต้องครบ" — ต้องไม่มี warning เลย */
function makeGoal(overrides = {}) {
  return {
    id: "g1",
    aiOriginal: "นักเรียนสามารถหยิบบัตรพยัญชนะไทยได้ถูกต้องอย่างน้อย 3 ใน 5 ครั้ง",
    finalText: "นักเรียนสามารถหยิบบัตรพยัญชนะไทยได้ถูกต้องอย่างน้อย 3 ใน 5 ครั้ง",
    criterion: "3 ใน 5 ครั้ง",
    timeframe: "ภายในวันที่ 31 มีนาคม 2570",
    isSelected: true,
    ...overrides,
  };
}

function makeMedia(overrides = {}) {
  return {
    id: "m1",
    code: "BN0104",
    item: "บัตรภาพ",
    category: "ข",
    price: "150 บาท/กล่อง",
    mode: "ขอรับ",
    aiReason: "ช่วยการสื่อสารทางเลือก",
    finalReason: "ช่วยการสื่อสารทางเลือก",
    isApproved: true,
    ...overrides,
  };
}

function makePlan(overrides = {}) {
  return {
    academicYear: "2569",
    goals: [makeGoal()],
    media: [makeMedia()],
    ...overrides,
  };
}

const warningsOf = (plan) => buildConsistencyWarnings(plan);
const hasWarn = (plan, substr) => warningsOf(plan).some((w) => w.includes(substr));

// ═════════ baseline: แผนถูกต้องครบ ═════════

console.log("\n── baseline ──");
check("แผนถูกต้องครบ → ไม่มี warning เลย", warningsOf(makePlan()), []);

// ═════════ กฎ 1: ปี พ.ศ. ไม่ตรงปีการศึกษา ═════════

console.log("\n── กฎ 1: ปี พ.ศ. ไม่ตรงปีการศึกษา ──");

check(
  "findMismatchedYears: ปี 2568 ในแผนปี 2569 → เจอ",
  findMismatchedYears("ภายในวันที่ 31 มีนาคม 2568", "2569"),
  ["2568"]
);
check(
  "findMismatchedYears: ปี 2569 และ 2570 (ปีแผน+ปีถัดไป) → ไม่เจอ",
  findMismatchedYears("ปีการศึกษา 2569 สิ้นสุด 31 มีนาคม 2570", "2569"),
  []
);
check(
  "findMismatchedYears: ปีหลักสูตร 2551 อยู่ใน whitelist → ไม่เจอ",
  findMismatchedYears("ตามหลักสูตรแกนกลาง พ.ศ. 2551", "2569"),
  []
);
check(
  "findMismatchedYears: เลขไทย ๒๕๖๘ → เจอ (แปลงเป็นอารบิก)",
  findMismatchedYears("ภายในวันที่ ๓๑ มีนาคม ๒๕๖๘", "2569"),
  ["2568"]
);
check(
  "findMismatchedYears: เลขที่ไม่ใช่ปี (12550, 255) → ไม่เจอ",
  findMismatchedYears("รหัส 12550 จำนวน 255 ชิ้น", "2569"),
  []
);
check(
  "แผน: ปีผิดใน finalText → fire",
  hasWarn(
    makePlan({ goals: [makeGoal({ finalText: "ทำได้ 3 ใน 5 ครั้ง ภายในวันที่ 31 มีนาคม 2555" })] }),
    "พ.ศ. 2555"
  ),
  true
);
check(
  "แผน: ปีผิดใน timeframe → fire",
  hasWarn(makePlan({ goals: [makeGoal({ timeframe: "ภายในปีการศึกษา 2555" })] }), "ไม่ตรงกับปีการศึกษา"),
  true
);
check(
  "แผน: ปี 2560 ใน timeframe เป็นปีหลักสูตร (whitelist) → ไม่ fire",
  hasWarn(makePlan({ goals: [makeGoal({ timeframe: "ตามหลักสูตร พ.ศ. 2560" })] }), "ไม่ตรงกับปีการศึกษา"),
  false
);
check(
  "แผน: academicYear ไม่ใช่ตัวเลข → ข้ามกฎ ไม่ crash",
  warningsOf(makePlan({ academicYear: "ไม่ระบุ" })),
  []
);

// ═════════ กฎ 1.5: ยอดรวมสื่อเกินเพดาน 2,000 บาท ═════════

console.log("\n── กฎ 1.5: ยอดรวมสื่อเกินเพดาน 2,000 บาท ──");

const CAP_MSG = "เกินเพดาน";

/** สร้างสื่อ n รายการ ราคาเท่ากันหมด — ใช้ประกอบยอดรวมให้ตรงเป๊ะ */
const pricedMedia = (prices, overrides = {}) =>
  prices.map((p, i) => makeMedia({ id: `m${i + 1}`, price: p, ...overrides }));

// ── parsePriceBaht: อ่านราคาจาก string ของคู่มือ ──
check("parsePriceBaht: \"250 บาท\" → 250", parsePriceBaht("250 บาท"), 250);
check("parsePriceBaht: \"1,250 บาท/ชุด\" → 1250 (ตัด comma)", parsePriceBaht("1,250 บาท/ชุด"), 1250);
check("parsePriceBaht: \"110 บาท / เล่ม\" → 110", parsePriceBaht("110 บาท / เล่ม"), 110);
check("parsePriceBaht: null → null", parsePriceBaht(null), null);
check("parsePriceBaht: อ่านไม่ออก → null", parsePriceBaht("ตามจริง"), null);
check(
  "parsePriceBaht: หน่วยมีตัวเลขปน \"23 บาท/12 แท่ง\" → 23 ไม่ใช่ 12",
  parsePriceBaht("23 บาท/12 แท่ง"),
  23
);

// ── เคสที่ต้อง fire ──
check(
  "ยอดรวม 2,050 > 2,000 → fire",
  hasWarn(makePlan({ media: pricedMedia(["1,250 บาท/ชุด", "800 บาท"]) }), CAP_MSG),
  true
);
check(
  "ข้อความบอกยอดรวม + ส่วนที่เกิน",
  warningsOf(makePlan({ media: pricedMedia(["1,250 บาท/ชุด", "800 บาท"]) })).some(
    (w) => w.includes("2,050 บาท") && w.includes("อยู่ 50 บาท")
  ),
  true
);

// ── เคสที่ห้าม fire (ขอบเขตพอดี) ──
check(
  "ยอดรวม 2,000 พอดี → ไม่ fire (แผนจริงทั้ง 2 ฉบับขอพอดีเพดาน)",
  hasWarn(makePlan({ media: pricedMedia(["1,250 บาท/ชุด", "750 บาท / ชุด"]) }), CAP_MSG),
  false
);
check(
  "ยอดรวม 1,999 < 2,000 → ไม่ fire",
  hasWarn(makePlan({ media: pricedMedia(["1,250 บาท/ชุด", "749 บาท"]) }), CAP_MSG),
  false
);

// ── null price ไม่นับเข้ายอด ──
check(
  "price = null ไม่นับเข้ายอด (2,000 + null = ไม่เกิน)",
  hasWarn(
    makePlan({ media: pricedMedia(["1,250 บาท/ชุด", "750 บาท", null]) }),
    CAP_MSG
  ),
  false
);
check(
  "ผสม null/ไม่ null: เฉพาะที่มีราคารวมแล้วเกิน → fire",
  hasWarn(
    makePlan({ media: pricedMedia(["1,250 บาท/ชุด", "800 บาท", null]) }),
    CAP_MSG
  ),
  true
);
check(
  "มี null ปนแล้ว fire → ข้อความบอกจำนวนรายการที่ไม่ได้นับ",
  warningsOf(makePlan({ media: pricedMedia(["1,250 บาท/ชุด", "800 บาท", null]) })).some((w) =>
    w.includes("ยังไม่รวมอีก 1 รายการที่ไม่มีราคา")
  ),
  true
);
check(
  "ไม่มี null เลย → ข้อความไม่มีวงเล็บ \"ยังไม่รวม\"",
  warningsOf(makePlan({ media: pricedMedia(["1,250 บาท/ชุด", "800 บาท"]) })).some((w) =>
    w.includes("ยังไม่รวมอีก")
  ),
  false
);

// ── isApproved = false ไม่นับเข้ายอด ──
check(
  "รายการที่ไม่ได้อนุมัติ ไม่นับเข้ายอด (ครูตัดออกแล้ว = ไม่ได้ขอเบิก)",
  hasWarn(
    makePlan({
      media: [
        ...pricedMedia(["1,250 บาท/ชุด", "750 บาท"]),
        makeMedia({ id: "m3", price: "2,000 บาท", isApproved: false }),
      ],
    }),
    CAP_MSG
  ),
  false
);

// ── โทนคำถาม ไม่ใช่โทนกล่าวหา (CLAUDE.md §4) ──
check(
  "ใช้โทนคำถาม ลงท้ายด้วย \"ไหม?\" ไม่ใช่คำสั่ง",
  warningsOf(makePlan({ media: pricedMedia(["1,250 บาท/ชุด", "800 บาท"]) })).some((w) =>
    w.trim().endsWith("ไหม?")
  ),
  true
);

// ═════════ กฎ 1.5 (ต่อ): เพดานนับรวม "ทั้งปีการศึกษา" ไม่ใช่ต่อแผน ═════════
//
// ระเบียบ: "แต่ละรายมีวงเงินไม่เกิน ๒,๐๐๐ บาทต่อปี" — หน่วยคือคน/ปี ไม่ใช่คน/แผน
// นักเรียนคนเดียวมีได้หลายแผนในปีเดียวกัน (ภาคเรียน 1 และ 2) ยอดต้องรวมข้ามแผน
//
// ยอดของ "แผนอื่น" มาทาง AnnualMediaContext ซึ่ง route เป็นคนหามาให้
// (ดู lib/plan-queries.ts) ไม่ส่งมา = ไม่มีแผนอื่น → ผลเท่าเดิม

console.log("\n── กฎ 1.5 (ต่อ): เพดานนับรวมทั้งปีการศึกษา ──");

/** จำลองแผนอื่นในปีเดียวกันให้ buildAnnualContext */
const otherPlans = (...planPrices) =>
  buildAnnualContext(planPrices.map((prices) => ({ media: pricedMedia(prices) })));

const warnWithAnnual = (plan, annual) =>
  buildConsistencyWarnings(plan, annual).some((w) => w.includes(CAP_MSG));

// ── เคสหลักของ task นี้: สองแผนปีเดียวกัน แต่ละแผนไม่เกิน รวมแล้วเกิน ──
check(
  "แผนนี้ 1,500 + อีกแผนปีเดียวกัน 1,500 = 3,000 → fire (พิสูจน์ว่าการแก้มีผลจริง)",
  warnWithAnnual(
    makePlan({ media: pricedMedia(["1,500 บาท"]) }),
    otherPlans(["1,500 บาท"])
  ),
  true
);
check(
  "แผนนี้ 1,500 แผนเดียว (ไม่มีแผนอื่น) → ไม่ fire — เคสเดียวกันแต่ไม่มียอดสะสม",
  hasWarn(makePlan({ media: pricedMedia(["1,500 บาท"]) }), CAP_MSG),
  false
);

// ── ข้อความต้องบอกที่มาของยอด ครูจะได้ตรวจได้ว่ามาจากแผนไหนบ้าง ──
check(
  "ข้อความบอกยอดรวมทั้งปี + แยกว่าเป็นของแผนนี้เท่าไร ของอีกกี่แผนเท่าไร",
  buildConsistencyWarnings(
    makePlan({ media: pricedMedia(["1,500 บาท"]) }),
    otherPlans(["1,500 บาท"])
  ).some(
    (w) =>
      w.includes("ทั้งปีการศึกษา 3,000 บาท") &&
      w.includes("แผนนี้ 1,500 บาท") &&
      w.includes("อีก 1 แผนในปีเดียวกัน 1,500 บาท")
  ),
  true
);
check(
  "ไม่มีแผนอื่น → ข้อความไม่พูดถึง \"แผนนี้ ... + อีก N แผน\"",
  warningsOf(makePlan({ media: pricedMedia(["1,250 บาท/ชุด", "800 บาท"]) })).some((w) =>
    w.includes("อีก 1 แผนในปีเดียวกัน")
  ),
  false
);

// ── ขอบเขต: รวมพอดี 2,000 ข้ามแผน ยังไม่ fire (เท่ากับกฎเดิม) ──
check(
  "แผนนี้ 1,250 + อีกแผน 750 = 2,000 พอดี → ไม่ fire",
  warnWithAnnual(
    makePlan({ media: pricedMedia(["1,250 บาท/ชุด"]) }),
    otherPlans(["750 บาท"])
  ),
  false
);
check(
  "แผนนี้ 1,250 + อีกแผน 751 = 2,001 → fire",
  warnWithAnnual(
    makePlan({ media: pricedMedia(["1,250 บาท/ชุด"]) }),
    otherPlans(["751 บาท"])
  ),
  true
);

// ── หลายแผนในปีเดียวกัน ──
check(
  "แผนนี้ 800 + อีก 2 แผน (700 + 700) = 2,200 → fire และนับครบทั้ง 2 แผน",
  buildConsistencyWarnings(
    makePlan({ media: pricedMedia(["800 บาท"]) }),
    otherPlans(["700 บาท"], ["700 บาท"])
  ).some((w) => w.includes("ทั้งปีการศึกษา 2,200 บาท") && w.includes("อีก 2 แผนในปีเดียวกัน")),
  true
);

// ── กฎเดิมยังต้องทำงานเหมือนเดิมเมื่อรวมยอดข้ามแผน ──
check(
  "แผนอื่นที่ isApproved = false ไม่นับเข้ายอดทั้งปี",
  warnWithAnnual(
    makePlan({ media: pricedMedia(["1,500 บาท"]) }),
    buildAnnualContext([
      { media: pricedMedia(["1,500 บาท"], { isApproved: false }) },
    ])
  ),
  false
);
check(
  "แผนอื่นที่ price = null ไม่นับเข้ายอด แต่ไปเพิ่มจำนวน \"ยังไม่รวม\"",
  buildConsistencyWarnings(
    makePlan({ media: pricedMedia(["1,250 บาท/ชุด", "800 บาท"]) }),
    otherPlans([null])
  ).some((w) => w.includes("ยังไม่รวมอีก 1 รายการที่ไม่มีราคา")),
  true
);

// ── ปีการศึกษา / นักเรียน ต่างกันต้องไม่ถูกรวม ──
// นี่คือการจัดกลุ่มจริงที่ GET /api/plans ใช้ (buildAnnualContextsByPlan)
// ไม่ใช่แค่สัญญาว่า "ถ้ากรองมาแล้วจะไม่รวม" — เทสต์ป้อนแผนหลายปี/หลายคนเข้าไปตรง ๆ
const planRow = (id, studentId, academicYear, prices) => ({
  id,
  studentId,
  academicYear,
  media: pricedMedia(prices),
});

const grouped = buildAnnualContextsByPlan([
  planRow("p1", "s1", "2569", ["1,500 บาท"]),
  planRow("p2", "s1", "2569", ["1,500 บาท"]), // คนเดียวกัน ปีเดียวกัน → ต้องรวมกัน
  planRow("p3", "s1", "2570", ["1,900 บาท"]), // คนเดียวกัน คนละปี   → ต้องไม่ถูกรวม
  planRow("p4", "s2", "2569", ["1,900 บาท"]), // คนละคน ปีเดียวกัน   → ต้องไม่ถูกรวม
]);

check(
  "จัดกลุ่มจริง: p1 เห็นเฉพาะ p2 (คนเดียวกัน ปีเดียวกัน) = 1,500 บาท 1 แผน",
  grouped.get("p1"),
  { otherPlansApprovedBaht: 1500, otherPlanCount: 1, otherUncounted: 0 }
);
check(
  "จัดกลุ่มจริง: p3 คนละปี → ไม่เห็นแผนปี 2569 เลย (ยอดเป็น 0)",
  grouped.get("p3"),
  EMPTY_ANNUAL
);
check(
  "จัดกลุ่มจริง: p4 คนละนักเรียน → ไม่เห็นแผนของ s1 เลย (ยอดเป็น 0)",
  grouped.get("p4"),
  EMPTY_ANNUAL
);
check(
  "จัดกลุ่มจริง: p3 (1,900 เดี่ยว ๆ) ไม่ fire — พิสูจน์ว่าปี 2569 ไม่รั่วมารวม",
  warnWithAnnual(
    makePlan({ academicYear: "2570", media: pricedMedia(["1,900 บาท"]) }),
    grouped.get("p3")
  ),
  false
);
check(
  "buildAnnualContext ของลิสต์ว่าง = EMPTY_ANNUAL (ผลเท่ากับไม่ส่งอาร์กิวเมนต์)",
  buildAnnualContext([]),
  EMPTY_ANNUAL
);
check(
  "sumApprovedMedia: นับเฉพาะที่อนุมัติ + แยกจำนวนที่ไม่มีราคา",
  sumApprovedMedia([
    ...pricedMedia(["1,000 บาท", null]),
    makeMedia({ id: "mx", price: "500 บาท", isApproved: false }),
  ]),
  { baht: 1000, uncounted: 1 }
);

// ═════════ กฎ 2: อนุมัติสื่อแล้วแต่เหตุผลว่าง ═════════

console.log("\n── กฎ 2: อนุมัติสื่อแล้วแต่เหตุผลว่าง ──");

check(
  "media approve แล้ว + finalReason ว่าง → fire",
  hasWarn(makePlan({ media: [makeMedia({ finalReason: "  " })] }), "ยังไม่มีเหตุผลและความจำเป็น"),
  true
);
check(
  "media ยังไม่ approve + finalReason ว่าง → ไม่ fire (ยังไม่ถึงขั้นเบิก)",
  hasWarn(
    makePlan({ media: [makeMedia({ isApproved: false, finalReason: "" }), makeMedia({ id: "m2" })] }),
    "ยังไม่มีเหตุผลและความจำเป็น"
  ),
  false
);

// ═════════ กฎ 2.5: สื่อไม่มีรหัสตามคู่มือ 2568 ═════════

console.log("\n── กฎ 2.5: สื่อไม่มีรหัสตามคู่มือ ──");

check(
  "media approve แล้ว + code เป็น null (แผนเก่า) → fire",
  hasWarn(makePlan({ media: [makeMedia({ code: null })] }), "ยังไม่มีรหัสตามคู่มือ"),
  true
);
check(
  "media ยังไม่ approve + ไม่มี code → ไม่ fire (ไม่เบิกก็ไม่ต้องมีรหัส)",
  hasWarn(
    makePlan({ media: [makeMedia({ code: null, isApproved: false }), makeMedia({ id: "m2" })] }),
    "ยังไม่มีรหัสตามคู่มือ"
  ),
  false
);
check(
  "ไม่มีรหัสหลายรายการ → รวมเป็น warning เดียว",
  warningsOf(
    makePlan({ media: [makeMedia({ code: null }), makeMedia({ id: "m2", code: "  " })] })
  ).filter((w) => w.includes("ยังไม่มีรหัสตามคู่มือ")).length,
  1
);

// ═════════ กฎ 3: ชื่อเด็กในข้อความเป้าหมาย ═════════

console.log("\n── กฎ 3: ชื่อเด็กในข้อความเป้าหมาย ──");

check(
  'findChildNamePrefix: "เด็กชายสมชาย" → เจอ',
  findChildNamePrefix("เด็กชายสมชาย ทำได้ดี"),
  "เด็กชายสมชาย"
);
check('findChildNamePrefix: "ด.ญ.สมหญิง" → เจอ', findChildNamePrefix("ด.ญ.สมหญิง"), "ด.ญ.สมหญิง");
check(
  'findChildNamePrefix: คำว่า "นักเรียน" ปกติ → ไม่เจอ',
  findChildNamePrefix("นักเรียนสามารถอ่านคำได้"),
  null
);
check(
  "แผน: มีชื่อเด็กใน finalText → fire",
  hasWarn(
    makePlan({
      goals: [makeGoal({ finalText: "เด็กชายทดสอบ ระบบ ทำได้ 3 ใน 5 ครั้ง" })],
    }),
    'ควรใช้คำว่า "นักเรียน" แทน'
  ),
  true
);

// ═════════ กฎ 4: เลือกเป้าหมายแล้วแต่ยังไม่อนุมัติสื่อเลย ═════════

console.log("\n── กฎ 4: เลือกเป้าหมายแล้วแต่สื่อถูกเอาออกจากการเบิกหมด ──");

check(
  "goal เลือกแล้ว + สื่อถูกเอาออกหมดทุกรายการ → fire เป็นคำถามยืนยัน",
  hasWarn(makePlan({ media: [makeMedia({ isApproved: false })] }), "ไม่ต้องเบิกสื่อเลยใช่ไหม"),
  true
);
check(
  "goal เลือกแล้ว + ยังเหลือสื่อเบิกอย่างน้อย 1 รายการ → ไม่ fire",
  hasWarn(
    makePlan({ media: [makeMedia(), makeMedia({ id: "m2", isApproved: false })] }),
    "ไม่ต้องเบิกสื่อเลยใช่ไหม"
  ),
  false
);
check(
  "media ว่างเปล่า → ใช้ warning เดิม (ไม่มีรายการสื่อ) ไม่ใช่กฎนี้",
  hasWarn(makePlan({ media: [] }), "ยังไม่มีรายการสื่อที่แนะนำ") &&
    !hasWarn(makePlan({ media: [] }), "ไม่ต้องเบิกสื่อเลยใช่ไหม"),
  true
);
check(
  "ยังไม่ได้เลือก goal เลย → กฎนี้ไม่ fire (warning เดิมครอบคลุมแล้ว)",
  hasWarn(
    makePlan({
      goals: [makeGoal({ isSelected: false })],
      media: [makeMedia({ isApproved: false })],
    }),
    "ไม่ต้องเบิกสื่อเลยใช่ไหม"
  ),
  false
);

// ═════════ กฎ 5: เกณฑ์วัดผลไม่มีตัวเลข (โทนคำถาม) ═════════

console.log("\n── กฎ 5: เกณฑ์วัดผลไม่มีตัวเลข ──");

check("hasMeasurableNumber: '3 ใน 5 ครั้ง' → true", hasMeasurableNumber("3 ใน 5 ครั้ง"), true);
check("hasMeasurableNumber: เลขไทย '๕ ครั้ง' → true", hasMeasurableNumber("๕ ครั้ง"), true);
check("hasMeasurableNumber: 'ร้อยละห้าสิบ' → true (whitelist)", hasMeasurableNumber("ร้อยละห้าสิบ"), true);
check("hasMeasurableNumber: 'ทำได้ทุกครั้ง' → true (whitelist)", hasMeasurableNumber("ทำได้ทุกครั้ง"), true);
check("hasMeasurableNumber: 'ทำได้ดีขึ้น' → false", hasMeasurableNumber("ทำได้ดีขึ้น"), false);

const vagueGoal = makeGoal({
  finalText: "นักเรียนมีพัฒนาการด้านการอ่านดีขึ้น",
  criterion: "สังเกตพฤติกรรม",
});
check(
  "criterion + finalText ไม่มีตัวเลขเลย → fire เป็นคำถาม",
  hasWarn(makePlan({ goals: [vagueGoal] }), "วัดผลปลายปีได้ชัดเจนหรือยัง?"),
  true
);
check(
  "เคสจริงจาก fewShotExamples (intellectual): 'ลดความช่วยเหลือ...ด้วยตนเอง' → ไม่ fire",
  hasWarn(
    makePlan({
      goals: [
        makeGoal({
          finalText: "นักเรียนสามารถรับประทานอาหารเองได้ด้วยตนเองโดยลดความช่วยเหลือจากครูน้อยลง",
          criterion: "สังเกตพฤติกรรม",
        }),
      ],
    }),
    "วัดผลปลายปี"
  ),
  false
);
check(
  "criterion เป็น null → กฎนี้ไม่ fire ซ้ำ (warning เดิม 'ยังไม่มีเกณฑ์วัดผล' ครอบคลุม)",
  (() => {
    const w = warningsOf(
      makePlan({ goals: [makeGoal({ criterion: null, finalText: "นักเรียนอ่านได้ดีขึ้น" })] })
    );
    return w.some((x) => x.includes("ยังไม่มีเกณฑ์วัดผล")) && !w.some((x) => x.includes("วัดผลปลายปี"));
  })(),
  true
);

// ═════════ ลำดับความร้ายแรง ═════════

console.log("\n── ลำดับ warning: ร้ายแรงสุดขึ้นก่อน ──");

// ปีผิดอยู่ใน timeframe (กฎเกณฑ์ตัวเลขสแกนแค่ criterion+finalText จึง fire พร้อมกันได้)
const messyPlan = makePlan({
  goals: [
    makeGoal({
      finalText: "เด็กชายทดสอบ ระบบ ทำกิจกรรมได้ดีขึ้น",
      criterion: "สังเกตพฤติกรรม",
      timeframe: "ภายในวันที่ 31 มีนาคม 2555",
    }),
  ],
  media: [makeMedia({ finalReason: "" })],
});
const order = warningsOf(messyPlan).map((w) =>
  w.includes("ไม่ตรงกับปีการศึกษา")
    ? "ปีผิด"
    : w.includes("เหตุผลและความจำเป็น")
      ? "เหตุผลว่าง"
      : w.includes("คำนำหน้าชื่อเด็ก")
        ? "ชื่อเด็ก"
        : w.includes("วัดผลปลายปี")
          ? "เกณฑ์ไม่มีเลข"
          : "อื่นๆ"
);
check("เรียง: ปีผิด > เหตุผลว่าง > ชื่อเด็ก > เกณฑ์ไม่มีเลข", order, [
  "ปีผิด",
  "เหตุผลว่าง",
  "ชื่อเด็ก",
  "เกณฑ์ไม่มีเลข",
]);

// กฎ 1.5 เป็นกฎแข็งจากระบบต้นทาง (เบิกไม่ผ่าน) จึงต้องอยู่สูง — รองจากปีผิดเท่านั้น
const overBudgetMessy = makePlan({
  goals: [
    makeGoal({
      finalText: "เด็กชายทดสอบ ระบบ ทำกิจกรรมได้ดีขึ้น",
      timeframe: "ภายในวันที่ 31 มีนาคม 2555",
    }),
  ],
  media: [
    makeMedia({ id: "m1", price: "1,250 บาท/ชุด" }),
    makeMedia({ id: "m2", price: "800 บาท", finalReason: "" }),
  ],
});
const budgetOrder = warningsOf(overBudgetMessy).map((w) =>
  w.includes("ไม่ตรงกับปีการศึกษา")
    ? "ปีผิด"
    : w.includes("เกินเพดาน")
      ? "งบเกิน"
      : w.includes("เหตุผลและความจำเป็น")
        ? "เหตุผลว่าง"
        : w.includes("คำนำหน้าชื่อเด็ก")
          ? "ชื่อเด็ก"
          : "อื่นๆ"
);
check("เรียง: ปีผิด > งบเกิน > เหตุผลว่าง > ชื่อเด็ก", budgetOrder, [
  "ปีผิด",
  "งบเกิน",
  "เหตุผลว่าง",
  "ชื่อเด็ก",
]);

// ═════════ สรุป ═════════

console.log(`\n${"═".repeat(50)}`);
if (failed > 0) {
  console.error(`❌ ผ่าน ${passed} / ตก ${failed}`);
  process.exit(1);
}
console.log(`🎉 ผ่านทั้งหมด ${passed} เคส`);
