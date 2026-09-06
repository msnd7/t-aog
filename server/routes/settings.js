'use strict';
const express = require('express');
const { db, getSettings, setSetting, DEFAULT_SETTINGS } = require('../db');
const { requireAdmin, requireStaff, hashPassword } = require('../auth');
const { nowIso, toInt } = require('../util');
const { upload, uploadUrl } = require('../upload');
const { chequeCatalog } = require('../catalog');

const router = express.Router();

const PUBLIC_KEYS = ['academy_name', 'academy_subtitle', 'currency', 'scan_points',
  'screen_rotate_seconds', 'allow_student_photo_upload', 'logo', 'public_screen'];

router.get('/', (req, res) => {
  const all = getSettings();
  const isStaff = req.user && (req.user.role === 'admin' || req.user.role === 'supervisor');
  const payload = isStaff ? all : Object.fromEntries(PUBLIC_KEYS.map((k) => [k, all[k]]));
  res.json({ settings: { logo: '/img/logo.jpg', ...payload }, catalog: chequeCatalog() });
});

router.patch('/', requireAdmin, (req, res) => {
  const allowed = new Set([...Object.keys(DEFAULT_SETTINGS), 'logo', 'public_screen']);
  let changed = 0;
  for (const [key, value] of Object.entries(req.body || {})) {
    if (!allowed.has(key)) continue;
    setSetting(key, value);
    changed += 1;
  }
  if (!changed) return res.status(400).json({ error: 'لا يوجد تعديل' });
  res.json({ ok: true, settings: getSettings() });
});

router.post('/logo', requireAdmin, upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'اختر صورة الشعار' });
  const url = uploadUrl(req.file.filename);
  setSetting('logo', url);
  res.json({ ok: true, logo: url });
});

// ---- staff accounts (admin only) ----------------------------------------

router.get('/staff', requireStaff, (req, res) => {
  const rows = db.prepare(`
    SELECT id, username, name, role, active, created_at FROM users
     WHERE role IN ('admin','supervisor') ORDER BY role, name
  `).all();
  res.json({ staff: rows });
});

router.post('/staff', requireAdmin, (req, res) => {
  const name = String(req.body.name || '').trim();
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = req.body.role === 'admin' ? 'admin' : 'supervisor';
  if (!name || !username || password.length < 4) {
    return res.status(400).json({ error: 'أدخل الاسم واسم المستخدم وكلمة مرور لا تقل عن ٤ رموز' });
  }
  if (db.prepare('SELECT 1 FROM users WHERE lower(username) = ?').get(username)) {
    return res.status(409).json({ error: 'اسم المستخدم مستخدم مسبقاً' });
  }
  const info = db.prepare(`
    INSERT INTO users (username, password_hash, role, name, active, created_at) VALUES (?, ?, ?, ?, 1, ?)
  `).run(username, hashPassword(password), role, name, nowIso());
  res.status(201).json({ id: Number(info.lastInsertRowid) });
});

router.patch('/staff/:id', requireAdmin, (req, res) => {
  const id = toInt(req.params.id);
  const user = db.prepare("SELECT * FROM users WHERE id = ? AND role IN ('admin','supervisor')").get(id);
  if (!user) return res.status(404).json({ error: 'الحساب غير موجود' });
  const fields = [];
  const params = [];
  if (req.body.name) { fields.push('name = ?'); params.push(String(req.body.name).trim()); }
  if (req.body.role) { fields.push('role = ?'); params.push(req.body.role === 'admin' ? 'admin' : 'supervisor'); }
  if (req.body.password) { fields.push('password_hash = ?'); params.push(hashPassword(String(req.body.password))); }
  if (req.body.active !== undefined) { fields.push('active = ?'); params.push(req.body.active ? 1 : 0); }
  if (!fields.length) return res.status(400).json({ error: 'لا يوجد تعديل' });
  if (user.id === req.user.id && req.body.active === false) {
    return res.status(400).json({ error: 'لا يمكنك تعطيل حسابك' });
  }
  params.push(id);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

module.exports = router;
