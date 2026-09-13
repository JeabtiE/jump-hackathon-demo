import type { Config } from "tailwindcss";

/**
 * Design tokens — Phase 2.1 (DESIGN.md §2 สี · §3 typography · §4.1 มุมโค้ง)
 *
 * ⚠️ additive เท่านั้น: ทุกอย่างอยู่ใต้ theme.extend ด้วยชื่อใหม่ที่ไม่ชนของเดิม
 *    class เดิม (slate/teal/amber/red/gray, text-xs…3xl, rounded-lg/xl, border) ต้องทำงานเหมือนเดิม
 *    ห้ามแก้ key เดิมของ Tailwind เช่น colors.gray, fontSize.xs, fontFamily.sans, borderColor.DEFAULT
 *    (borderColor.DEFAULT คือสีของ `border` ที่ไม่ระบุสี — แก้แล้วขอบทั้งแอปเปลี่ยน)
 *    การแทนที่ class เดิมเป็นงาน Phase 5
 *
 * ค่าจริงอยู่ที่ CSS variable ใน app/globals.css ที่เดียว
 */

/** สีจาก CSS variable ที่เก็บเป็นช่อง RGB — รองรับ opacity modifier เช่น bg-accent/[.08] */
const token = (name: string) => `rgb(var(--color-${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: token("paper"),
        ink: token("ink"),
        muted: token("muted"),
        rule: token("rule"),
        accent: token("accent"),
        attention: token("attention"),
        danger: token("danger"),
      },
      borderColor: {
        // ชื่อเชิงหน้าที่ของกฎ "เส้นขอบ 2 ตัว" (DESIGN.md §2): ขอบ control ต้อง ≥ 3:1 จึงเป็น muted
        // border-rule (การ์ด/เส้นคั่น) และ border-muted ใช้ได้อยู่แล้วจาก colors ด้านบน
        control: token("muted"),
      },
      fontFamily: {
        ui: [
          "var(--font-plex-looped)",
          '"Noto Sans Thai Looped"',
          "system-ui",
          "sans-serif",
        ],
      },
      fontSize: {
        // ต่ำสุด 14px (hint) — ห้ามเพิ่มขนาดที่เล็กกว่านี้ · heading 1.4 / ข้อความ 1.75
        // display มือถือใช้ 24px — กำหนดด้วย responsive class ตอน Phase 5
        display: ["1.75rem", { lineHeight: "1.4", fontWeight: "600" }], // 28px h1
        title: ["1.25rem", { lineHeight: "1.4", fontWeight: "600" }], // 20px h2
        subtitle: ["1.0625rem", { lineHeight: "1.4", fontWeight: "600" }], // 17px h3
        body: ["1rem", { lineHeight: "1.75", fontWeight: "400" }], // 16px ข้อความ + ค่าในช่องกรอก
        label: ["0.9375rem", { lineHeight: "1.75", fontWeight: "500" }], // 15px label / ปุ่ม
        hint: ["0.875rem", { lineHeight: "1.75", fontWeight: "400" }], // 14px hint / สถานะ
        stat: ["1.75rem", { lineHeight: "1.4", fontWeight: "600" }], // 28px ตัวเลขหน้า /stats
      },
      borderRadius: {
        box: "var(--radius-box)", // 4px การ์ด / ช่องกรอก / ปุ่ม · chip ใช้ rounded-full เดิม
      },
    },
  },
  plugins: [],
};
export default config;
