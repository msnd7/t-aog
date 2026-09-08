'use strict';
const path = require('node:path');
const express = require('express');
const { db, DATA_DIR, UPLOAD_DIR, getSettings } = require('./db');
const { readFromDatabase, UPLOADS_IN_DB } = require('./upload');
const { attachUser, hashCode } = require('./auth');
const { nowIso, normalizePhone, formatPhone, asyncHandler } = require('./util');

const app = express();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(asyncHandler(attachUser));

/**
 * ينشئ حساب المدير الأول ليتمكن من تسجيل بقية المشرفين والطلاب.
 * الدخول برقم الجوال والرمز المؤقت، ويُطلب تغيير الرمز عند أول دخول.
 */
async function ensureAdmin() {
  const settings = await getSettings();
  const code = settings.default_code || '1234';
  const phone = normalizePhone(process.env.ADMIN_PHONE || '0500000000');
  const existing = await db.prepare("SELECT id, phone FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();

  if (existing) {
    // حساب مدير قديم بلا رقم جوال (بعد الترقية): يُربط بالرقم المتاح
    if (!existing.phone && phone && !(await db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone))) {
      await db.prepare('UPDATE users SET phone = ?, code_hash = ?, must_change_code = 1 WHERE id = ?')
        .run(phone, hashCode(code), existing.id);
      console.log(`\n  تم ربط حساب المدير برقم الجوال ${formatPhone(phone)} والرمز المؤقت ${code}\n`);
    }
    return;
  }
  if (await db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone)) return;

  await db.prepare(`
    INSERT INTO users (phone, code_hash, must_change_code, role, name, active, created_at)
    VALUES (?, ?, 1, 'admin', ?, 1, ?)
  `).run(phone, hashCode(code), process.env.ADMIN_NAME || 'مدير المنصة', nowIso());
  console.log(`\n  تم إنشاء حساب المدير:  رقم الجوال ${formatPhone(phone)} — الرمز المؤقت ${code}`);
  console.log('  ستُطلب منك شاشة تغيير الرمز مباشرة بعد أول دخول.\n');
}

/** يشغّل ensureAdmin مرة واحدة فقط، ويُعاد المحاولة إن فشلت أول مرة. */
let adminReadyPromise = null;
function ensureAdminReady() {
  if (!adminReadyPromise) {
    adminReadyPromise = ensureAdmin().catch((err) => {
      adminReadyPromise = null;
      throw err;
    });
  }
  return adminReadyPromise;
}

// حاجز أمان: يضمن وجود حساب المدير قبل معالجة أي طلب، حتى في أول تشغيل بارد
// على الاستضافات بلا خادم (Vercel) حيث قد تتزامن أول الطلبات مع التجهيز.
app.use(asyncHandler(async (req, res, next) => { await ensureAdminReady(); next(); }));

// Uploaded photos (student pictures, reward pictures, custom logo).
// على الاستضافات بلا قرص دائم تُحفظ الصور في قاعدة البيانات وتُقدَّم من هنا.
if (UPLOADS_IN_DB) {
  app.get('/uploads/:name', asyncHandler(async (req, res) => {
    const file = await readFromDatabase(req.params.name);
    if (!file) return res.status(404).send('غير موجود');
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.send(file.body);
  }));
}
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

if (require.main === module) {
  (async () => {
    await ensureAdminReady().catch((err) => console.error('تعذّر تجهيز حساب المدير:', err));
    const port = Number(process.env.PORT) || 3000;
    app.listen(port, async () => {
      const settings = await getSettings();
      console.log(`${settings.academy_name} — منصة التحفيز`);
      console.log(`  الخادم يعمل على http://localhost:${port}`);
      console.log(`  قاعدة البيانات: ${path.join(DATA_DIR, 'app.db')}`);
    });
  })();
}

module.exports = { app, ensureAdmin, ensureAdminReady };
