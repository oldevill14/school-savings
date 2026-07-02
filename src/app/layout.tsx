import type { Metadata } from "next";
import { Sarabun } from "next/font/google";
import "./globals.css";

const sarabun = Sarabun({
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sarabun",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ระบบออมทรัพย์โรงเรียนบ้านกะดาด",
    template: "%s | ระบบออมทรัพย์โรงเรียนบ้านกะดาด",
  },
  description:
    "ระบบออมทรัพย์นักเรียน โรงเรียนบ้านกะดาด สำนักงานเขตพื้นที่การศึกษาประถมศึกษาสุรินทร์ เขต 3",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={sarabun.variable}>
      <body className="font-sarabun bg-surface text-slate-800 antialiased">
        {children}
      </body>
    </html>
  );
}
