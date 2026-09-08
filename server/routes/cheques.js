'use strict';
const express = require('express');
const { db, getSettings } = require('../db');
const { requireStaff } = require('../auth');
const { nowIso, chequeSerial, tafqit, toInt, asyncHandler } = require('../util');
const { chequeCatalog } = require('../catalog');
const { addEntry } = require('./points');

const router = express.Router();

router.get('/catalog', asyncHandler(async (req, res) => {
  res.json({ catalog: await chequeCatalog(), currency: (await getSettings()).currency });
}));

/** currency تُمرَّر جاهزة (تُجلب مرة واحدة لكل طلب) بدل استعلام الإعدادات لكل شيك. */
function hydrate(cheque, currency) {
  return {
    ...cheque,
    items: JSON.parse(cheque.items),
    amount_words: tafqit(cheque.total, currency),
    currency
  };
}

const CHEQUE_QUERY = `
  SELECT c.*, u.name AS student_name, u.photo AS student_photo, u.barcode AS student_barcode,
         h.name AS halaqa_name, a.name AS issued_by_name
    FROM cheques c
    JOIN users u ON u.id = c.student_id
    LEFT JOIN halaqat h ON h.id = c.halaqa_id
    LEFT JOIN users a ON a.id = c.issued_by
`;

router.get('/', requireStaff, asyncHandler(async (req, res) => {
  const params = [];
  let where = 'WHERE 1 = 1';
  if (req.query.type) { where += ' AND c.type = ?'; params.push(String(req.query.type)); }
  if (req.query.student_id) { where += ' AND c.student_id = ?'; params.push(toInt(req.query.student_id)); }
  if (req.query.halaqa_id) { where += ' AND c.halaqa_id = ?'; params.push(toInt(req.query.halaqa_id)); }
  if (req.query.unprinted === '1') where += ' AND c.printed_at IS NULL';
  params.push(Math.min(toInt(req.query.limit, 60), 300));
  const [rows, currency] = await Promise.all([
    db.prepare(`${CHEQUE_QUERY} ${where} ORDER BY c.id DESC LIMIT ?`).all(...params),
    getSettings().then((s) => s.currency)
  ]);
  res.json({ cheques: rows.map((c) => hydrate(c, currency)) });
}));

/** Cheques requested for printing, e.g. /api/cheques/print?ids=4,5,6 */
router.get('/print', requireStaff, asyncHandler(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map((v) => toInt(v)).filter(Boolean);
  if (!ids.length) return res.json({ cheques: [] });
  const placeholders = ids.map(() => '?').join(',');
  const settings = await getSettings();
  const rows = await db.prepare(`${CHEQUE_QUERY} WHERE c.id IN (${placeholders}) ORDER BY c.id`).all(...ids);
  res.json({ cheques: rows.map((c) => hydrate(c, settings.currency)), settings });
}));

/**
 * Issue one cheque per selected student. The chosen line items decide the
 * amount, and the same amount is credited to the student's points balance.
 */
router.post('/', requireStaff, asyncHandler(async (req, res) => {
  const catalog = await chequeCatalog();
  const book = catalog[req.body.type];
  if (!book) return res.status(400).json({ error: 'نوع الشيك غير معروف' });

  const wanted = Array.isArray(req.body.items) ? req.body.items.map(String) : [];
  const items = book.items.filter((item) => wanted.includes(item.key));
  if (!items.length) return res.status(400).json({ error: 'اختر بنداً واحداً على الأقل' });

  const studentIds = (Array.isArray(req.body.student_ids) ? req.body.student_ids : [req.body.student_id])
    .map((v) => toInt(v)).filter(Boolean);
  if (!studentIds.length) return res.status(400).json({ error: 'اختر طالباً واحداً على الأقل' });

  const total = items.reduce((sum, item) => sum + item.points, 0);
  const teacherName = String(req.body.teacher_name || '').trim() || null;
  const note = String(req.body.note || '').trim() || null;
  const issuedAt = nowIso();
  const created = [];

  for (const studentId of studentIds) {
    const student = await db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student' AND active = 1").get(studentId);
    if (!student) continue;
    const halaqa = student.halaqa_id
      ? await db.prepare('SELECT * FROM halaqat WHERE id = ?').get(student.halaqa_id) : null;
    const info = await db.prepare(`
      INSERT INTO cheques (serial, student_id, halaqa_id, type, items, total, teacher_name, note, issued_by, issued_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).run('pending', studentId, student.halaqa_id, book.key, JSON.stringify(items), total,
      teacherName || halaqa?.teacher_name || null, note, req.user.id, issuedAt);
    const id = Number(info.lastInsertRowid);
    const serial = chequeSerial(id, new Date(issuedAt));
    await db.prepare('UPDATE cheques SET serial = ? WHERE id = ?').run(serial, id);

    for (const item of items) {
      await addEntry({
        studentId, category: book.key, subtype: item.key, points: item.points,
        note: item.label, chequeId: id, userId: req.user.id
      });
    }
    created.push(id);
  }

  if (!created.length) return res.status(400).json({ error: 'لم يتم إصدار أي شيك' });
  const placeholders = created.map(() => '?').join(',');
  const currency = (await getSettings()).currency;
  const rows = await db.prepare(`${CHEQUE_QUERY} WHERE c.id IN (${placeholders}) ORDER BY c.id`).all(...created);
  res.status(201).json({ ids: created, cheques: rows.map((c) => hydrate(c, currency)), total });
}));

router.post('/printed', requireStaff, asyncHandler(async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map((v) => toInt(v)).filter(Boolean);
  if (!ids.length) return res.status(400).json({ error: 'لا توجد شيكات' });
  const at = nowIso();
  for (const id of ids) {
    await db.prepare('UPDATE cheques SET printed_at = ? WHERE id = ?').run(at, id);
  }
  res.json({ ok: true, count: ids.length });
}));

/** Cancelling a cheque also removes the points it granted. */
router.delete('/:id', requireStaff, asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const cheque = await db.prepare('SELECT * FROM cheques WHERE id = ?').get(id);
  if (!cheque) return res.status(404).json({ error: 'الشيك غير موجود' });
  await db.prepare('DELETE FROM point_entries WHERE cheque_id = ?').run(id);
  await db.prepare('DELETE FROM cheques WHERE id = ?').run(id);
  res.json({ ok: true });
}));

module.exports = router;
