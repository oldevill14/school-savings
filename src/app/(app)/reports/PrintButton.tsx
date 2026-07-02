"use client";

import { Printer } from "lucide-react";
import Button from "@/components/ui/Button";

/**
 * ปุ่มพิมพ์รายงาน — เรียก window.print() (ต้องเป็น client component)
 * ใช้คู่กับ @media print ที่ประกาศใน <style> ของหน้ารายงานแต่ละหน้า
 */
export default function PrintButton({ className }: { className?: string }) {
  return (
    <Button
      variant="secondary"
      className={className}
      onClick={() => window.print()}
    >
      <Printer className="h-4 w-4" />
      พิมพ์รายงาน
    </Button>
  );
}
