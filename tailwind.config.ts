import type { Config } from "tailwindcss";

/**
 * ธีมสีของระบบออมทรัพย์โรงเรียนบ้านกะดาด
 * - navy     #1E3A5F  สีหลัก (sidebar / ปุ่มหลัก / header ตาราง)
 * - surface  #F5F7FA  พื้นหลังแอป
 * - line     #E2E8F0  เส้นขอบ / เส้นแบ่ง
 * - deposit  #16A34A  เขียว = ฝาก
 * - withdraw #DC2626  แดง = ถอน
 * - gold     #D4A843  ทอง = ไฮไลต์ / ยอดสะสม
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#1E3A5F",
          light: "#2C4F7C",
          dark: "#162C49",
        },
        surface: "#F5F7FA",
        line: "#E2E8F0",
        deposit: "#16A34A",
        withdraw: "#DC2626",
        gold: {
          DEFAULT: "#D4A843",
          light: "#E8C978",
          dark: "#B08A2E",
        },
      },
      fontFamily: {
        sarabun: ["var(--font-sarabun)", "Sarabun", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.06)",
      },
      borderRadius: {
        card: "12px",
      },
    },
  },
  plugins: [],
};

export default config;
