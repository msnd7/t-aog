'use strict';
const path = require('node:path');
const express = require('express');
const { db, DATA_DIR, UPLOAD_DIR, getSettings } = require('./db');
const { attachUser, hashPassword } = require('./auth');
const { nowIso } = require('./util');

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

/** Creates the first administrator so a fresh install can be opened right away. */
function ensureAdmin() {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get();
  if (existing.n > 0) return;
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'admin1234';
  db.prepare(`
    INSERT INTO users (username, password_hash, role, name, active, created_at) VALUES (?, ?, 'admin', ?, 1, ?)
  `).run(username, hashPassword(password), process.env.ADMIN_NAME || 'مدير المنصة', nowIso());
  console.log(`\n  تم إنشاء حساب المدير:  ${username} / ${password}`);
  console.log('  غيّر كلمة المرور من صفحة الإعدادات بعد أول دخول.\n');
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
