'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// قاعدة بيانات مؤقتة لكل تشغيل للاختبارات
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'riyad-test-'));
process.env.DATA_DIR = DATA_DIR;
process.env.ADMIN_PASSWORD = 'test1234';

const { app, ensureAdmin } = require('../server/index');
ensureAdmin();

let server;
let base;
let cookie = '';

async function call(method, url, body, isForm = false) {
  const options = { method, headers: {} };
  if (cookie) options.headers.cookie = cookie;
  if (body !== undefined && !isForm) {
    options.headers['content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  } else if (isForm) options.body = body;
  const response = await fetch(base + url, options);
  const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  for (const raw of setCookie) cookie = raw.split(';')[0];
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { payload = text; }
  return { status: response.status, body: payload };
}

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test('يمنع الوصول قبل تسجيل الدخول', async () => {
  const res = await call('GET', '/api/students');
  assert.equal(res.status, 401);
});

test('تسجيل دخول المدير', async () => {
  const bad = await call('POST', '/api/auth/login', { username: 'admin', password: 'wrong' });
  assert.equal(bad.status, 401);
  const res = await call('POST', '/api/auth/login', { username: 'admin', password: 'test1234' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, 'admin');
});

let halaqaId;
let studentId;
let barcode;

test('إنشاء حلقة وطالب مع باركود', async () => {
  const halaqa = await call('POST', '/api/halaqat', { name: 'حلقة الاختبار', teacher_name: 'الأستاذ تجربة' });
  assert.equal(halaqa.status, 201);
  halaqaId = halaqa.body.halaqa.id;

  const student = await call('POST', '/api/students', { name: 'طالب تجريبي', halaqa_id: halaqaId });
  assert.equal(student.status, 201);
  studentId = student.body.student.id;
  barcode = student.body.student.barcode;
  assert.match(barcode, /^RQ\d{5}$/);
});

test('مسح الباركود يضيف 25 نقطة ويمنع التكرار الفوري', async () => {
  const first = await call('POST', '/api/points/scan', { code: barcode });
  assert.equal(first.status, 201);
  assert.equal(first.body.points, 25);
  assert.equal(first.body.wallet.balance, 25);

  const duplicate = await call('POST', '/api/points/scan', { code: barcode });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.duplicate, true);

  const unknown = await call('POST', '/api/points/scan', { code: 'RQ99999' });
  assert.equal(unknown.status, 404);
});

let chequeId;

test('إصدار شيك الحضور المبكر يمنح 70 نقطة', async () => {
  const res = await call('POST', '/api/cheques', {
    type: 'attendance', items: ['early'], student_ids: [studentId], teacher_name: 'الأستاذ تجربة'
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.total, 70);
  chequeId = res.body.ids[0];
  assert.equal(res.body.cheques[0].amount_words, 'سبعون ريال فقط لا غير');

  const profile = await call('GET', `/api/students/${studentId}`);
  assert.equal(profile.body.wallet.balance, 95);
});

test('شيك التسميع يقبل حفظ ومراجعة بقيمة 50', async () => {
  const res = await call('POST', '/api/cheques', { type: 'recitation', items: ['both'], student_ids: [studentId] });
  assert.equal(res.status, 201);
  assert.equal(res.body.total, 50);

  const bad = await call('POST', '/api/cheques', { type: 'unknown', items: ['both'], student_ids: [studentId] });
  assert.equal(bad.status, 400);
});

test('إلغاء الشيك يسحب نقاطه', async () => {
  const before = await call('GET', `/api/students/${studentId}`);
  await call('DELETE', `/api/cheques/${chequeId}`);
  const after = await call('GET', `/api/students/${studentId}`);
  assert.equal(after.body.wallet.balance, before.body.wallet.balance - 70);
});

test('الصدارة وفارس الأسبوع تعتمد على النقاط', async () => {
  const screen = await call('GET', '/api/screen');
  assert.equal(screen.status, 200);
  assert.equal(screen.body.knight.id, studentId);
  assert.equal(screen.body.halaqa_of_week.id, halaqaId);

  const board = await call('GET', '/api/screen/leaderboard?scope=halaqat&period=week');
  assert.equal(board.body.rows[0].id, halaqaId);
});

test('نقاط الحلقة تُضاف بشكل مستقل', async () => {
  const before = await call('GET', `/api/halaqat/${halaqaId}`);
  const res = await call('POST', '/api/points', { halaqa_only: true, halaqa_id: halaqaId, points: 100, note: 'نظافة الحلقة' });
  assert.equal(res.status, 201);
  const after = await call('GET', `/api/halaqat/${halaqaId}`);
  assert.equal(after.body.totals.points, before.body.totals.points + 100);
});

test('المتجر: الاستبدال يخصم النقاط والرفض يعيدها', async () => {
  const reward = await call('POST', '/api/store/rewards', { name: 'مصحف', price: 50 });
  assert.equal(reward.status, 201);
  const rewardId = reward.body.reward.id;

  const before = await call('GET', `/api/students/${studentId}`);
  const redeem = await call('POST', `/api/store/rewards/${rewardId}/redeem`, { student_id: studentId });
  assert.equal(redeem.status, 201);
  assert.equal(redeem.body.wallet.balance, before.body.wallet.balance - 50);

  const pending = await call('GET', '/api/store/redemptions?status=pending');
  const redemptionId = pending.body.redemptions[0].id;
  await call('POST', `/api/store/redemptions/${redemptionId}/status`, { status: 'rejected' });
  const after = await call('GET', `/api/students/${studentId}`);
  assert.equal(after.body.wallet.balance, before.body.wallet.balance);
});

test('الطالب يرى صفحته فقط', async () => {
  await call('PATCH', `/api/students/${studentId}`, { password: 'student1' });
  const other = await call('POST', '/api/students', { name: 'طالب آخر', halaqa_id: halaqaId });
  const otherId = other.body.student.id;
  const username = (await call('GET', `/api/students/${studentId}`)).body.student.username;

  cookie = '';
  const login = await call('POST', '/api/auth/login', { username, password: 'student1' });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, 'student');

  const mine = await call('GET', `/api/students/${studentId}`);
  assert.equal(mine.status, 200);
  const forbidden = await call('GET', `/api/students/${otherId}`);
  assert.equal(forbidden.status, 403);
  const staffOnly = await call('POST', '/api/points', { student_id: studentId, points: 500 });
  assert.equal(staffOnly.status, 403);
});

test('تفقيط المبالغ بالعربية', () => {
  const { tafqit } = require('../server/util');
  assert.equal(tafqit(25), 'خمسة وعشرون ريال فقط لا غير');
  assert.equal(tafqit(50), 'خمسون ريال فقط لا غير');
  assert.equal(tafqit(175), 'مائة وخمسة وسبعون ريال فقط لا غير');
});
