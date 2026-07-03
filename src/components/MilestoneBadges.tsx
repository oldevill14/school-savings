/**
 * ตราสัญลักษณ์นักออม (milestone badges) — แสดงความสำเร็จของนักเรียนรายคน
 *
 * เป็น Server Component ได้ (ไม่มี hook/handler) — เรียก computeMilestones() ในตัว
 * ใช้ได้ในหน้า /my-child, /passbook, /students/[id] โดยส่งข้อมูลธุรกรรมย่อเข้ามา
 *
 * ใช้:
 *   <MilestoneBadges balance={Number(account.balance)} transactions={txnData} showLocked />
 *   // txnData = transactions.map(t => ({ type:t.type, status:t.status, txnDate:t.txnDate, amount:Number(t.amount) }))
 */
import {
  Award,
  Flame,
  Medal,
  Sprout,
  Star,
  Trophy,
  Lock,
  type LucideIcon,
} from "lucide-react";
import {
  computeMilestones,
  type Milestone,
  type MilestoneTxn,
} from "@/lib/milestones";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  "balance-100": Sprout,
  "balance-500": Star,
  "balance-1000": Medal,
  "balance-5000": Trophy,
  "streak-4": Flame,
  "streak-8": Flame,
  "streak-12": Flame,
};

export interface MilestoneBadgesProps {
  /** ยอดคงเหลือปัจจุบัน (บาท) — Prisma Decimal ให้ Number(...) ก่อน */
  balance: number;
  /** ธุรกรรมย่อของบัญชี (ทุกสถานะ) */
  transactions: MilestoneTxn[];
  /** แสดงตราที่ยังไม่ปลดล็อกแบบจาง เพื่อเป็นเป้าหมาย (default false) */
  showLocked?: boolean;
  className?: string;
}

export default function MilestoneBadges({
  balance,
  transactions,
  showLocked = false,
  className,
}: MilestoneBadgesProps) {
  const { milestones } = computeMilestones({ balance, transactions });
  const shown = showLocked ? milestones : milestones.filter((m) => m.achieved);

  if (shown.length === 0) {
    return (
      <p className={cn("text-sm text-slate-500", className)}>
        ยังไม่มีตราสัญลักษณ์นักออม — ออมสม่ำเสมอเพื่อปลดล็อกตราแรก
      </p>
    );
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {shown.map((m) => (
        <MilestoneChip key={m.key} milestone={m} />
      ))}
    </div>
  );
}

function MilestoneChip({ milestone }: { milestone: Milestone }) {
  const Icon = ICONS[milestone.key] ?? Award;
  const { achieved, label, description } = milestone;
  return (
    <span
      title={description}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        achieved
          ? "border-gold/40 bg-amber-50 text-gold-dark"
          : "border-line bg-slate-50 text-slate-400"
      )}
    >
      {achieved ? (
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}
