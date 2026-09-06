'use strict';
const express = require('express');
const { db, getSettings } = require('../db');
const {
  hashCode, verifyCode, createSession, destroySession, publicUser,
  setSessionCookie, clearSessionCookie
} = require('../auth');
const { normalizePhone } = require('../util');

const router = express.Router();

// محاولات الدخول محدودة حتى لا يُخمَّن رمز أحد الطلاب من جهاز مشترك
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function throttled(key) {
  const record = attempts.get(key);
  if (!record || Date.now() - record.first > WINDOW_MS) return false;
  return record.count >= MAX_ATTEMPTS;
}

function recordAttempt(key, ok) {
  if (ok) return attempts.delete(key);
  const record = attempts.get(key);
  if (!record || Date.now() - record.first > WINDOW_MS) attempts.set(key, { first: Date.now(), count: 1 });
  else record.count += 1;
}

const isValidCode = (code) => /^\d{4,6}$/.test(String(code));

/** التحقق من وجود الرقم قبل طلب الرمز (الخطوة الأولى في شاشة الدخول) */
router.post('/check-phone', (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!phone) return res.status(400).json({ error: 'أدخل رقم جوال صحيح، مثال: 0501234567' });
  const user = db.prepare('SELECT id, name FROM users WHERE phone = ? AND active = 1').get(phone);
  if (!user) {
    return res.status(404).json({ error: 'هذا الرقم غير مسجَّل. راجع مشرف الحلقة لتسجيل رقمك.' });
  }
  res.json({ phone, name: user.name });
});

router.post('/login', (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const code = String(req.body.code || '').trim();
  if (!phone) return res.status(400).json({ error: 'أدخل رقم جوال صحيح، مثال: 0501234567' });
  if (!code) return res.status(400).json({ error: 'أدخل رمز الدخول' });

  const key = `${req.ip}:${phone}`;
  if (throttled(key)) return res.status(429).json({ error: 'محاولات كثيرة، انتظر قليلاً ثم أعد المحاولة' });

  const user = db.prepare('SELECT * FROM users WHERE phone = ? AND active = 1').get(phone);
  if (!user || !verifyCode(code, user.code_hash)) {
    recordAttempt(key, false);
    return res.status(401).json({ error: 'رقم الجوال أو الرمز غير صحيح' });
  }
  recordAttempt(key, true);
  const { token, expires } = createSession(user.id);
  setSessionCookie(res, token, expires);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  destroySession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

/**
 * تغيير رمز الدخول. تُستخدم نفسها في شاشة «غيّر رمزك» الإجبارية بعد أول دخول،
 * ولا تسمح بإبقاء الرمز المؤقت كما هو.
 */
router.post('/code', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  const current = String(req.body.current || '').trim();
  const next = String(req.body.next || '').trim();
  const confirm = String(req.body.confirm ?? next).trim();
  const defaultCode = getSettings().default_code || '1234';

  if (!verifyCode(current, req.user.code_hash)) {
    return res.status(400).json({ error: 'الرمز الحالي غير صحيح' });
  }
  if (!isValidCode(next)) return res.status(400).json({ error: 'الرمز الجديد يجب أن يكون من ٤ إلى ٦ أرقام' });
  if (next !== confirm) return res.status(400).json({ error: 'الرمز الجديد وتأكيده غير متطابقين' });
  if (next === defaultCode) return res.status(400).json({ error: 'اختر رمزاً مختلفاً عن الرمز المؤقت' });

  db.prepare('UPDATE users SET code_hash = ?, must_change_code = 0 WHERE id = ?')
    .run(hashCode(next), req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ ok: true, user: publicUser(user) });
});

module.exports = router;
