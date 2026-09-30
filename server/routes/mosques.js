'use strict';
const express = require('express');
const { db, getSettings } = require('../db');
const { requireAdmin } = require('../auth');
const { setMosqueCookie } = require('../mosque');
const { nowIso, toInt, asyncHandler, rangeFor } = require('../util');
const { knightOfWeek, halaqaOfWeek, studentLeaderboard } = require('../stats');

const router = express.Router();

/** قائمة المساجد المفعّلة (عامة): لاختيار المسجد في شاشة العرض */
router.get('/public', asyncHandler(async (req, res) => {
  const rows = await db.prepare('SELECT id, name FROM mosques WHERE active = 1 ORDER BY sort_order, id').all();
  res.json({ mosques: rows });
}));

/** أعداد مجمّعة لكل مسجد في استعلام واحد لكل جدول */
async function countBy(sql, params = []) {
  const rows = await db.prepare(sql).all(...params);
  return new Map(rows.map((row) => [row.mosque_id, Number(row.n) || 0]));
}

/**
 * لوحة مدير المنصة: بيانات كل المساجد جنباً إلى جنب، مع فارس الأسبوع وحلقة
 * الأسبوع لكل مسجد وأعلى الطلاب على مستوى المنصة.
 */
router.get('/', requireAdmin, asyncHandler(async (req, res) => {
  const settings = await getSettings();
  const week = rangeFor('week', toInt(settings.week_start_day, 0));
  const month = rangeFor('month');

  const mosques = await db.prepare('SELECT * FROM mosques ORDER BY sort_order, id').all();
  const [students, halaqat, supervisors, weekPoints, monthPoints, allPoints, balance, pending, cheques, vouchers] = await Promise.all([
    countBy("SELECT mosque_id, COUNT(*) AS n FROM users WHERE role = 'student' AND active = 1 GROUP BY mosque_id"),
    countBy('SELECT mosque_id, COUNT(*) AS n FROM halaqat WHERE active = 1 GROUP BY mosque_id'),
    countBy("SELECT mosque_id, COUNT(*) AS n FROM users WHERE role = 'supervisor' AND active = 1 GROUP BY mosque_id"),
    countBy(`SELECT mosque_id, COALESCE(SUM(points), 0) AS n FROM point_entries
              WHERE points > 0 AND created_at >= ? AND created_at < ? GROUP BY mosque_id`, [week.from, week.to]),
    countBy(`SELECT mosque_id, COALESCE(SUM(points), 0) AS n FROM point_entries
              WHERE points > 0 AND created_at >= ? AND created_at < ? GROUP BY mosque_id`, [month.from, month.to]),
    countBy('SELECT mosque_id, COALESCE(SUM(points), 0) AS n FROM point_entries WHERE points > 0 GROUP BY mosque_id'),
    countBy('SELECT mosque_id, COALESCE(SUM(points), 0) AS n FROM point_entries WHERE student_id IS NOT NULL GROUP BY mosque_id'),
    countBy(`SELECT u.mosque_id, COUNT(*) AS n FROM redemptions r JOIN users u ON u.id = r.student_id
              WHERE r.status = 'pending' GROUP BY u.mosque_id`),
    countBy('SELECT mosque_id, COUNT(*) AS n FROM cheques WHERE issued_at >= ? AND issued_at < ? GROUP BY mosque_id',
      [week.from, week.to]),
    countBy(`SELECT mosque_id, COUNT(*) AS n FROM cheque_vouchers
              WHERE redeemed_at >= ? AND redeemed_at < ? GROUP BY mosque_id`, [week.from, week.to])
  ]);

  const rows = [];
  for (const mosque of mosques) {
    const [knight, halaqa] = mosque.active
      ? await Promise.all([knightOfWeek(mosque.id), halaqaOfWeek(mosque.id)]) : [null, null];
    rows.push({
      ...mosque,
      students: students.get(mosque.id) || 0,
      halaqat: halaqat.get(mosque.id) || 0,
      supervisors: supervisors.get(mosque.id) || 0,
      week_points: weekPoints.get(mosque.id) || 0,
      month_points: monthPoints.get(mosque.id) || 0,
      total_points: allPoints.get(mosque.id) || 0,
      balance: balance.get(mosque.id) || 0,
      pending_orders: pending.get(mosque.id) || 0,
      week_cheques: (cheques.get(mosque.id) || 0) + (vouchers.get(mosque.id) || 0),
      knight: knight ? { id: knight.id, name: knight.name, photo: knight.photo, points: knight.points, halaqa_name: knight.halaqa_name } : null,
      halaqa_of_week: halaqa ? { id: halaqa.id, name: halaqa.name, points: halaqa.points } : null
    });
  }

  const top = await studentLeaderboard({ from: week.from, to: week.to, limit: 10 });
  const sum = (key) => rows.reduce((total, row) => total + (row[key] || 0), 0);
  res.json({
    mosques: rows,
    top_students: top.filter((s) => s.points > 0),
    totals: {
      students: sum('students'),
      halaqat: sum('halaqat'),
      supervisors: sum('supervisors'),
      week_points: sum('week_points'),
      month_points: sum('month_points'),
      total_points: sum('total_points'),
      pending_orders: sum('pending_orders'),
      week_cheques: sum('week_cheques')
    },
    period_label: week.label,
    current: req.mosqueId || null
  });
}));

