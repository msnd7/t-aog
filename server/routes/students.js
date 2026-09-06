'use strict';
const express = require('express');
const { db, getSettings } = require('../db');
const { hashCode, requireAuth, requireStaff } = require('../auth');
const { nowIso, makeBarcode, toInt, normalizePhone } = require('../util');
const { studentLeaderboard, studentWallet, studentRank, currentRange } = require('../stats');
const { upload, uploadUrl } = require('../upload');

const router = express.Router();

const isStaff = (user) => user && (user.role === 'admin' || user.role === 'supervisor');
const defaultCode = () => getSettings().default_code || '1234';

function phoneTaken(phone, exceptId = null) {
  const row = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  return !!row && row.id !== exceptId;
}

/**
 * إنشاء طالب: يُسجّل المشرف الاسم ورقم الجوال، ويُمنح الطالب الرمز المؤقت
 * ويُطلب منه تغييره عند أول دخول. الباركود يُولَّد تلقائياً للرصد.
 */
function createStudent({ name, halaqaId, phone }) {
  const created = nowIso();
  const code = defaultCode();
  const info = db.prepare(`
    INSERT INTO users (phone, code_hash, must_change_code, role, name, halaqa_id, active, created_at)
    VALUES (?, ?, 1, 'student', ?, ?, 1, ?)
  `).run(phone || null, hashCode(code), name, halaqaId || null, created);
  const id = Number(info.lastInsertRowid);
  const barcode = makeBarcode(id);
  db.prepare('UPDATE users SET barcode = ? WHERE id = ?').run(barcode, id);
  return { id, name, phone: phone || null, barcode, code, halaqa_id: halaqaId || null };
}

// ---- listing -------------------------------------------------------------

router.get('/', requireStaff, (req, res) => {
  const period = req.query.period || 'week';
  const { from, to } = currentRange(period);
  const halaqaId = req.query.halaqa ? toInt(req.query.halaqa) : null;
  let rows = studentLeaderboard({ from, to, halaqaId });
  const totals = db.prepare(`
    SELECT student_id,
           COALESCE(SUM(CASE WHEN points > 0 THEN points ELSE 0 END), 0) AS earned,
           COALESCE(SUM(points), 0) AS balance
      FROM point_entries WHERE student_id IS NOT NULL GROUP BY student_id
  `).all();
  const byId = new Map(totals.map((t) => [t.student_id, t]));
  rows = rows.map((row) => ({
    ...row,
    period_points: row.points,
    earned: byId.get(row.id)?.earned || 0,
    balance: byId.get(row.id)?.balance || 0
  }));
  const q = String(req.query.q || '').trim();
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(needle)
      || (r.barcode || '').toLowerCase().includes(needle)
      || (r.phone || '').includes(needle));
  }
  res.json({ students: rows, period });
});

// ---- profile -------------------------------------------------------------

router.get('/:id', requireAuth, (req, res) => {
  const id = toInt(req.params.id);
  if (!isStaff(req.user) && req.user.id !== id) return res.status(403).json({ error: 'غير مصرح' });
  const student = db.prepare(`
    SELECT u.id, u.name, u.phone, u.photo, u.barcode, u.halaqa_id, u.active, u.created_at, u.must_change_code,
           h.name AS halaqa_name, h.teacher_name
      FROM users u LEFT JOIN halaqat h ON h.id = u.halaqa_id
     WHERE u.id = ? AND u.role = 'student'
  `).get(id);
  if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });

  const entries = db.prepare(`
    SELECT e.*, c.serial AS cheque_serial, c.type AS cheque_type
      FROM point_entries e LEFT JOIN cheques c ON c.id = e.cheque_id
     WHERE e.student_id = ? ORDER BY e.created_at DESC, e.id DESC LIMIT 80
  `).all(id);
  const cheques = db.prepare('SELECT * FROM cheques WHERE student_id = ? ORDER BY id DESC LIMIT 30').all(id);
  res.json({
    student,
    wallet: studentWallet(id),
    week_points: studentLeaderboard({ ...currentRange('week') }).find((s) => s.id === id)?.points || 0,
    rank: studentRank(id, 'week'),
    entries,
    cheques: cheques.map((c) => ({ ...c, items: JSON.parse(c.items) }))
  });
});

// ---- creation ------------------------------------------------------------

router.post('/', requireStaff, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'اسم الطالب مطلوب' });
  let phone = null;
  if (String(req.body.phone || '').trim()) {
    phone = normalizePhone(req.body.phone);
    if (!phone) return res.status(400).json({ error: 'رقم الجوال غير صحيح، مثال: 0501234567' });
    if (phoneTaken(phone)) return res.status(409).json({ error: 'رقم الجوال مسجَّل لحساب آخر' });
  }
  const student = createStudent({ name, halaqaId: toInt(req.body.halaqa_id) || null, phone });
  res.status(201).json({ student });
});

