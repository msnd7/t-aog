'use strict';
const express = require('express');
const { db } = require('../db');
const { requireStaff, requireAdmin } = require('../auth');
const { nowIso, toInt } = require('../util');
const { halaqaLeaderboard, studentLeaderboard, currentRange } = require('../stats');

const router = express.Router();

router.get('/', (req, res) => {
  const period = req.query.period || 'week';
  const { from, to, label } = currentRange(period);
  const rows = halaqaLeaderboard({ from, to });
  const allTime = new Map(halaqaLeaderboard({}).map((h) => [h.id, h.points]));
  res.json({
    halaqat: rows.map((h) => ({ ...h, period_points: h.points, total_points: allTime.get(h.id) || 0 })),
    period,
    period_label: label
  });
});

router.get('/:id', (req, res) => {
  const id = toInt(req.params.id);
  const halaqa = db.prepare('SELECT * FROM halaqat WHERE id = ?').get(id);
  if (!halaqa) return res.status(404).json({ error: 'الحلقة غير موجودة' });
  const period = req.query.period || 'week';
  const { from, to } = currentRange(period);
  const members = studentLeaderboard({ from, to, halaqaId: id });
  const totals = halaqaLeaderboard({ from, to }).find((h) => h.id === id) || { points: 0, rank: null };
  const bonuses = db.prepare(`
    SELECT * FROM point_entries WHERE halaqa_id = ? AND student_id IS NULL
     ORDER BY created_at DESC LIMIT 20
  `).all(id);
  res.json({ halaqa, members, totals, bonuses, period });
});

router.post('/', requireStaff, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'اسم الحلقة مطلوب' });
  const info = db.prepare(`
    INSERT INTO halaqat (name, teacher_name, supervisor_id, active, created_at) VALUES (?, ?, ?, 1, ?)
  `).run(name, String(req.body.teacher_name || '').trim() || null, toInt(req.body.supervisor_id) || null, nowIso());
  res.status(201).json({ halaqa: db.prepare('SELECT * FROM halaqat WHERE id = ?').get(Number(info.lastInsertRowid)) });
});

router.patch('/:id', requireStaff, (req, res) => {
  const id = toInt(req.params.id);
  const fields = [];
  const params = [];
  if (req.body.name !== undefined) { fields.push('name = ?'); params.push(String(req.body.name).trim()); }
  if (req.body.teacher_name !== undefined) { fields.push('teacher_name = ?'); params.push(String(req.body.teacher_name).trim() || null); }
  if (req.body.supervisor_id !== undefined) { fields.push('supervisor_id = ?'); params.push(toInt(req.body.supervisor_id) || null); }
  if (req.body.active !== undefined) { fields.push('active = ?'); params.push(req.body.active ? 1 : 0); }
  if (!fields.length) return res.status(400).json({ error: 'لا يوجد تعديل' });
  params.push(id);
  db.prepare(`UPDATE halaqat SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true, halaqa: db.prepare('SELECT * FROM halaqat WHERE id = ?').get(id) });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const id = toInt(req.params.id);
  const used = db.prepare('SELECT 1 FROM users WHERE halaqa_id = ? LIMIT 1').get(id)
    || db.prepare('SELECT 1 FROM point_entries WHERE halaqa_id = ? LIMIT 1').get(id);
  if (used) {
    db.prepare('UPDATE halaqat SET active = 0 WHERE id = ?').run(id);
    return res.json({ ok: true, archived: true });
  }
  db.prepare('DELETE FROM halaqat WHERE id = ?').run(id);
  res.json({ ok: true, deleted: true });
});

module.exports = router;
