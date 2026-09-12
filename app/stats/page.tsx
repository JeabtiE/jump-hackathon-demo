/**
 * app/stats/page.tsx — เปลือกฝั่ง server ของหน้าสถิติ
 * เนื้อหาทั้งหมดอยู่ที่ app/stats/StatsClient.tsx (ดูเหตุผลการแยกไฟล์ที่ app/page.tsx)
 */

import AuthHeader from "@/components/AuthHeader";
import StatsClient from "./StatsClient";

export default function Page() {
  return <StatsClient authSlot={<AuthHeader />} />;
}