/** إضافة مسجد جديد — يبدأ فارغاً بواجهة كاملة مثل بقية المساجد */
router.post('/', requireAdmin, asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'اسم المسجد مطلوب' });
  const last = await db.prepare('SELECT MAX(sort_order) AS n FROM mosques').get();
  const info = await db.prepare(`
    INSERT INTO mosques (name, active, sort_order, created_at) VALUES (?, 1, ?, ?)
    RETURNING id
  `).run(name, toInt(last && last.n, 0) + 1, nowIso());
  const mosque = await db.prepare('SELECT * FROM mosques WHERE id = ?').get(Number(info.lastInsertRowid));
  res.status(201).json({ mosque });
}));

/** تعديل اسم المسجد أو تعطيله (المسجد المعطَّل لا يدخله مشرفوه وطلابه) */
router.patch('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const mosque = await db.prepare('SELECT * FROM mosques WHERE id = ?').get(id);
  if (!mosque) return res.status(404).json({ error: 'المسجد غير موجود' });
  const fields = [];
  const params = [];
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return res.status(400).json({ error: 'اسم المسجد مطلوب' });
    fields.push('name = ?');
    params.push(name);
  }
  if (req.body.active !== undefined) { fields.push('active = ?'); params.push(req.body.active ? 1 : 0); }
  if (!fields.length) return res.status(400).json({ error: 'لا يوجد تعديل' });
  params.push(id);
  await db.prepare(`UPDATE mosques SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true, mosque: await db.prepare('SELECT * FROM mosques WHERE id = ?').get(id) });
}));

/**
 * دخول مدير المنصة إلى واجهة مسجد (أو العودة للوحة المنصة بإرسال id فارغ).
 * يُحفظ الاختيار في ملف تعريف ارتباط يُرسل تلقائياً مع صفحات الطباعة أيضاً.
 */
router.post('/enter', requireAdmin, asyncHandler(async (req, res) => {
  const id = toInt(req.body.id);
  if (!id) {
    setMosqueCookie(res, null);
    return res.json({ ok: true, mosque: null });
  }
  const mosque = await db.prepare('SELECT id, name, active FROM mosques WHERE id = ?').get(id);
  if (!mosque) return res.status(404).json({ error: 'المسجد غير موجود' });
  setMosqueCookie(res, mosque.id);
  res.json({ ok: true, mosque });
}));

module.exports = router;
