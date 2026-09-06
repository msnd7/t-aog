'use strict';
const express = require('express');
const { db } = require('../db');
const { requireAuth, requireStaff } = require('../auth');
const { nowIso, toInt } = require('../util');
const { studentWallet } = require('../stats');
const { upload, uploadUrl } = require('../upload');
const { addEntry } = require('./points');

const router = express.Router();

// ---- rewards -------------------------------------------------------------

router.get('/rewards', requireAuth, (req, res) => {
  const all = req.user.role !== 'student' && req.query.all === '1';
  const rows = db.prepare(`SELECT * FROM rewards ${all ? '' : 'WHERE active = 1'} ORDER BY price ASC, id DESC`).all();
  const wallet = req.user.role === 'student' ? studentWallet(req.user.id) : null;
  res.json({ rewards: rows, wallet });
});

router.post('/rewards', requireStaff, upload.single('image'), (req, res) => {
  const name = String(req.body.name || '').trim();
  const price = toInt(req.body.price);
  if (!name) return res.status(400).json({ error: 'اسم الجائزة مطلوب' });
  if (price <= 0) return res.status(400).json({ error: 'أدخل سعر الجائزة بالنقاط' });
  const info = db.prepare(`
    INSERT INTO rewards (name, description, price, image, stock, active, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `).run(name, String(req.body.description || '').trim() || null, price,
    req.file ? uploadUrl(req.file.filename) : null, toInt(req.body.stock, -1), nowIso());
  res.status(201).json({ reward: db.prepare('SELECT * FROM rewards WHERE id = ?').get(Number(info.lastInsertRowid)) });
});

router.patch('/rewards/:id', requireStaff, upload.single('image'), (req, res) => {
  const id = toInt(req.params.id);
  const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(id);
  if (!reward) return res.status(404).json({ error: 'الجائزة غير موجودة' });
  const fields = [];
  const params = [];
  if (req.body.name !== undefined) { fields.push('name = ?'); params.push(String(req.body.name).trim()); }
  if (req.body.description !== undefined) { fields.push('description = ?'); params.push(String(req.body.description).trim() || null); }
  if (req.body.price !== undefined) { fields.push('price = ?'); params.push(toInt(req.body.price)); }
  if (req.body.stock !== undefined) { fields.push('stock = ?'); params.push(toInt(req.body.stock, -1)); }
  if (req.body.active !== undefined) { fields.push('active = ?'); params.push(String(req.body.active) === '0' ? 0 : 1); }
  if (req.file) { fields.push('image = ?'); params.push(uploadUrl(req.file.filename)); }
  if (!fields.length) return res.status(400).json({ error: 'لا يوجد تعديل' });
  params.push(id);
  db.prepare(`UPDATE rewards SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true, reward: db.prepare('SELECT * FROM rewards WHERE id = ?').get(id) });
});

router.delete('/rewards/:id', requireStaff, (req, res) => {
  const id = toInt(req.params.id);
  const used = db.prepare('SELECT 1 FROM redemptions WHERE reward_id = ? LIMIT 1').get(id);
  if (used) {
    db.prepare('UPDATE rewards SET active = 0 WHERE id = ?').run(id);
    return res.json({ ok: true, archived: true });
  }
  db.prepare('DELETE FROM rewards WHERE id = ?').run(id);
  res.json({ ok: true, deleted: true });
});

// ---- redemptions ---------------------------------------------------------

/** A student swaps points for a reward; the points are held until delivery. */
router.post('/rewards/:id/redeem', requireAuth, (req, res) => {
  const rewardId = toInt(req.params.id);
  const studentId = req.user.role === 'student' ? req.user.id : toInt(req.body.student_id);
  if (!studentId) return res.status(400).json({ error: 'حدد الطالب' });
  if (req.user.role === 'student' && studentId !== req.user.id) return res.status(403).json({ error: 'غير مصرح' });

  const reward = db.prepare('SELECT * FROM rewards WHERE id = ? AND active = 1').get(rewardId);
  if (!reward) return res.status(404).json({ error: 'الجائزة غير متوفرة' });
  if (reward.stock === 0) return res.status(400).json({ error: 'نفدت الكمية من هذه الجائزة' });

  const wallet = studentWallet(studentId);
  if (wallet.balance < reward.price) {
    return res.status(400).json({ error: `رصيدك ${wallet.balance} ولا يكفي لطلب هذه الجائزة` });
  }

  const info = db.prepare(`
    INSERT INTO redemptions (student_id, reward_id, price, status, created_at) VALUES (?, ?, ?, 'pending', ?)
  `).run(studentId, rewardId, reward.price, nowIso());
  const redemptionId = Number(info.lastInsertRowid);
  addEntry({
    studentId, category: 'redeem', subtype: String(rewardId), points: -reward.price,
    note: `طلب جائزة: ${reward.name}`, userId: req.user.id
  });
  if (reward.stock > 0) db.prepare('UPDATE rewards SET stock = stock - 1 WHERE id = ?').run(rewardId);

  res.status(201).json({ ok: true, id: redemptionId, wallet: studentWallet(studentId) });
});

router.get('/redemptions', requireAuth, (req, res) => {
  const params = [];
  let where = 'WHERE 1 = 1';
  if (req.user.role === 'student') { where += ' AND r.student_id = ?'; params.push(req.user.id); }
  else if (req.query.student_id) { where += ' AND r.student_id = ?'; params.push(toInt(req.query.student_id)); }
  if (req.query.status) { where += ' AND r.status = ?'; params.push(String(req.query.status)); }
  const rows = db.prepare(`
    SELECT r.*, w.name AS reward_name, w.image AS reward_image, u.name AS student_name,
           h.name AS halaqa_name
      FROM redemptions r
      JOIN rewards w ON w.id = r.reward_id
      JOIN users u ON u.id = r.student_id
      LEFT JOIN halaqat h ON h.id = u.halaqa_id
      ${where} ORDER BY r.id DESC LIMIT 200
  `).all(...params);
  res.json({ redemptions: rows });
});

/** Supervisor marks a request delivered, or rejects it and refunds the points. */
router.post('/redemptions/:id/status', requireStaff, (req, res) => {
  const id = toInt(req.params.id);
  const status = String(req.body.status || '');
  if (!['delivered', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'حالة غير معروفة' });
  }
  const redemption = db.prepare('SELECT * FROM redemptions WHERE id = ?').get(id);
  if (!redemption) return res.status(404).json({ error: 'الطلب غير موجود' });
  if (redemption.status === status) return res.json({ ok: true });

  if (status === 'rejected' && redemption.status !== 'rejected') {
    addEntry({
      studentId: redemption.student_id, category: 'refund', points: redemption.price,
      note: 'إرجاع نقاط طلب ملغى', userId: req.user.id
    });
    const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(redemption.reward_id);
    if (reward && reward.stock >= 0) db.prepare('UPDATE rewards SET stock = stock + 1 WHERE id = ?').run(reward.id);
  }
  db.prepare('UPDATE redemptions SET status = ?, handled_at = ?, handled_by = ?, note = ? WHERE id = ?')
    .run(status, nowIso(), req.user.id, String(req.body.note || '').trim() || redemption.note, id);
  res.json({ ok: true });
});

module.exports = router;