/**
 * إضافة دفعة: كل سطر «اسم الطالب, رقم الجوال» (الرقم اختياري).
 */
router.post('/bulk', requireStaff, (req, res) => {
  const halaqaId = toInt(req.body.halaqa_id) || null;
  const lines = String(req.body.names || '').split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return res.status(400).json({ error: 'أدخل أسماء الطلاب، سطر لكل طالب' });

  const created = [];
  const skipped = [];
  for (const line of lines) {
    const [rawName, rawPhone] = line.split(/[,،\t|]/);
    const name = String(rawName || '').trim();
    if (!name) continue;
    let phone = null;
    if (rawPhone && rawPhone.trim()) {
      phone = normalizePhone(rawPhone);
      if (!phone) { skipped.push({ line, reason: 'رقم جوال غير صحيح' }); continue; }
      if (phoneTaken(phone)) { skipped.push({ line, reason: 'رقم الجوال مكرر' }); continue; }
    }
    created.push(createStudent({ name, halaqaId, phone }));
  }
  if (!created.length) return res.status(400).json({ error: 'لم تتم إضافة أي طالب', skipped });
  res.status(201).json({ created, count: created.length, skipped });
});

// ---- updates -------------------------------------------------------------

router.patch('/:id', requireAuth, (req, res) => {
  const id = toInt(req.params.id);
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(id);
  if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
  const staff = isStaff(req.user);
  if (!staff && req.user.id !== id) return res.status(403).json({ error: 'غير مصرح' });
  if (!staff) return res.status(403).json({ error: 'تعديل البيانات من صلاحية المشرف' });

  const fields = [];
  const params = [];
  if (req.body.name !== undefined) { fields.push('name = ?'); params.push(String(req.body.name).trim()); }
  if (req.body.halaqa_id !== undefined) { fields.push('halaqa_id = ?'); params.push(toInt(req.body.halaqa_id) || null); }
  if (req.body.active !== undefined) { fields.push('active = ?'); params.push(req.body.active ? 1 : 0); }
  if (req.body.phone !== undefined) {
    const raw = String(req.body.phone || '').trim();
    let phone = null;
    if (raw) {
      phone = normalizePhone(raw);
      if (!phone) return res.status(400).json({ error: 'رقم الجوال غير صحيح، مثال: 0501234567' });
      if (phoneTaken(phone, id)) return res.status(409).json({ error: 'رقم الجوال مسجَّل لحساب آخر' });
    }
    fields.push('phone = ?');
    params.push(phone);
  }
  if (!fields.length) return res.status(400).json({ error: 'لا يوجد تعديل' });
  params.push(id);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  res.json({
    ok: true,
    student: db.prepare('SELECT id, name, phone, halaqa_id, active, barcode, photo FROM users WHERE id = ?').get(id)
  });
});

/** إعادة الرمز إلى الرمز المؤقت وإجبار الطالب على تغييره عند الدخول */
router.post('/:id/reset-code', requireStaff, (req, res) => {
  const id = toInt(req.params.id);
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(id);
  if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
  const code = defaultCode();
  db.prepare('UPDATE users SET code_hash = ?, must_change_code = 1 WHERE id = ?').run(hashCode(code), id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  res.json({ ok: true, code });
});

/** الصورة الشخصية — يرفعها الطالب بنفسه أو المشرف نيابة عنه */
router.post('/:id/photo', requireAuth, upload.single('photo'), (req, res) => {
  const id = toInt(req.params.id);
  if (!isStaff(req.user) && req.user.id !== id) return res.status(403).json({ error: 'غير مصرح' });
  if (!req.file) return res.status(400).json({ error: 'لم يتم اختيار صورة' });
  const url = uploadUrl(req.file.filename);
  db.prepare('UPDATE users SET photo = ? WHERE id = ?').run(url, id);
  res.json({ ok: true, photo: url });
});

router.delete('/:id', requireStaff, (req, res) => {
  const id = toInt(req.params.id);
  const hasEntries = db.prepare('SELECT 1 FROM point_entries WHERE student_id = ? LIMIT 1').get(id);
  if (hasEntries) {
    db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id);
    return res.json({ ok: true, archived: true });
  }
  db.prepare("DELETE FROM users WHERE id = ? AND role = 'student'").run(id);
  res.json({ ok: true, deleted: true });
});

module.exports = { router, createStudent };
