'use strict';
const crypto = require('node:crypto');
const { db } = require('./db');
const { nowIso, randomToken } = require('./util');

const SESSION_DAYS = 60;
const COOKIE = 'rq_session';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function createSession(userId) {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, nowIso(), expires);
  return { token, expires };
}

function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
    halaqa_id: user.halaqa_id,
    photo: user.photo,
    barcode: user.barcode
  };
}

function readCookie(req, name) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/** Attaches req.user when the request carries a live session cookie. */
function attachUser(req, res, next) {
  req.sessionToken = readCookie(req, COOKIE);
  req.user = null;
  if (req.sessionToken) {
    const row = db.prepare(`
      SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND s.expires_at > ? AND u.active = 1
    `).get(req.sessionToken, nowIso());
    if (row) req.user = row;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  next();
}

/** Guard for routes reserved to supervisors and administrators. */
function requireStaff(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  if (req.user.role !== 'admin' && req.user.role !== 'supervisor') {
    return res.status(403).json({ error: 'هذه الصفحة مخصصة للمشرفين' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'هذه الصلاحية لمدير المنصة فقط' });
  next();
}

function setSessionCookie(res, token, expires) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expires).toUTCString()}${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

module.exports = {
  COOKIE, hashPassword, verifyPassword, createSession, destroySession, publicUser,
  attachUser, requireAuth, requireStaff, requireAdmin, setSessionCookie, clearSessionCookie
};
