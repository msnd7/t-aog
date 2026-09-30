'use strict';
/**
 * Fills the database with a realistic demo: circles, students, cheques,
 * scans and store rewards — handy for trying the screens before the real
 * data is entered. Run with:  npm run seed
 * البيانات تُضاف للمسجد الأول، أو لمسجد محدد:  npm run seed -- --mosque=2
 */
const { db } = require('../server/db');
const { ensureAdmin } = require('../server/index');
const { createStudent } = require('../server/routes/students');
const { addEntry } = require('../server/routes/points');
const { nowIso } = require('../server/util');

const HALAQAT = [
  { name: 'حلقة أُبيّ بن كعب', teacher_name: 'الأستاذ خالد العمري' },
  { name: 'حلقة زيد بن ثابت', teacher_name: 'الأستاذ عبدالله الشمري' },
  { name: 'حلقة معاذ بن جبل', teacher_name: 'الأستاذ سلطان القحطاني' },
  { name: 'حلقة أبو الدرداء', teacher_name: 'الأستاذ ماجد الدوسري' }
];

const NAMES = [
  'عبدالرحمن الأحمد', 'محمد العتيبي', 'سعود الحربي', 'يوسف الزهراني', 'خالد المطيري',
  'إبراهيم الغامدي', 'عمر السبيعي', 'أنس الشهري', 'تركي القرني', 'فيصل البقمي',
  'ريان الدوسري', 'نايف العنزي', 'سلمان الرشيدي', 'زياد الخالدي', 'حسن الجهني',
  'ماجد الشمراني', 'بدر العسيري', 'راكان الثقفي', 'وليد الحازمي', 'طلال المالكي',
  'أحمد الصاعدي', 'صالح البلوي', 'مهند الحميد', 'عبدالله الفهيد'
];

const REWARDS = [
  { name: 'دراجة هوائية', price: 1200, description: 'جائزة الصدارة للفصل الدراسي' },
  { name: 'ساعة ذكية', price: 800, description: 'لأصحاب الحضور المبكر المستمر' },
  { name: 'سماعة رأس', price: 500, description: 'لسماع القرآن والمراجعة' },
  { name: 'حقيبة مدرسية', price: 350, description: 'حقيبة أنيقة بشعار المجمع' },
  { name: 'مصحف فاخر', price: 200, description: 'مصحف بغلاف جلدي' },
  { name: 'قسيمة كتب', price: 150, description: 'قسيمة شراء من مكتبة المجمع' },
  { name: 'وجبة مطعم', price: 100, description: 'وجبة من المطعم المجاور' },
  { name: 'أقلام وكراسات', price: 50, description: 'طقم أدوات مكتبية' }
];

function isoDaysAgo(days, hour = 17) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, Math.floor(Math.random() * 59), 0, 0);
  // never place demo activity in the future (matters for today's entries)
  const now = Date.now() - 60000;
  return new Date(Math.min(d.getTime(), now)).toISOString();
}

async function backdate(entryId, iso) {
  await db.prepare('UPDATE point_entries SET created_at = ? WHERE id = ?').run(iso, entryId);
}

async function run() {
  await ensureAdmin();
  const wanted = Number((process.argv.find((a) => a.startsWith('--mosque=')) || '').split('=')[1]) || null;
  const mosque = wanted
    ? await db.prepare('SELECT id, name FROM mosques WHERE id = ?').get(wanted)
    : await db.prepare('SELECT id, name FROM mosques ORDER BY sort_order, id LIMIT 1').get();
  if (!mosque) {
    console.log('المسجد المطلوب غير موجود.');
    return;
  }
  const mosqueId = mosque.id;
  const existingRow = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND mosque_id = ?").get(mosqueId);
  const existing = Number(existingRow.n);
  if (existing > 0 && !process.argv.includes('--force')) {
    console.log(`يوجد ${existing} طالباً في ${mosque.name}. استخدم --force لإضافة بيانات تجريبية فوقها.`);
    return;
  }
  const admin = await db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();

  const halaqaIds = [];
  for (const h of HALAQAT) {
    const info = await db.prepare(`
      INSERT INTO halaqat (name, teacher_name, active, created_at, mosque_id) VALUES (?, ?, 1, ?, ?)
      RETURNING id
    `).run(h.name, h.teacher_name, nowIso(), mosqueId);
    halaqaIds.push(Number(info.lastInsertRowid));
  }

  const students = [];
  for (const [index, name] of NAMES.entries()) {
    students.push(await createStudent({
      name,
      halaqaId: halaqaIds[index % halaqaIds.length],
      phone: `05${mosqueId}${String(1000001 + index).padStart(7, '0')}`,
      mosqueId
    }));
  }

  for (const student of students) {
    for (let day = 0; day < 12; day += 1) {
      if (Math.random() < 0.25) continue;
      const early = Math.random() < 0.45;
      await backdate(await addEntry({
        studentId: student.id, category: 'attendance', subtype: early ? 'early' : 'general',
        points: early ? 70 : 50, note: early ? 'الحضور المبكر' : 'الحضور العام', userId: admin?.id
      }), isoDaysAgo(day, 16));

      const roll = Math.random();
      const recitation = roll < 0.35 ? ['both', 50, 'حفظ ومراجعة']
        : roll < 0.7 ? ['hifz', 25, 'حفظ'] : ['review', 25, 'مراجعة'];
      await backdate(await addEntry({
        studentId: student.id, category: 'recitation', subtype: recitation[0],
        points: recitation[1], note: recitation[2], userId: admin?.id
      }), isoDaysAgo(day, 17));

      if (Math.random() < 0.4) {
        await backdate(await addEntry({
          studentId: student.id, category: 'discipline', subtype: 'discipline',
          points: 25, note: 'الانضباط والأخلاق', userId: admin?.id
        }), isoDaysAgo(day, 18));
      }
      if (Math.random() < 0.5) {
        await backdate(await addEntry({
          studentId: student.id, category: 'scan', subtype: 'barcode', points: 25,
          note: 'مسح الباركود', userId: admin?.id
        }), isoDaysAgo(day, 18));
      }
    }
  }

  for (const halaqaId of halaqaIds) {
    await backdate(await addEntry({
      halaqaId, category: 'halaqa_bonus', points: 25 * (1 + Math.floor(Math.random() * 6)),
      note: 'نظافة وترتيب الحلقة', userId: admin?.id
    }), isoDaysAgo(2, 19));
  }

  for (const reward of REWARDS) {
    await db.prepare(`
      INSERT INTO rewards (name, description, price, stock, active, created_at, mosque_id) VALUES (?, ?, ?, ?, 1, ?, ?)
    `).run(reward.name, reward.description, reward.price, -1, nowIso(), mosqueId);
  }

  console.log(`تمت التهيئة في ${mosque.name}: ${halaqaIds.length} حلقات، ${students.length} طالباً، ${REWARDS.length} جوائز.`);
  console.log('نموذج لحساب طالب: رقم الجوال', students[0].phone, '— الرمز المؤقت', students[0].code);
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
