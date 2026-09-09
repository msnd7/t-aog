'use strict';
const express = require('express');
const { db, getSettings } = require('../db');
const { requireStaff } = require('../auth');
const { nowIso, toInt, asyncHandler, isVoucherCode } = require('../util');
const { CATEGORY_LABELS } = require('../catalog');
const { studentWallet } = require('../stats');

const router = express.Router();

/** Inserts one point entry, always stamping the student's current halaqa. */
async function addEntry({ studentId = null, halaqaId = null, category, subtype = null, points, note = null, chequeId = null, userId = null }) {
  let halaqa = halaqaId;
  if (studentId && !halaqa) {
    const row = await db.prepare('SELECT halaqa_id FROM users WHERE id = ?').get(studentId);
    halaqa = row?.halaqa_id || null;
  }
  const info = await db.prepare(`
    INSERT INTO point_entries (student_id, halaqa_id, category, subtype, points, note, cheque_id, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING id
  `).run(studentId, halaqa, category, subtype, Math.round(points), note, chequeId, userId, nowIso());
  return Number(info.lastInsertRowid);
}

router.get('/', requireStaff, asyncHandler(async (req, res) => {
  const limit = Math.min(toInt(req.query.limit, 50), 300);
  const params = [];
  let where = 'WHERE 1 = 1';
  if (req.query.student_id) { where += ' AND e.student_id = ?'; params.push(toInt(req.query.student_id)); }
  if (req.query.halaqa_id) { where += ' AND e.halaqa_id = ?'; params.push(toInt(req.query.halaqa_id)); }
  params.push(limit);
  const rows = await db.prepare(`
    SELECT e.*, u.name AS student_name, h.name AS halaqa_name, a.name AS by_name
      FROM point_entries e
      LEFT JOIN users u ON u.id = e.student_id
      LEFT JOIN halaqat h ON h.id = e.halaqa_id
      LEFT JOIN users a ON a.id = e.created_by
      ${where}
     ORDER BY e.created_at DESC, e.id DESC LIMIT ?
  `).all(...params);
  res.json({ entries: rows.map((e) => ({ ...e, category_label: CATEGORY_LABELS[e.category] || e.category })) });
}));

/** Manual award — to a single student, a list of students, or a whole halaqa. */
router.post('/', requireStaff, asyncHandler(async (req, res) => {
  const points = toInt(req.body.points);
  if (!points) return res.status(400).json({ error: 'أدخل عدد النقاط' });
  const note = String(req.body.note || '').trim() || null;
  const category = req.body.halaqa_only ? 'halaqa_bonus' : (req.body.category || 'manual');
  const userId = req.user.id;

  if (req.body.halaqa_only) {
    const halaqaId = toInt(req.body.halaqa_id);
    if (!halaqaId) return res.status(400).json({ error: 'اختر الحلقة' });
    const id = await addEntry({ halaqaId, category: 'halaqa_bonus', points, note, userId });
    return res.status(201).json({ ok: true, ids: [id] });
  }

  const ids = Array.isArray(req.body.student_ids) && req.body.student_ids.length
    ? req.body.student_ids.map((v) => toInt(v)).filter(Boolean)
    : [toInt(req.body.student_id)].filter(Boolean);
  if (!ids.length) return res.status(400).json({ error: 'اختر طالباً واحداً على الأقل' });

  const created = [];
  for (const studentId of ids) {
    created.push(await addEntry({
      studentId, category, subtype: req.body.subtype || null, points, note, userId
    }));
  }
  res.status(201).json({ ok: true, ids: created, count: created.length });
}));

/** Undo an entry (also removes the cheque when the entry belonged to one). */
router.delete('/:id', requireStaff, asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const entry = await db.prepare('SELECT * FROM point_entries WHERE id = ?').get(id);
  if (!entry) return res.status(404).json({ error: 'الحركة غير موجودة' });
  await db.prepare('DELETE FROM point_entries WHERE id = ?').run(id);
  if (entry.cheque_id) await db.prepare('DELETE FROM cheques WHERE id = ?').run(entry.cheque_id);
  res.json({ ok: true, wallet: entry.student_id ? await studentWallet(entry.student_id) : null });
}));

/**
 * Barcode scan: every scan of a student's card adds the configured amount
 * (25 points by default). A short cooldown prevents double scans.
 */
router.post('/scan', requireStaff, asyncHandler(async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'لم يتم قراءة الباركود' });

  // باركود شيك فارغ: لا يضيف نقاطاً بنفسه، بل ينتظر مسح بطاقة الطالب بعده
  if (isVoucherCode(code)) {
    const voucher = await db.prepare('SELECT * FROM cheque_vouchers WHERE upper(code) = ?').get(code);
    if (!voucher) return res.status(404).json({ error: `لا يوجد شيك بالباركود ${code}` });
    if (voucher.redeemed_at) {
      const owner = await db.prepare('SELECT name FROM users WHERE id = ?').get(voucher.student_id);
      return res.status(409).json({
        error: `الشيك ${voucher.code} مصروف مسبقاً${owner ? ` للطالب ${owner.name}` : ''}`,
        kind: 'voucher', voucher, duplicate: true
      });
    }
    return res.json({ ok: true, kind: 'voucher', voucher });
  }

  const settings = await getSettings();
  const student = await db.prepare(`
    SELECT u.*, h.name AS halaqa_name FROM users u LEFT JOIN halaqat h ON h.id = u.halaqa_id
     WHERE upper(u.barcode) = ? AND u.role = 'student' AND u.active = 1
  `).get(code);
  if (!student) return res.status(404).json({ error: `لا يوجد طالب بالباركود ${code}` });

  const cooldown = toInt(settings.scan_cooldown_seconds, 20);
  const since = new Date(Date.now() - cooldown * 1000).toISOString();
  const recent = await db.prepare(`
    SELECT * FROM point_entries WHERE student_id = ? AND category = 'scan' AND created_at > ?
     ORDER BY id DESC LIMIT 1
  `).get(student.id, since);
  if (recent) {
    return res.status(409).json({
      error: `تم مسح باركود ${student.name} قبل قليل`,
      student: { id: student.id, name: student.name, photo: student.photo, halaqa_name: student.halaqa_name },
      wallet: await studentWallet(student.id),
      duplicate: true
    });
  }

  const points = toInt(req.body.points, toInt(settings.scan_points, 25)) || toInt(settings.scan_points, 25);
  await addEntry({
    studentId: student.id, category: 'scan', subtype: 'barcode', points,
    note: String(req.body.note || '').trim() || null, userId: req.user.id
  });
  res.status(201).json({
    ok: true,
    kind: 'student',
    points,
    student: {
      id: student.id, name: student.name, photo: student.photo,
      barcode: student.barcode, halaqa_name: student.halaqa_name
    },
    wallet: await studentWallet(student.id)
  });
}));

module.exports = { router, addEntry };
