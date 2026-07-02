"use client";

/**
 * กราฟแท่งสรุปยอดฝาก-ถอนรายเดือน (12 เดือน ม.ค.–ธ.ค. ของปี พ.ศ. ที่ active)
 *
 * Client component — รับข้อมูลที่ aggregate มาแล้วผ่าน props จาก Server Component
 * (ห้าม fetch เองในนี้) · เขียว = ฝาก (#16A34A), แดง = ถอน (#DC2626)
 *
 * ใช้:
 *   <MonthlyChart data={[{ month: "ม.ค.", deposit: 1200, withdraw: 300 }, ...]} />
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBaht } from "@/lib/money";
import { cn } from "@/lib/utils";

/** จุดข้อมูล 1 เดือนของกราฟ (จำนวนเงินเป็น number ธรรมดา — แปลงจาก Decimal ฝั่ง server แล้ว) */
export interface MonthlyChartPoint {
  /** ป้ายเดือนภาษาไทยแบบย่อ เช่น "ม.ค." */
  month: string;
  /** ยอดฝากรวมของเดือน (เฉพาะสถานะปกติ) */
  deposit: number;
  /** ยอดถอนรวมของเดือน (เฉพาะสถานะปกติ) */
  withdraw: number;
}

export interface MonthlyChartProps {
  data: MonthlyChartPoint[];
  /** ความสูงกราฟ (px, default 320) */
  height?: number;
  className?: string;
}

const DEPOSIT_COLOR = "#16A34A";
const WITHDRAW_COLOR = "#DC2626";
const LINE_COLOR = "#E2E8F0";
const TICK_COLOR = "#64748B";

export default function MonthlyChart({
  data,
  height = 320,
  className,
}: MonthlyChartProps) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke={LINE_COLOR} vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 12, fill: TICK_COLOR }}
            tickLine={false}
            axisLine={{ stroke: LINE_COLOR }}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 12, fill: TICK_COLOR }}
            tickLine={false}
            axisLine={false}
            width={70}
            tickFormatter={(v) => Number(v).toLocaleString("th-TH")}
          />
          <Tooltip
            cursor={{ fill: "rgba(30, 58, 95, 0.06)" }}
            contentStyle={{
              borderRadius: 8,
              border: `1px solid ${LINE_COLOR}`,
              boxShadow: "0 2px 8px rgba(15, 23, 42, 0.08)",
              fontFamily: "inherit",
              fontSize: 13,
            }}
            formatter={(value, name) => [`${formatBaht(Number(value))} บาท`, String(name)]}
            labelFormatter={(label) => `เดือน ${label}`}
          />
          <Legend iconType="circle" iconSize={10} wrapperStyle={{ fontSize: 13 }} />
          <Bar
            dataKey="deposit"
            name="ฝาก"
            fill={DEPOSIT_COLOR}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
          <Bar
            dataKey="withdraw"
            name="ถอน"
            fill={WITHDRAW_COLOR}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
