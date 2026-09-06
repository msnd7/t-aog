'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// قاعدة بيانات مؤقتة لكل تشغيل للاختبارات
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'riyad-test-'));
process.env.DATA_DIR = DATA_DIR;
process.env.ADMIN_PHONE = '0500000001';

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

test('الدخول برقم الجوال والرمز المؤقت ثم إلزام تغيير الرمز', async () => {
  const unknown = await call('POST', '/api/auth/check-phone', { phone: '0555555555' });
  assert.equal(unknown.status, 404);

  const known = await call('POST', '/api/auth/check-phone', { phone: '+966500000001' });
  assert.equal(known.status, 200);
  assert.equal(known.body.phone, '0500000001');

  const bad = await call('POST', '/api/auth/login', { phone: '0500000001', code: '9999' });
  assert.equal(bad.status, 401);

  const res = await call('POST', '/api/auth/login', { phone: '٠٥٠٠٠٠٠٠٠١', code: '1234' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, 'admin');
  assert.equal(res.body.user.must_change_code, true);

  // قبل تغيير الرمز لا تُفتح بقية الشاشات
  const blocked = await call('GET', '/api/students');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code_change_required, true);

  const sameCode = await call('POST', '/api/auth/code', { current: '1234', next: '1234' });
  assert.equal(sameCode.status, 400);
  const mismatch = await call('POST', '/api/auth/code', { current: '1234', next: '4321', confirm: '1111' });
  assert.equal(mismatch.status, 400);
  const wrongCurrent = await call('POST', '/api/auth/code', { current: '0000', next: '4321', confirm: '4321' });
  assert.equal(wrongCurrent.status, 400);

  const changed = await call('POST', '/api/auth/code', { current: '1234', next: '4321', confirm: '4321' });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.user.must_change_code, false);

  const allowed = await call('GET', '/api/students');
  assert.equal(allowed.status, 200);
});

let halaqaId;
let studentId;
let barcode;

test('إنشاء حلقة وطالب مع باركود', async () => {
  const halaqa = await call('POST', '/api/halaqat', { name: 'حلقة الاختبار', teacher_name: 'الأستاذ تجربة' });
  assert.equal(halaqa.status, 201);
  halaqaId = halaqa.body.halaqa.id;

  const student = await call('POST', '/api/students', {
    name: 'طالب تجريبي', halaqa_id: halaqaId, phone: '0512345678'
  });
  assert.equal(student.status, 201);
  studentId = student.body.student.id;
  barcode = student.body.student.barcode;
  assert.match(barcode, /^RQ\d{5}$/);
  assert.equal(student.body.student.phone, '0512345678');
  assert.equal(student.body.student.code, '1234');

  const duplicate = await call('POST', '/api/students', { name: 'مكرر', phone: '0512345678' });
  assert.equal(duplicate.status, 409);

  const badPhone = await call('POST', '/api/students', { name: 'رقم خاطئ', phone: '12' });
  assert.equal(badPhone.status, 400);
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

test('الطالب يدخل برقم جواله ولا يرى غير صفحته', async () => {
  const other = await call('POST', '/api/students', { name: 'طالب آخر', halaqa_id: halaqaId });
  const otherId = other.body.student.id;

  cookie = '';
  const login = await call('POST', '/api/auth/login', { phone: '0512345678', code: '1234' });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, 'student');
  assert.equal(login.body.user.must_change_code, true);

  const changed = await call('POST', '/api/auth/code', { current: '1234', next: '2580', confirm: '2580' });
  assert.equal(changed.status, 200);

  const mine = await call('GET', `/api/students/${studentId}`);
  assert.equal(mine.status, 200);
  const forbidden = await call('GET', `/api/students/${otherId}`);
  assert.equal(forbidden.status, 403);
  const staffOnly = await call('POST', '/api/points', { student_id: studentId, points: 500 });
  assert.equal(staffOnly.status, 403);
});

test('إعادة تعيين رمز الطالب تعيده للرمز المؤقت', async () => {
  cookie = '';
  await call('POST', '/api/auth/login', { phone: '0500000001', code: '4321' });
  const reset = await call('POST', `/api/students/${studentId}/reset-code`);
  assert.equal(reset.status, 200);
  assert.equal(reset.body.code, '1234');

  cookie = '';
  const relogin = await call('POST', '/api/auth/login', { phone: '0512345678', code: '1234' });
  assert.equal(relogin.status, 200);
  assert.equal(relogin.body.user.must_change_code, true);
});

test('توحيد صيغة أرقام الجوال', () => {
  const { normalizePhone } = require('../server/util');
  assert.equal(normalizePhone('+966 50 123 4567'), '0501234567');
  assert.equal(normalizePhone('٠٥٠١٢٣٤٥٦٧'), '0501234567');
  assert.equal(normalizePhone('501234567'), '0501234567');
  assert.equal(normalizePhone('05123'), null);
  assert.equal(normalizePhone('غير رقم'), null);
});

test('تفقيط المبالغ بالعربية', () => {
  const { tafqit } = require('../server/util');
  assert.equal(tafqit(25), 'خمسة وعشرون ريال فقط لا غير');
  assert.equal(tafqit(50), 'خمسون ريال فقط لا غير');
  assert.equal(tafqit(175), 'مائة وخمسة وسبعون ريال فقط لا غير');
});
