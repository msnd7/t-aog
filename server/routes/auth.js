'use strict';
const express = require('express');
const { db } = require('../db');
const {
  hashPassword, verifyPassword, createSession, destroySession, publicUser,
  requireAuth, setSessionCookie, clearSessionCookie
} = require('../auth');

const router = express.Router();

// Very small in-memory throttle so a shared iPad cannot be used to brute force logins.
const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 12;

function throttled(key) {
  const now = Date.now();
  const record = attempts.get(key);
  if (!record || now - record.first > WINDOW_MS) return false;
  return record.count >= MAX_ATTEMPTS;
}

function recordAttempt(key, ok) {
  const now = Date.now();
  if (ok) return attempts.delete(key);
  const record = attempts.get(key);
  if (!record || now - record.first > WINDOW_MS) attempts.set(key, { first: now, count: 1 });
  else record.count += 1;
}

router.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!username || !password) return res.status(400).json({ error: 'أدخل اسم المستخدم وكلمة المرور' });

  const key = `${req.ip}:${username}`;
  if (throttled(key)) return res.status(429).json({ error: 'محاولات كثيرة، حاول بعد قليل' });

  const user = db.prepare('SELECT * FROM users WHERE lower(username) = ? AND active = 1').get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordAttempt(key, false);
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
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

router.post('/password', requireAuth, (req, res) => {
  const current = String(req.body.current || '');
  const next = String(req.body.next || '');
  if (next.length < 4) return res.status(400).json({ error: 'كلمة المرور الجديدة قصيرة جداً' });
  if (!verifyPassword(current, req.user.password_hash)) {
    return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
