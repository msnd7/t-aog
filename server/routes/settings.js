'use strict';
const express = require('express');
const { db, getSettings, setSetting, DEFAULT_SETTINGS } = require('../db');
const { requireAdmin, requireStaff, hashCode } = require('../auth');
const { nowIso, toInt, normalizePhone, asyncHandler } = require('../util');
const { upload, uploadUrl } = require('../upload');
const { chequeCatalog } = require('../catalog');

const router = express.Router();

const PUBLIC_KEYS = ['academy_name', 'academy_subtitle', 'currency', 'scan_points',
  'screen_rotate_seconds', 'allow_student_photo_upload', 'logo', 'public_screen', 'default_code'];

const defaultCode = async () => (await getSettings()).default_code || '1234';

router.get('/', asyncHandler(async (req, res) => {
  const all = await getSettings();
  const isStaff = req.user && (req.user.role === 'admin' || req.user.role === 'supervisor');
  const payload = isStaff ? all : Object.fromEntries(PUBLIC_KEYS.map((k) => [k, all[k]]));
  res.json({ settings: { logo: '/img/logo.jpg', ...payload }, catalog: await chequeCatalog() });
}));

router.patch('/', requireAdmin, asyncHandler(async (req, res) => {
  const allowed = new Set([...Object.keys(DEFAULT_SETTINGS), 'logo', 'public_screen']);
  let changed = 0;
  for (const [key, value] of Object.entries(req.body || {})) {
    if (!allowed.has(key)) continue;
    await setSetting(key, value);
    changed += 1;
  }
  if (!changed) return res.status(400).json({ error: 'لا يوجد تعديل' });
  res.json({ ok: true, settings: await getSettings() });
}));

router.post('/logo', requireAdmin, upload.single('logo'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'اختر صورة الشعار' });
  const url = uploadUrl(req.file.filename);
  await setSetting('logo', url);
  res.json({ ok: true, logo: url });
}));

// ---- staff accounts (admin only) ----------------------------------------

router.get('/staff', requireStaff, asyncHandler(async (req, res) => {
  const rows = await db.prepare(`
    SELECT id, phone, name, role, active, must_change_code, created_at FROM users
     WHERE role IN ('admin','supervisor') ORDER BY role, name
  `).all();
  res.json({ staff: rows });
}));

/** المشرف الجديد يُسجَّل باسمه ورقم جواله، ويدخل بالرمز المؤقت ثم يغيّره */
router.post('/staff', requireAdmin, asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = normalizePhone(req.body.phone);
  const role = req.body.role === 'admin' ? 'admin' : 'supervisor';
  if (!name) return res.status(400).json({ error: 'اسم المشرف مطلوب' });
  if (!phone) return res.status(400).json({ error: 'أدخل رقم جوال صحيح، مثال: 0501234567' });
  if (await db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone)) {
    return res.status(409).json({ error: 'رقم الجوال مسجَّل لحساب آخر' });
  }
  const code = await defaultCode();
  const info = await db.prepare(`
    INSERT INTO users (phone, code_hash, must_change_code, role, name, active, created_at)
    VALUES (?, ?, 1, ?, ?, 1, ?)
    RETURNING id
  `).run(phone, hashCode(code), role, name, nowIso());
  res.status(201).json({ id: Number(info.lastInsertRowid), phone, code });
}));

router.patch('/staff/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const user = await db.prepare("SELECT * FROM users WHERE id = ? AND role IN ('admin','supervisor')").get(id);
  if (!user) return res.status(404).json({ error: 'الحساب غير موجود' });
  const fields = [];
  const params = [];
  if (req.body.name) { fields.push('name = ?'); params.push(String(req.body.name).trim()); }
  if (req.body.role) { fields.push('role = ?'); params.push(req.body.role === 'admin' ? 'admin' : 'supervisor'); }
  if (req.body.phone !== undefined) {
    const phone = normalizePhone(req.body.phone);
    if (!phone) return res.status(400).json({ error: 'رقم الجوال غير صحيح، مثال: 0501234567' });
    const owner = await db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    if (owner && owner.id !== id) return res.status(409).json({ error: 'رقم الجوال مسجَّل لحساب آخر' });
    fields.push('phone = ?');
    params.push(phone);
  }
  if (req.body.active !== undefined) { fields.push('active = ?'); params.push(req.body.active ? 1 : 0); }
  if (!fields.length) return res.status(400).json({ error: 'لا يوجد تعديل' });
  if (user.id === req.user.id && req.body.active === false) {
    return res.status(400).json({ error: 'لا يمكنك تعطيل حسابك' });
  }
  params.push(id);
  await db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
}));

/** إعادة رمز مشرف إلى الرمز المؤقت */
router.post('/staff/:id/reset-code', requireAdmin, asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const user = await db.prepare("SELECT * FROM users WHERE id = ? AND role IN ('admin','supervisor')").get(id);
  if (!user) return res.status(404).json({ error: 'الحساب غير موجود' });
  const code = await defaultCode();
  await db.prepare('UPDATE users SET code_hash = ?, must_change_code = 1 WHERE id = ?').run(hashCode(code), id);
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  res.json({ ok: true, code });
}));

module.exports = router;
