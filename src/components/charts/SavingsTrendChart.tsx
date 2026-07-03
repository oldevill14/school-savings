"use client";

/**
 * กราฟเส้น "ยอดเงินออมสะสมรายเดือน" (รายคน)
 *
 * Client component — รับข้อมูลที่ aggregate มาแล้วผ่าน props จาก Server Component
 * (ห้าม fetch เองในนี้) · เส้นสีทอง (ยอดสะสม) จุดสีน้ำเงินกรมท่า
 *
 * สร้าง data ฝั่ง server ด้วย buildSavingsTrend() จาก "@/lib/milestones"
 *
 * ใช้:
 *   <SavingsTrendChart data={[{ key:"2569-6", label:"ก.ค. 69", balance: 1250 }, ...]} />
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBaht } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { SavingsTrendPoint } from "@/lib/milestones";

const GOLD = "#B08A2E"; // gold-dark = ยอดสะสม
const NAVY = "#1E3A5F";
const LINE_COLOR = "#E2E8F0";
const TICK_COLOR = "#64748B";

export interface SavingsTrendChartProps {
  data: SavingsTrendPoint[];
  /** ความสูงกราฟ (px, default 260) */
  height?: number;
  className?: string;
}

export default function SavingsTrendChart({
  data,
  height = 260,
  className,
}: SavingsTrendChartProps) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={LINE_COLOR} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: TICK_COLOR }}
            tickLine={false}
            axisLine={{ stroke: LINE_COLOR }}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            tick={{ fontSize: 12, fill: TICK_COLOR }}
            tickLine={false}
            axisLine={false}
            width={70}
            tickFormatter={(v) => Number(v).toLocaleString("th-TH")}
          />
          <Tooltip
            cursor={{ stroke: LINE_COLOR, strokeWidth: 1 }}
            contentStyle={{
              borderRadius: 8,
              border: `1px solid ${LINE_COLOR}`,
              boxShadow: "0 2px 8px rgba(15, 23, 42, 0.08)",
              fontFamily: "inherit",
              fontSize: 13,
            }}
            formatter={(value) => [`${formatBaht(Number(value))} บาท`, "ยอดสะสม"]}
            labelFormatter={(label) => `เดือน ${label}`}
          />
          <Line
            type="monotone"
            dataKey="balance"
            name="ยอดสะสม"
            stroke={GOLD}
            strokeWidth={2.5}
            dot={{ r: 3, fill: NAVY, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: NAVY }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
