'use strict';
/**
 * تعدد المساجد:
 *   - قاعدة بيانات قديمة (قبل تعدد المساجد) تُرقّى فتنتقل كل بياناتها وإعداداتها
 *     إلى جامع عبدالله بن عمر دون فقد.
 *   - كل مسجد معزول عن غيره: الحلقات والطلاب والمسح والشيكات والمتجر والإعدادات.
 *   - المشرف مقيَّد بمسجده، ومدير المنصة يرى لوحة تجمع كل المساجد.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'riyad-mosques-'));
process.env.DATA_DIR = DATA_DIR;
process.env.ADMIN_PHONE = '0500000009';

// ---- قاعدة بيانات بالمخطط القديم (نسخة ما قبل تعدد المساجد) ---------------
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');

// نفس صيغة server/auth.js — لا يُستورد منه كي لا تُفتح القاعدة قبل كتابة المخطط القديم
const hashCode = (code) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(String(code), salt, 64).toString('hex')}`;
};

const legacy = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
legacy.exec(`
  CREATE TABLE halaqat (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, teacher_name TEXT,
    supervisor_id INTEGER, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
  CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT UNIQUE, code_hash TEXT NOT NULL,
    must_change_code INTEGER NOT NULL DEFAULT 1, role TEXT NOT NULL CHECK (role IN ('admin','supervisor','student')),
    name TEXT NOT NULL, halaqa_id INTEGER REFERENCES halaqat(id) ON DELETE SET NULL, photo TEXT, barcode TEXT UNIQUE,
    active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
  CREATE TABLE cheques (id INTEGER PRIMARY KEY AUTOINCREMENT, serial TEXT NOT NULL UNIQUE, student_id INTEGER NOT NULL,
    halaqa_id INTEGER, type TEXT NOT NULL, items TEXT NOT NULL, total INTEGER NOT NULL, teacher_name TEXT, note TEXT,
    issued_by INTEGER, issued_at TEXT NOT NULL, printed_at TEXT);
  CREATE TABLE cheque_vouchers (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, batch TEXT NOT NULL,
    type TEXT NOT NULL, item_key TEXT NOT NULL, item_label TEXT NOT NULL, points INTEGER NOT NULL, note TEXT,
    created_by INTEGER, created_at TEXT NOT NULL, printed_at TEXT, student_id INTEGER, redeemed_at TEXT, redeemed_by INTEGER);
  CREATE TABLE point_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, halaqa_id INTEGER,
    category TEXT NOT NULL, subtype TEXT, points INTEGER NOT NULL, note TEXT, cheque_id INTEGER, created_by INTEGER,
    created_at TEXT NOT NULL);
  CREATE TABLE rewards (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, price INTEGER NOT NULL,
    image TEXT, stock INTEGER NOT NULL DEFAULT -1, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
`);
const now = new Date().toISOString();
legacy.prepare("INSERT INTO settings (key, value) VALUES ('cheque_attendance_early', '80')").run();
legacy.prepare('INSERT INTO halaqat (name, teacher_name, active, created_at) VALUES (?, ?, 1, ?)').run('حلقة قديمة', 'المعلم', now);
legacy.prepare(`INSERT INTO users (phone, code_hash, must_change_code, role, name, active, created_at)
  VALUES ('0500000009', ?, 0, 'admin', 'المدير', 1, ?)`).run(hashCode('4321'), now);
legacy.prepare(`INSERT INTO users (phone, code_hash, must_change_code, role, name, active, created_at)
  VALUES ('0530000001', ?, 0, 'supervisor', 'مشرف قديم', 1, ?)`).run(hashCode('4321'), now);
legacy.prepare(`INSERT INTO users (phone, code_hash, must_change_code, role, name, halaqa_id, barcode, active, created_at)
  VALUES ('0540000001', ?, 0, 'student', 'طالب قديم', 1, 'RQ00003', 1, ?)`).run(hashCode('4321'), now);
legacy.prepare(`INSERT INTO point_entries (student_id, halaqa_id, category, points, created_at)
  VALUES (3, 1, 'manual', 125, ?)`).run(now);
legacy.prepare("INSERT INTO rewards (name, price, created_at) VALUES ('مصحف قديم', 50, ?)").run(now);
legacy.close();

const { app } = require('../server/index');

let server;
let base;

/** عميل مستقل لكل حساب، بمخزن ملفات تعريف ارتباط خاص به */
function client() {
  const jar = new Map();
  return async function call(method, url, body) {
    const options = { method, headers: {} };
    if (jar.size) options.headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (body !== undefined) {
      options.headers['content-type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(base + url, options);
    for (const raw of response.headers.getSetCookie()) {
      const [pair] = raw.split(';');
      const idx = pair.indexOf('=');
      const value = pair.slice(idx + 1);
      if (value) jar.set(pair.slice(0, idx), value); else jar.delete(pair.slice(0, idx));
    }
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch { payload = text; }
    return { status: response.status, body: payload };
  };
}

const admin = client();
let firstId;
let secondId;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const login = await admin('POST', '/api/auth/login', { phone: '0500000009', code: '4321' });
  assert.equal(login.status, 200);
});

