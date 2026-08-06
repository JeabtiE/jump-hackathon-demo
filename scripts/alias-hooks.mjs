/**
 * scripts/alias-hooks.mjs — module hooks ให้ unit test รัน lib/* ได้ตรงๆ ด้วย node
 *
 * ปัญหาที่แก้ 3 อย่าง (เกิดเฉพาะตอนรันด้วย node เปล่า ไม่เกี่ยวกับตอน build/runtime ของ Next):
 * 1. alias "@/..." เป็นของ tsconfig paths — node ไม่รู้จัก → map กลับเป็น path จริง
 * 2. node ต้องมี import attribute (with { type: "json" }) ถึงจะ import .json ได้
 *    แต่ Next/webpack ยังไม่รองรับ attribute → แปลง .json เป็น ES module ให้แทน
 *    (โค้ดใน lib/ จะได้ไม่ต้องเขียนผิดรูปแบบเพื่อเอาใจ test runner)
 * 3. ไฟล์ใน lib/ import กันเองแบบไม่ใส่นามสกุล (สไตล์ TypeScript) — node ต้องการนามสกุล
 *
 * ใช้ผ่าน scripts/register-alias.mjs — ดู package.json → test:curriculum
 */

import { readFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);

export async function resolve(specifier, context, next) {
  const target = specifier.startsWith("@/")
    ? new URL(specifier.slice(2), ROOT).href
    : specifier;

  try {
    return await next(target, context);
  } catch (err) {
    // เฉพาะ path ในโปรเจกต์ที่ไม่มีนามสกุล — ชื่อ package ("next/server") ต้องไม่เข้าเงื่อนไขนี้
    const isLocal = target.startsWith(".") || target.startsWith("file:");
    if (isLocal && !/\.[a-z]+$/i.test(target)) return next(`${target}.ts`, context);
    throw err;
  }
}

export async function load(url, context, next) {
  if (url.endsWith(".json")) {
    const source = await readFile(new URL(url), "utf8");
    return { format: "module", shortCircuit: true, source: `export default ${source};` };
  }
  return next(url, context);
}
