'use strict';
const express = require('express');
const {
  db, getSettings, setSetting, setMosqueSetting, DEFAULT_SETTINGS, MOSQUE_SETTING_KEYS
} = require('../db');
const { requireAdmin, requireStaff, hashCode } = require('../auth');
const { nowIso, toInt, normalizePhone, asyncHandler } = require('../util');
const { upload, uploadUrl } = require('../upload');
const { chequeCatalog } = require('../catalog');

const router = express.Router();

const PUBLIC_KEYS = ['academy_name', 'academy_subtitle', 'currency', 'scan_points',
  'screen_rotate_seconds', 'allow_student_photo_upload', 'logo', 'public_screen', 'default_code'];

const defaultCode = async () => (await getSettings()).default_code || '1234';

/**
 * الإعدادات الفعّالة للمسجد الحالي (أو إعدادات المنصة في لوحة المدير)،
 * مع اسم المسجد ليظهر في الواجهة والشيكات المطبوعة.
 */
router.get('/', asyncHandler(async (req, res) => {
  const all = await getSettings(req.mosqueId);
  const isStaff = req.user && (req.user.role === 'admin' || req.user.role === 'supervisor');
  const payload = isStaff ? all : Object.fromEntries(PUBLIC_KEYS.map((k) => [k, all[k]]));
  delete payload.mosques_migrated;
  res.json({
    settings: { logo: '/img/logo.jpg', ...payload, mosque_name: req.mosque ? req.mosque.name : '' },
    mosque: req.mosque ? { id: req.mosque.id, name: req.mosque.name } : null,
    catalog: await chequeCatalog(req.mosqueId)
  });
}));

/**
 * حفظ الإعدادات: قيم الشيكات والمسح والشاشة تُحفظ للمسجد الحالي فقط، أما
 * اسم المجمع والشعار والرمز المؤقت فمشتركة لكل المنصة.
 */
router.patch('/', requireAdmin, asyncHandler(async (req, res) => {
  const perMosque = new Set(MOSQUE_SETTING_KEYS);
  const allowed = new Set([...Object.keys(DEFAULT_SETTINGS), 'logo', 'public_screen']);
  let changed = 0;
  for (const [key, value] of Object.entries(req.body || {})) {
    if (!allowed.has(key)) continue;
    if (perMosque.has(key)) {
      if (!req.mosqueId) continue; // قيم المساجد تُضبط من داخل واجهة كل مسجد
      await setMosqueSetting(req.mosqueId, key, value);
    } else {
      await setSetting(key, value);
    }
    changed += 1;
  }
  if (!changed) return res.status(400).json({ error: 'لا يوجد تعديل' });
  res.json({ ok: true, settings: await getSettings(req.mosqueId) });
}));

router.post('/logo', requireAdmin, upload.single('logo'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'اختر صورة الشعار' });
  const url = uploadUrl(req.file.filename);
  await setSetting('logo', url);
  res.json({ ok: true, logo: url });
}));

// ---- staff accounts (admin only) ----------------------------------------

/**
 * داخل مسجد: مشرفو ذلك المسجد فقط. في لوحة المنصة: كل الحسابات مع مساجدها.
 */
router.get('/staff', requireStaff, asyncHandler(async (req, res) => {
  const params = [];
  let where = "WHERE u.role IN ('admin','supervisor')";
  if (req.mosqueId) { where = "WHERE u.role = 'supervisor' AND u.mosque_id = ?"; params.push(req.mosqueId); }
  const rows = await db.prepare(`
    SELECT u.id, u.phone, u.name, u.role, u.active, u.must_change_code, u.created_at, u.mosque_id,
           m.name AS mosque_name
      FROM users u LEFT JOIN mosques m ON m.id = u.mosque_id
     ${where} ORDER BY u.role, m.sort_order, u.name
  `).all(...params);
  res.json({ staff: rows });
}));

/** مسجد المشرف: المُرسَل في الطلب، أو المسجد الذي يعمل فيه المدير حالياً */
async function staffMosque(req) {
  const id = toInt(req.body.mosque_id) || req.mosqueId;
  if (!id) return null;
  return db.prepare('SELECT id FROM mosques WHERE id = ?').get(id);
}

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
  // المشرف يتبع مسجداً واحداً، ومدير المنصة يرى كل المساجد
  let mosqueId = null;
  if (role === 'supervisor') {
    const mosque = await staffMosque(req);
    if (!mosque) return res.status(400).json({ error: 'اختر مسجد المشرف' });
    mosqueId = mosque.id;
  }
  const code = await defaultCode();
  const info = await db.prepare(`
    INSERT INTO users (phone, code_hash, must_change_code, role, name, active, created_at, mosque_id)
    VALUES (?, ?, 1, ?, ?, 1, ?, ?)
    RETURNING id
  `).run(phone, hashCode(code), role, name, nowIso(), mosqueId);
  res.status(201).json({ id: Number(info.lastInsertRowid), phone, code, mosque_id: mosqueId });
}));

router.patch('/staff/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const user = await db.prepare("SELECT * FROM users WHERE id = ? AND role IN ('admin','supervisor')").get(id);
  if (!user) return res.status(404).json({ error: 'الحساب غير موجود' });
  const fields = [];
  const params = [];
  if (req.body.name) { fields.push('name = ?'); params.push(String(req.body.name).trim()); }
  const role = req.body.role ? (req.body.role === 'admin' ? 'admin' : 'supervisor') : user.role;
  if (req.body.role) { fields.push('role = ?'); params.push(role); }
  if (role === 'admin' && user.role !== 'admin') { fields.push('mosque_id = ?'); params.push(null); }
  if (role === 'supervisor' && (req.body.mosque_id !== undefined || !user.mosque_id)) {
    const mosque = await staffMosque(req);
    if (!mosque) return res.status(400).json({ error: 'اختر مسجد المشرف' });
    fields.push('mosque_id = ?');
    params.push(mosque.id);
  }
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