test.after(() => {
  server.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test('الترقية تنشئ المساجد الثلاثة وتنقل البيانات السابقة إلى جامع عبدالله بن عمر', async () => {
  const list = await admin('GET', '/api/mosques');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.mosques.map((m) => m.name),
    ['جامع عبدالله بن عمر', 'جامع ماجد بن مترك', 'جامع تركي الضحيان']);
  const [first, second, third] = list.body.mosques;
  firstId = first.id;
  secondId = second.id;

  assert.equal(first.students, 1);
  assert.equal(first.halaqat, 1);
  assert.equal(first.supervisors, 1);
  assert.equal(first.total_points, 125);
  assert.equal(first.knight.name, 'طالب قديم');
  for (const empty of [second, third]) {
    assert.equal(empty.students, 0);
    assert.equal(empty.halaqat, 0);
    assert.equal(empty.total_points, 0);
  }
  assert.equal(list.body.totals.students, 1);

  // المدير يبقى مدير منصة بلا مسجد
  const me = await admin('GET', '/api/auth/me');
  assert.equal(me.body.user.mosque_id, null);
  assert.equal(me.body.mosque, null);

  // داخل واجهة المسجد الأول تظهر البيانات القديمة كما هي، مع قيمة الشيك المخصصة
  await admin('POST', '/api/mosques/enter', { id: firstId });
  const students = await admin('GET', '/api/students?period=all');
  assert.equal(students.body.students.length, 1);
  assert.equal(students.body.students[0].balance, 125);
  const rewards = await admin('GET', '/api/store/rewards?all=1');
  assert.equal(rewards.body.rewards.length, 1);
  const options = await admin('GET', '/api/cheques/vouchers/options');
  assert.equal(options.body.options.find((o) => o.value === 'attendance:early').points, 80);
});

test('المشرف القديم يبقى في مسجده ويواصل العمل', async () => {
  const supervisor = client();
  const login = await supervisor('POST', '/api/auth/login', { phone: '0530000001', code: '4321' });
  assert.equal(login.body.user.mosque_id, firstId);
  const scan = await supervisor('POST', '/api/points/scan', { code: 'RQ00003' });
  assert.equal(scan.status, 201);
  assert.equal(scan.body.wallet.balance, 150);
});

test('المسجد الجديد يبدأ من الصفر ومعزول تماماً عن غيره', async () => {
  // المدير ينشئ مشرفاً للمسجد الثاني
  const created = await admin('POST', '/api/settings/staff', { name: 'مشرف ماجد بن مترك', phone: '0530000002', mosque_id: secondId });
  assert.equal(created.status, 201);
  assert.equal(created.body.mosque_id, secondId);
  const noMosque = await admin('POST', '/api/mosques/enter', { id: 0 });
  assert.equal(noMosque.status, 200);
  const missing = await admin('POST', '/api/settings/staff', { name: 'بلا مسجد', phone: '0530000003' });
  assert.equal(missing.status, 400);

  const supervisor = client();
  await supervisor('POST', '/api/auth/login', { phone: '0530000002', code: '1234' });
  await supervisor('POST', '/api/auth/code', { current: '1234', next: '5678', confirm: '5678' });

  // يبدأ فارغاً
  assert.equal((await supervisor('GET', '/api/students')).body.students.length, 0);
  assert.equal((await supervisor('GET', '/api/halaqat')).body.halaqat.length, 0);
  assert.equal((await supervisor('GET', '/api/store/rewards')).body.rewards.length, 0);
  // قيم الشيكات الافتراضية، لا قيمة المسجد الأول المخصصة
  const options = await supervisor('GET', '/api/cheques/vouchers/options');
  assert.equal(options.body.options.find((o) => o.value === 'attendance:early').points, 70);

  // لا يستطيع مسح طالب من مسجد آخر ولا فتح ملفه ولا اختيار مسجد آخر
  const foreignScan = await supervisor('POST', '/api/points/scan', { code: 'RQ00003' });
  assert.equal(foreignScan.status, 404);
  assert.equal((await supervisor('GET', '/api/students/3')).status, 404);
  const sneaky = await supervisor('GET', `/api/students?mosque=${firstId}`);
  assert.equal(sneaky.body.students.length, 0);
  assert.equal((await supervisor('GET', '/api/mosques')).status, 403);

  // بيانات جديدة في المسجد الثاني
  const halaqa = await supervisor('POST', '/api/halaqat', { name: 'حلقة ماجد' });
  const student = await supervisor('POST', '/api/students', { name: 'طالب ماجد', halaqa_id: halaqa.body.halaqa.id });
  assert.equal(student.status, 201);
  const scan = await supervisor('POST', '/api/points/scan', { code: student.body.student.barcode });
  assert.equal(scan.status, 201);

  // لا يستطيع ربط طالب بحلقة من مسجد آخر
  const foreignHalaqa = await supervisor('POST', '/api/students', { name: 'خطأ', halaqa_id: 1 });
  assert.equal(foreignHalaqa.status, 400);

  // شيكات المسجد الأول لا تُصرف في الثاني
  await admin('POST', '/api/mosques/enter', { id: firstId });
  const batch = await admin('POST', '/api/cheques/vouchers', { type: 'attendance', item: 'early', count: 1 });
  const code = batch.body.vouchers[0].code;
  const foreignVoucher = await supervisor('POST', '/api/cheques/vouchers/redeem', { code, student_code: student.body.student.barcode });
  assert.equal(foreignVoucher.status, 404);

  // شاشة العرض لكل مسجد مستقلة
  const screenFirst = await client()('GET', `/api/screen?mosque=${firstId}`);
  assert.equal(screenFirst.body.knight.name, 'طالب قديم');
  const screenSecond = await client()('GET', `/api/screen?mosque=${secondId}`);
  assert.equal(screenSecond.body.knight.name, 'طالب ماجد');
  const noScreen = await client()('GET', '/api/screen');
  assert.equal(noScreen.status, 400);
  assert.equal(noScreen.body.mosque_required, true);

  // لوحة المنصة تجمع المسجدين
  const dash = await admin('GET', '/api/mosques');
  assert.equal(dash.body.totals.students, 2);
  assert.equal(dash.body.mosques.find((m) => m.id === secondId).students, 1);
});

test('إعدادات كل مسجد مستقلة', async () => {
  await admin('POST', '/api/mosques/enter', { id: secondId });
  const saved = await admin('PATCH', '/api/settings', { scan_points: '50' });
  assert.equal(saved.status, 200);
  assert.equal((await admin('GET', '/api/settings')).body.settings.scan_points, '50');
  await admin('POST', '/api/mosques/enter', { id: firstId });
  assert.equal((await admin('GET', '/api/settings')).body.settings.scan_points, '25');
});

test('تعطيل المسجد يمنع دخول مشرفيه', async () => {
  const third = (await admin('GET', '/api/mosques')).body.mosques[2];
  await admin('POST', '/api/settings/staff', { name: 'مشرف الضحيان', phone: '0530000004', mosque_id: third.id });
  await admin('PATCH', `/api/mosques/${third.id}`, { active: false });
  const blocked = await client()('POST', '/api/auth/login', { phone: '0530000004', code: '1234' });
  assert.equal(blocked.status, 401);
  await admin('PATCH', `/api/mosques/${third.id}`, { active: true });
  const allowed = await client()('POST', '/api/auth/login', { phone: '0530000004', code: '1234' });
  assert.equal(allowed.status, 200);
});
