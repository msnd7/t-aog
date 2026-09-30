'use strict';
const { db } = require('./db');
const { toInt } = require('./util');

/**
 * سياق المسجد لكل طلب (req.mosqueId):
 *   - المشرف والطالب: مسجده المسجَّل دائماً، ولا يستطيع تجاوزه.
 *   - مدير المنصة: المسجد الذي اختار الدخول إليه (ملف تعريف الارتباط rq_mosque)،
 *     أو معامل ?mosque= في الرابط. بدون اختيار يبقى في لوحة المنصة (mosqueId = null).
 *   - الزائر بلا حساب (شاشة العرض): معامل ?mosque= في الرابط.
 */
const MOSQUE_COOKIE = 'rq_mosque';

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

async function findMosque(id) {
  if (!id) return null;
  return db.prepare('SELECT * FROM mosques WHERE id = ?').get(id);
}

async function attachMosque(req, res, next) {
  req.mosqueId = null;
  req.mosque = null;
  if (req.user && req.user.role !== 'admin') {
    req.mosqueId = req.user.mosque_id || null;
  } else {
    const wanted = toInt(req.query.mosque) || toInt(req.headers['x-mosque-id'])
      || (req.user ? toInt(readCookie(req, MOSQUE_COOKIE)) : 0);
    if (wanted) req.mosqueId = wanted;
  }
  if (req.mosqueId) {
    const mosque = await findMosque(req.mosqueId);
    // المسجد المعطَّل لا يُفتح إلا لمدير المنصة
    if (!mosque || (!mosque.active && !(req.user && req.user.role === 'admin'))) req.mosqueId = null;
    else req.mosque = mosque;
  }
  next();
}

/**
 * يشترط وجود مسجد محدد للطلب. الزائر بلا حساب يُطلب منه تسجيل الدخول، إلا في
 * المسارات العامة (allowAnonymous) فيُطلب منه اختيار المسجد.
 */
function requireMosque({ allowAnonymous = false } = {}) {
  return (req, res, next) => {
    if (req.mosqueId) return next();
    if (!req.user && !allowAnonymous) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    if (req.user && req.user.must_change_code === 1) {
      return res.status(403).json({ error: 'يجب تغيير الرمز المؤقت أولاً', code_change_required: true });
    }
    return res.status(400).json({ error: 'اختر المسجد أولاً', mosque_required: true });
  };
}

function setMosqueCookie(res, id) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  const value = id ? `${MOSQUE_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 86400}${secure}`
    : `${MOSQUE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  res.append('Set-Cookie', value);
}

module.exports = { MOSQUE_COOKIE, attachMosque, requireMosque, setMosqueCookie, findMosque };
