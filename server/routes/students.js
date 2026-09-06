'use strict';
const express = require('express');
const { db } = require('../db');
const { hashPassword, requireAuth, requireStaff } = require('../auth');
const { nowIso, makeBarcode, toInt } = require('../util');
const { studentLeaderboard, studentWallet, studentRank, currentRange } = require('../stats');
const { upload, uploadUrl } = require('../upload');

const router = express.Router();

const isStaff = (user) => user && (user.role === 'admin' || user.role === 'supervisor');

function slugUsername(base) {
  const clean = String(base || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  return clean || `st${Date.now().toString(36)}`;
}

function uniqueUsername(candidate) {
  let username = slugUsername(candidate);
  let suffix = 1;
  while (db.prepare('SELECT 1 FROM users WHERE lower(username) = ?').get(username)) {
    username = `${slugUsername(candidate)}${++suffix}`;
  }
  return username;
}

/** Creates a student together with a login and a printable barcode. */
function createStudent({ name, halaqaId, username, password }) {
  const created = nowIso();
  const info = db.prepare(`
    INSERT INTO users (username, password_hash, role, name, halaqa_id, active, created_at)
    VALUES (?, ?, 'student', ?, ?, 1, ?)
  `).run(`tmp-${created}-${Math.random()}`, hashPassword('temp'), name, halaqaId || null, created);
  const id = Number(info.lastInsertRowid);
  const barcode = makeBarcode(id);
  const finalUsername = uniqueUsername(username || barcode);
  const finalPassword = password || barcode;
  db.prepare('UPDATE users SET username = ?, password_hash = ?, barcode = ? WHERE id = ?')
    .run(finalUsername, hashPassword(finalPassword), barcode, id);
  return { id, name, barcode, username: finalUsername, password: finalPassword, halaqa_id: halaqaId || null };
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
    rows = rows.filter((r) => r.name.toLowerCase().includes(needle) || (r.barcode || '').toLowerCase().includes(needle));
  }
  res.json({ students: rows, period });
});

// ---- profile -------------------------------------------------------------

router.get('/:id', requireAuth, (req, res) => {
  const id = toInt(req.params.id);
  if (!isStaff(req.user) && req.user.id !== id) return res.status(403).json({ error: 'غير مصرح' });
  const student = db.prepare(`
    SELECT u.id, u.name, u.username, u.photo, u.barcode, u.halaqa_id, u.active, u.created_at,
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
  const student = createStudent({
    name,
    halaqaId: toInt(req.body.halaqa_id) || null,
    username: req.body.username,
    password: req.body.password
  });
  res.status(201).json({ student });
});

/** Bulk import: one student name per line. */
router.post('/bulk', requireStaff, (req, res) => {
  const halaqaId = toInt(req.body.halaqa_id) || null;
  const names = String(req.body.names || '')
    .split('\n').map((n) => n.trim()).filter(Boolean);
  if (!names.length) return res.status(400).json({ error: 'أدخل أسماء الطلاب، اسم في كل سطر' });
  const created = names.map((name) => createStudent({ name, halaqaId }));
  res.status(201).json({ created, count: created.length });
});

// ---- updates -------------------------------------------------------------

router.patch('/:id', requireAuth, (req, res) => {
  const id = toInt(req.params.id);
  const student = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student'").get(id);
  if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
  const staff = isStaff(req.user);
  if (!staff && req.user.id !== id) return res.status(403).json({ error: 'غير مصرح' });

  const fields = [];
  const params = [];
  if (staff && req.body.name !== undefined) { fields.push('name = ?'); params.push(String(req.body.name).trim()); }
  if (staff && req.body.halaqa_id !== undefined) {
    fields.push('halaqa_id = ?'); params.push(toInt(req.body.halaqa_id) || null);
  }
  if (staff && req.body.active !== undefined) { fields.push('active = ?'); params.push(req.body.active ? 1 : 0); }
  if (staff && req.body.username) {
    const username = uniqueUsername(req.body.username);
    fields.push('username = ?'); params.push(username);
  }
  if (staff && req.body.password) { fields.push('password_hash = ?'); params.push(hashPassword(req.body.password)); }
  if (!fields.length) return res.status(400).json({ error: 'لا يوجد تعديل' });
  params.push(id);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true, student: db.prepare('SELECT id, name, username, halaqa_id, active, barcode, photo FROM users WHERE id = ?').get(id) });
});

/** Personal photo — students upload their own, staff can upload for anybody. */
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
