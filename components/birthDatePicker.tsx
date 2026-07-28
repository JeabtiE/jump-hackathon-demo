//Date picker
"use client";

type Props = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  labelCls?: string;
  inputCls?: string;
};

const thaiMonth = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฏาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤษจิกายน",
  "ธันวาคม",
];
const BE_Offset = 543;

function BuddhistText(isoDate: string) {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return null;
  const beYear = y + BE_Offset;
  return `: ${d} ${thaiMonth[m - 1]} ${beYear}`;
}

export default function BirthDatePicker({
  value,
  onChange,
  label = "วัน/เดือน/ปีเกิด",
  labelCls = "mb-1 block text-xs text-slate-500",
  inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm",
}: Props) {
  const confirmText = BuddhistText(value);

  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />

      {confirmText ? (
        <p className="mt-1 text-xs font-medium text-teal-700">{confirmText}</p>
      ) : (
        <p className="mt-1 text-xs text-slate-400">
          ปฏิทินจะโชว์เป็น ค.ศ. — เลือกแล้วเช็คปี พ.ศ.
          ที่ข้อความด้านล่างอีกครั้ง
        </p>
      )}
    </div>
  );
}
