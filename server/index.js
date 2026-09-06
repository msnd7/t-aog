'use strict';
const path = require('node:path');
const express = require('express');
const { db, DATA_DIR, UPLOAD_DIR, getSettings } = require('./db');
const { attachUser, hashCode } = require('./auth');
const { nowIso, normalizePhone, formatPhone } = require('./util');

const app = express();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(attachUser);

// Uploaded photos (student pictures, reward pictures, custom logo).
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/students', require('./routes/students').router);
app.use('/api/halaqat', require('./routes/halaqat'));
app.use('/api/points', require('./routes/points').router);
app.use('/api/cheques', require('./routes/cheques'));
app.use('/api/store', require('./routes/store'));
app.use('/api/screen', require('./routes/screens'));
app.use('/api/settings', require('./routes/settings'));

app.get('/api/health', (req, res) => res.json({ ok: true, time: nowIso() }));

app.use('/api', (req, res) => res.status(404).json({ error: 'المسار غير موجود' }));

// The service worker and the shell must never be served from a stale cache.
app.get(['/sw.js', '/index.html', '/'], (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache');
  next();
});
app.use(express.static(PUBLIC_DIR, { maxAge: '1h', extensions: ['html'] }));

app.use((req, res) => {
  if (req.method === 'GET' && !req.path.includes('.')) return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  res.status(404).send('غير موجود');
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'حدث خطأ غير متوقع' });
});

/**
 * ينشئ حساب المدير الأول ليتمكن من تسجيل بقية المشرفين والطلاب.
 * الدخول برقم الجوال والرمز المؤقت، ويُطلب تغيير الرمز عند أول دخول.
 */
function ensureAdmin() {
  const settings = getSettings();
  const code = settings.default_code || '1234';
  const phone = normalizePhone(process.env.ADMIN_PHONE || '0500000000');
  const existing = db.prepare("SELECT id, phone FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();

  if (existing) {
    // حساب مدير قديم بلا رقم جوال (بعد الترقية): يُربط بالرقم المتاح
    if (!existing.phone && phone && !db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone)) {
      db.prepare('UPDATE users SET phone = ?, code_hash = ?, must_change_code = 1 WHERE id = ?')
        .run(phone, hashCode(code), existing.id);
      console.log(`\n  تم ربط حساب المدير برقم الجوال ${formatPhone(phone)} والرمز المؤقت ${code}\n`);
    }
    return;
  }
  if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone)) return;

  db.prepare(`
    INSERT INTO users (phone, code_hash, must_change_code, role, name, active, created_at)
    VALUES (?, ?, 1, 'admin', ?, 1, ?)
  `).run(phone, hashCode(code), process.env.ADMIN_NAME || 'مدير المنصة', nowIso());
  console.log(`\n  تم إنشاء حساب المدير:  رقم الجوال ${formatPhone(phone)} — الرمز المؤقت ${code}`);
  console.log('  ستُطلب منك شاشة تغيير الرمز مباشرة بعد أول دخول.\n');
}

if (require.main === module) {
  ensureAdmin();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`${getSettings().academy_name} — منصة التحفيز`);
    console.log(`  الخادم يعمل على http://localhost:${port}`);
    console.log(`  قاعدة البيانات: ${path.join(DATA_DIR, 'app.db')}`);
  });
}

module.exports = { app, ensureAdmin };
