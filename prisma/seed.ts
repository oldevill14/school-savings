/**
 * Seed ระบบออมทรัพย์โรงเรียนบ้านกะดาด — ปีการศึกษา 2569
 *
 * รัน: npx prisma db seed  (ตั้งไว้แล้วใน package.json -> "prisma": {"seed": "tsx prisma/seed.ts"})
 *
 * ความปลอดภัย: ถ้า DB มีข้อมูลอยู่แล้ว (ปีการศึกษา/ธุรกรรม) seed จะหยุดทันที
 * ไม่ล้างข้อมูล — ต้องตั้ง FORCE_SEED=1 เท่านั้นจึงจะล้างและ seed ใหม่
 *
 * สร้าง:
 * - ปีการศึกษา 2569 (active) + SchoolSetting (ตั้งค่าโรงเรียน แถว singleton id=1)
 * - users: admin/admin1234 (ADMIN "ครูการเงิน"), teacher1/teacher1234 (TEACHER ประจำ ป.1/1),
 *          executive1/exec1234 (EXECUTIVE "ผู้อำนวยการ" read-only),
 *          parent1/parent1234 (PARENT ผูกกับนักเรียน 2 คน 69001+69002 ผ่าน Guardian)
 * - ห้องเรียน ป.1/1 ถึง ป.6/1
 * - นักเรียนตัวอย่าง 20 คน + บัญชีปี 2569 ทุกคน
 * - ธุรกรรมย้อนหลัง ~2 เดือน (18 พ.ค. 2569 - 1 ก.ค. 2569) ฝากถี่ ถอนบ้าง
 *   แล้วอัปเดต balance ให้ตรงกับผลรวมธุรกรรมจริงใน DB
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ---------- deterministic RNG (seed คงที่ ให้ผล seed ซ้ำได้เหมือนเดิม) ----------
function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(25690702);
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

// ---------- ข้อมูลนักเรียนตัวอย่าง (ชื่อไทยจริง กระจาย ป.1/1 - ป.6/1) ----------
type StudentSeed = { firstName: string; lastName: string; classroom: string };
const STUDENTS: StudentSeed[] = [
  { firstName: "กิตติศักดิ์", lastName: "สายบุตร", classroom: "ป.1/1" },
  { firstName: "น้ำฝน", lastName: "ศรีสุข", classroom: "ป.1/1" },
  { firstName: "ธนากร", lastName: "บุญมาก", classroom: "ป.1/1" },
  { firstName: "พิมพ์ชนก", lastName: "ทองอินทร์", classroom: "ป.1/1" },
  { firstName: "อนุชา", lastName: "แก้วใส", classroom: "ป.2/1" },
  { firstName: "ชลธิชา", lastName: "พรมมี", classroom: "ป.2/1" },
  { firstName: "ภูริภัทร", lastName: "สุขสวัสดิ์", classroom: "ป.2/1" },
  { firstName: "กมลชนก", lastName: "ดวงจันทร์", classroom: "ป.3/1" },
  { firstName: "ศุภกร", lastName: "เพชรดี", classroom: "ป.3/1" },
  { firstName: "อริสา", lastName: "หอมหวล", classroom: "ป.3/1" },
  { firstName: "ณัฐวุฒิ", lastName: "สมหวัง", classroom: "ป.4/1" },
  { firstName: "วรรณิษา", lastName: "จันทร์เต็ม", classroom: "ป.4/1" },
  { firstName: "พีรพัฒน์", lastName: "ใจกล้า", classroom: "ป.4/1" },
  { firstName: "สุพรรษา", lastName: "บุญเลิศ", classroom: "ป.5/1" },
  { firstName: "เจษฎา", lastName: "ศรีวิเศษ", classroom: "ป.5/1" },
  { firstName: "ปนัดดา", lastName: "มั่นยืน", classroom: "ป.5/1" },
  { firstName: "รพีภัทร", lastName: "ทองแท้", classroom: "ป.6/1" },
  { firstName: "จิราพร", lastName: "สุขใจ", classroom: "ป.6/1" },
  { firstName: "วีรภาพ", lastName: "เสาวคนธ์", classroom: "ป.6/1" },
  { firstName: "ฐิติมา", lastName: "แสงทอง", classroom: "ป.6/1" },
];

const CLASSROOM_NAMES = ["ป.1/1", "ป.2/1", "ป.3/1", "ป.4/1", "ป.5/1", "ป.6/1"];

// วันเปิดเรียน - วันสิ้นสุดธุรกรรมตัวอย่าง (ค.ศ. 2026 = พ.ศ. 2569)
const TERM_START = new Date(2026, 4, 18); // 18 พ.ค. 2569 (จันทร์)
const TXN_END = new Date(2026, 6, 1); // 1 ก.ค. 2569

/** คืนรายการวันทำการ (จันทร์-ศุกร์) ระหว่าง start..end */
function schoolDays(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const d = new Date(start);
  while (d <= end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function at(day: Date, hour: number, minute: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0);
}

async function main() {
  console.log("เริ่ม seed ระบบออมทรัพย์โรงเรียนบ้านกะดาด (ปีการศึกษา 2569)...");

  // ---------- guard กันล้างข้อมูลจริงโดยพลาด (ธุรกรรมห้ามลบ) ----------
  // seed จะ deleteMany ทุกตาราง — ถ้า DB มีข้อมูลอยู่แล้ว (ปีการศึกษา/ธุรกรรม)
  // ให้หยุดทันที เว้นแต่ตั้ง env FORCE_SEED=1 เพื่อยืนยันว่าต้องการล้างจริง
  if (process.env.FORCE_SEED !== "1") {
    const [yearCount, txnCount] = await Promise.all([
      prisma.academicYear.count(),
      prisma.transaction.count(),
    ]);
    if (yearCount > 0 || txnCount > 0) {
      console.error(
        "ยกเลิก seed: ฐานข้อมูลมีข้อมูลอยู่แล้ว " +
          `(ปีการศึกษา ${yearCount} รายการ, ธุรกรรม ${txnCount} รายการ)`
      );
      console.error(
        "seed จะลบข้อมูลทั้งหมดรวมถึงธุรกรรมจริง — ถ้าต้องการล้างและ seed ใหม่จริงๆ ให้รันด้วย FORCE_SEED=1"
      );
      console.error("ตัวอย่าง: FORCE_SEED=1 npx tsx prisma/seed.ts");
      process.exit(1);
    }
  }

  // ---------- ล้างข้อมูลเดิม (เรียงตาม FK dependency) ----------
  await prisma.transaction.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.lineLinkCode.deleteMany();
  await prisma.cashClosing.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.student.deleteMany();
  await prisma.classroom.deleteMany();
  await prisma.academicYear.deleteMany();

  // ---------- ตั้งค่าโรงเรียน (singleton id=1) ----------
  await prisma.schoolSetting.upsert({
    where: { id: 1 },
    update: {
      schoolName: "โรงเรียนบ้านกะดาด",
      schoolArea: "สพป.สุรินทร์ เขต 3",
      logoFileName: null,
    },
    create: {
      id: 1,
      schoolName: "โรงเรียนบ้านกะดาด",
      schoolArea: "สพป.สุรินทร์ เขต 3",
    },
  });

  // ---------- ปีการศึกษา 2569 ----------
  const year2569 = await prisma.academicYear.create({
    data: {
      year: 2569,
      isActive: true,
      openedAt: new Date(2026, 4, 16), // 16 พ.ค. 2569
    },
  });

  // ---------- ผู้ใช้: admin + teacher1 ----------
  const admin = await prisma.user.create({
    data: {
      username: "admin",
      passwordHash: await bcrypt.hash("admin1234", 10),
      role: "ADMIN",
      name: "ครูการเงิน",
    },
  });

  const teacher1 = await prisma.user.create({
    data: {
      username: "teacher1",
      passwordHash: await bcrypt.hash("teacher1234", 10),
      role: "TEACHER",
      name: "ครูสุดารัตน์ ใจงาม",
    },
  });

  // ผู้บริหาร (read-only) — ดูแดชบอร์ด/ธุรกรรม/นักเรียน/รายงานได้ แต่แก้ไขไม่ได้
  await prisma.user.create({
    data: {
      username: "executive1",
      passwordHash: await bcrypt.hash("exec1234", 10),
      role: "EXECUTIVE",
      name: "ผู้อำนวยการ",
    },
  });

  // ---------- ห้องเรียน ป.1/1 - ป.6/1 (teacher1 ประจำ ป.1/1) ----------
  const classroomByName = new Map<string, { id: string }>();
  for (const name of CLASSROOM_NAMES) {
    const classroom = await prisma.classroom.create({
      data: {
        academicYearId: year2569.id,
        name,
        teacherId: name === "ป.1/1" ? teacher1.id : null,
      },
    });
    classroomByName.set(name, classroom);
  }

  // ---------- นักเรียน 20 คน ----------
  const students: { id: string; classroom: string; firstName: string }[] = [];
  for (let i = 0; i < STUDENTS.length; i++) {
    const s = STUDENTS[i];
    const student = await prisma.student.create({
      data: {
        studentCode: `69${String(i + 1).padStart(3, "0")}`, // 69001..69020
        firstName: s.firstName,
        lastName: s.lastName,
        classroomId: classroomByName.get(s.classroom)!.id,
        status: "ACTIVE",
      },
    });
    students.push({ id: student.id, classroom: s.classroom, firstName: s.firstName });
  }

  // ---------- parent1 ผูกกับนักเรียน 2 คน (69001 + 69002) ผ่าน Guardian ----------
  // (เดโมฟีเจอร์ "ผู้ปกครองหลายลูก")
  const parent1 = await prisma.user.create({
    data: {
      username: "parent1",
      passwordHash: await bcrypt.hash("parent1234", 10),
      role: "PARENT",
      name: "นางไพลิน สายบุตร",
    },
  });
  await prisma.guardian.createMany({
    data: [
      { userId: parent1.id, studentId: students[0].id }, // 69001
      { userId: parent1.id, studentId: students[1].id }, // 69002
    ],
  });

  // ---------- บัญชีปี 2569 + ธุรกรรมย้อนหลัง ~2 เดือน ----------
  const days = schoolDays(TERM_START, TXN_END);
  const depositAmounts = [5, 10, 10, 20, 20, 50, 100];
  let totalTxns = 0;

  for (const student of students) {
    const account = await prisma.account.create({
      data: {
        studentId: student.id,
        academicYearId: year2569.id,
        openingBalance: 0,
        balance: 0,
      },
    });

    // ครูประจำชั้นบันทึกให้เด็ก ป.1/1 ที่เหลือครูการเงินบันทึก
    const recordedById = student.classroom === "ป.1/1" ? teacher1.id : admin.id;

    type TxnSeed = {
      type: "DEPOSIT" | "WITHDRAW";
      amount: number;
      txnDate: Date;
      note: string | null;
    };
    const txns: TxnSeed[] = [];
    let running = 0;

    for (const day of days) {
      const roll = rand();
      if (roll < 0.45) {
        // ฝาก ~2-3 วันต่อสัปดาห์
        const amount = pick(depositAmounts);
        running += amount;
        txns.push({
          type: "DEPOSIT",
          amount,
          txnDate: at(day, 8, 30 + Math.floor(rand() * 45)),
          note: null,
        });
      } else if (roll < 0.51 && running >= 20) {
        // ถอนบ้าง (ไม่เกินยอดที่มี)
        const amount = Math.min(running, pick([10, 20, 50]));
        running -= amount;
        txns.push({
          type: "WITHDRAW",
          amount,
          txnDate: at(day, 14, 30 + Math.floor(rand() * 30)),
          note: "ถอนซื้ออุปกรณ์การเรียน",
        });
      }
    }

    await prisma.transaction.createMany({
      data: txns.map((t) => ({
        accountId: account.id,
        type: t.type,
        amount: t.amount,
        txnDate: t.txnDate,
        recordedById,
        note: t.note,
        status: "NORMAL" as const,
      })),
    });
    totalTxns += txns.length;

    // ---------- อัปเดต balance จากผลรวมธุรกรรมจริงใน DB (ไม่ใช่ตัวแปรในหน่วยความจำ) ----------
    const [depositSum, withdrawSum] = await Promise.all([
      prisma.transaction.aggregate({
        where: { accountId: account.id, type: "DEPOSIT", status: "NORMAL" },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { accountId: account.id, type: "WITHDRAW", status: "NORMAL" },
        _sum: { amount: true },
      }),
    ]);
    const balance =
      Number(depositSum._sum.amount ?? 0) - Number(withdrawSum._sum.amount ?? 0);
    await prisma.account.update({
      where: { id: account.id },
      data: { balance },
    });

    console.log(
      `  บัญชี ${student.firstName} (${student.classroom}): ${txns.length} รายการ ยอดคงเหลือ ${balance.toFixed(2)} บาท`
    );
  }

  console.log("");
  console.log("seed สำเร็จ:");
  console.log(`  ปีการศึกษา 2569 (active) + ตั้งค่าโรงเรียน (SchoolSetting id=1)`);
  console.log(
    `  ผู้ใช้ 4 คน: admin/admin1234, teacher1/teacher1234, executive1/exec1234, parent1/parent1234`
  );
  console.log(`  parent1 ผูกบุตร 2 คน (69001, 69002) ผ่าน Guardian`);
  console.log(`  ห้องเรียน ${CLASSROOM_NAMES.length} ห้อง, นักเรียน ${students.length} คน`);
  console.log(`  ธุรกรรมรวม ${totalTxns} รายการ (18 พ.ค. - 1 ก.ค. 2569)`);
}

main()
  .catch((e) => {
    console.error("seed ล้มเหลว:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
