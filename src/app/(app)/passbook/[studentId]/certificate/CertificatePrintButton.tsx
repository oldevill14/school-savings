"use client";

/**
 * ปุ่มพิมพ์เกียรติบัตร — client component เพราะเรียก window.print()
 * (แยกไฟล์เพื่อให้หน้าเกียรติบัตรยังเป็น Server Component แตะ DB ได้)
 */
import { Printer } from "lucide-react";
import Button from "@/components/ui/Button";

export default function CertificatePrintButton({ className }: { className?: string }) {
  return (
    <Button className={className} onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      พิมพ์เกียรติบัตร
    </Button>
  );
}
