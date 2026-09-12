/**
 * app/students/[id]/page.tsx — เปลือกฝั่ง server ของหน้าประวัติพัฒนาการ
 * เนื้อหาทั้งหมดอยู่ที่ StudentHistoryClient.tsx (ดูเหตุผลการแยกไฟล์ที่ app/page.tsx)
 */

import AuthHeader from "@/components/AuthHeader";
import StudentHistoryClient from "./StudentHistoryClient";

export default function Page({ params }: { params: { id: string } }) {
  return <StudentHistoryClient params={params} authSlot={<AuthHeader />} />;
}
