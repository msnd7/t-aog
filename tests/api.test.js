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

let server;
let base;
// مخزن ملفات تعريف الارتباط: الجلسة ومسجد المدير الحالي
const jar = new Map();
let cookie = '';
const syncCookie = () => { cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; '); };
const resetCookies = () => { jar.clear(); cookie = ''; };

async function call(method, url, body, isForm = false) {
  const options = { method, headers: {} };
  if (cookie) options.headers.cookie = cookie;
  if (body !== undefined && !isForm) {
    options.headers['content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  } else if (isForm) options.body = body;
  const response = await fetch(base + url, options);
  const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  for (const raw of setCookie) {
    const [pair] = raw.split(';');
    const idx = pair.indexOf('=');
    const value = pair.slice(idx + 1);
    if (value) jar.set(pair.slice(0, idx), value); else jar.delete(pair.slice(0, idx));
  }
  syncCookie();
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { payload = text; }
  return { status: response.status, body: payload };
}

test.before(async () => {
  await ensureAdmin();
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

  // مدير المنصة يبدأ من لوحة المنصة، ويختار المسجد قبل فتح بياناته
  const noMosque = await call('GET', '/api/students');
  assert.equal(noMosque.status, 400);
  assert.equal(noMosque.body.mosque_required, true);

  const entered = await call('POST', '/api/mosques/enter', { id: 1 });
  assert.equal(entered.status, 200);
  assert.equal(entered.body.mosque.name, 'جامع عبدالله بن عمر');

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

test('دفعة شيكات فارغة: تُنشأ بباركود لكل شيك وتُصرف بالمسح مرة واحدة', async () => {
  const options = await call('GET', '/api/cheques/vouchers/options');
  assert.equal(options.status, 200);
  const early = options.body.options.find((one) => one.value === 'attendance:early');
  assert.equal(early.points, 70);

  const batch = await call('POST', '/api/cheques/vouchers', { type: 'attendance', item: 'early', count: 3 });
  assert.equal(batch.status, 201);
  assert.equal(batch.body.count, 3);
  const codes = batch.body.vouchers.map((voucher) => voucher.code);
  for (const code of codes) assert.match(code, /^RQC\d{5}$/);

  // باركود الشيك لا يضيف نقاطاً بنفسه، بل ينتظر بطاقة الطالب
  const before = await call('GET', `/api/students/${studentId}`);
  const scanned = await call('POST', '/api/points/scan', { code: codes[0] });
  assert.equal(scanned.status, 200);
  assert.equal(scanned.body.kind, 'voucher');
  const stillSame = await call('GET', `/api/students/${studentId}`);
  assert.equal(stillSame.body.wallet.balance, before.body.wallet.balance);

  const redeemed = await call('POST', '/api/cheques/vouchers/redeem', { code: codes[0], student_code: barcode });
  assert.equal(redeemed.status, 201);
  assert.equal(redeemed.body.points, 70);
  assert.equal(redeemed.body.wallet.balance, before.body.wallet.balance + 70);

  // لا يُصرف الشيك مرتين
  const again = await call('POST', '/api/cheques/vouchers/redeem', { code: codes[0], student_code: barcode });
  assert.equal(again.status, 409);
  const rescan = await call('POST', '/api/points/scan', { code: codes[0] });
  assert.equal(rescan.status, 409);
  assert.equal(rescan.body.duplicate, true);

  const unknown = await call('POST', '/api/cheques/vouchers/redeem', { code: 'RQC99999', student_code: barcode });
  assert.equal(unknown.status, 404);

  const batches = await call('GET', '/api/cheques/vouchers/batches');
  const row = batches.body.batches.find((one) => one.batch === batch.body.batch);
  assert.equal(Number(row.total), 3);
  assert.equal(Number(row.redeemed), 1);

  const printed = await call('POST', '/api/cheques/vouchers/printed', { batch: batch.body.batch });
  assert.equal(printed.body.count, 3);

  const sheet = await call('GET', `/api/cheques/vouchers/print?batch=${batch.body.batch}`);
  assert.equal(sheet.body.vouchers.length, 3);
  assert.equal(sheet.body.vouchers[0].amount_words, 'سبعون ريال فقط لا غير');

  // الحذف يبقي المصروف ويحذف غير المصروف
  const removed = await call('DELETE', `/api/cheques/vouchers/batch/${batch.body.batch}`);
  assert.equal(removed.body.count, 2);
});

test('عدد الشيكات في الدفعة لا بد أن يكون صحيحاً', async () => {
  const none = await call('POST', '/api/cheques/vouchers', { type: 'attendance', item: 'early', count: 0 });
  assert.equal(none.status, 400);
  const tooMany = await call('POST', '/api/cheques/vouchers', { type: 'attendance', item: 'early', count: 900 });
  assert.equal(tooMany.status, 400);
  const badItem = await call('POST', '/api/cheques/vouchers', { type: 'attendance', item: 'nope', count: 5 });
  assert.equal(badItem.status, 400);
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

test('المتجر: إقفال الشراء وفتحه لكل جائزة وللمتجر كله', async () => {
  const reward = await call('POST', '/api/store/rewards', { name: 'قلم', price: 25, purchasable: '0' });
  assert.equal(reward.status, 201);
  const rewardId = reward.body.reward.id;
  assert.equal(reward.body.reward.purchasable, 0);

  // الجائزة ظاهرة لكن شراؤها مقفل حتى يفتحه المشرف
  const locked = await call('POST', `/api/store/rewards/${rewardId}/redeem`, { student_id: studentId });
  assert.equal(locked.status, 400);
  await call('PATCH', `/api/store/rewards/${rewardId}`, { purchasable: '1' });

  // إقفال المتجر كله يمنع الشراء مع بقاء الجوائز ظاهرة
  const closed = await call('POST', '/api/store/status', { open: false });
  assert.equal(closed.body.store_open, false);
  const list = await call('GET', '/api/store/rewards');
  assert.equal(list.body.store_open, false);
  assert.ok(list.body.rewards.some((r) => r.id === rewardId));
  const blocked = await call('POST', `/api/store/rewards/${rewardId}/redeem`, { student_id: studentId });
  assert.equal(blocked.status, 400);

  await call('POST', '/api/store/status', { open: true });
  const bought = await call('POST', `/api/store/rewards/${rewardId}/redeem`, { student_id: studentId });
  assert.equal(bought.status, 201);

  // حذف جائزة سبق طلبها يخفيها من المتجر ويُبقي الطلب في السجل
  const removed = await call('DELETE', `/api/store/rewards/${rewardId}`);
  assert.equal(removed.body.deleted, true);
  const all = await call('GET', '/api/store/rewards?all=1');
  assert.ok(!all.body.rewards.some((r) => r.id === rewardId));
  const orders = await call('GET', `/api/store/redemptions?student_id=${studentId}`);
  assert.ok(orders.body.redemptions.some((r) => r.reward_id === rewardId));
  await call('POST', `/api/store/redemptions/${orders.body.redemptions[0].id}/status`, { status: 'rejected' });
});

test('شاشة العرض: اختيار الفترة أسبوعاً أو شهراً أو من تاريخ أو كل الأيام', async () => {
  const bad = await call('PATCH', '/api/screen/settings', { screen_period: 'since', screen_from: '' });
  assert.equal(bad.status, 400);

  const month = await call('PATCH', '/api/screen/settings', { screen_period: 'month' });
  assert.equal(month.status, 200);
  let screen = await call('GET', '/api/screen');
  assert.equal(screen.body.period, 'month');
  assert.equal(screen.body.titles.knight, 'فارس الشهر');

  const since = await call('PATCH', '/api/screen/settings', { screen_period: 'since', screen_from: '2020-01-01' });
  assert.equal(since.status, 200);
  screen = await call('GET', '/api/screen');
  assert.equal(screen.body.period, 'since');
  assert.ok(screen.body.range.from.startsWith('2019-12-31') || screen.body.range.from.startsWith('2020-01-01'));
  assert.equal(screen.body.range.to, null);
  assert.equal(screen.body.knight.id, studentId);
  // فارس الأسبوع يظهر مع نقاط الفترة منذ بدايتها
  assert.equal(screen.body.week.label, 'هذا الأسبوع');
  assert.equal(screen.body.week.knight.id, studentId);
  assert.equal(screen.body.week.knight.period_points, screen.body.knight.points);
  assert.equal(screen.body.week.knight.period_rank, 1);
  assert.equal(screen.body.week.halaqa.id, halaqaId);

  await call('PATCH', '/api/screen/settings', { screen_period: 'all' });
  screen = await call('GET', '/api/screen');
  assert.equal(screen.body.range.from, null);
  // الرابط يتجاوز الإعداد المحفوظ
  screen = await call('GET', '/api/screen?period=week');
  assert.equal(screen.body.titles.knight, 'فارس الأسبوع');
  assert.equal(screen.body.week, null);
  await call('PATCH', '/api/screen/settings', { screen_period: 'week' });
});

test('الطالب يدخل برقم جواله ولا يرى غير صفحته', async () => {
  const other = await call('POST', '/api/students', { name: 'طالب آخر', halaqa_id: halaqaId });
  const otherId = other.body.student.id;

  resetCookies();
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
  resetCookies();
  await call('POST', '/api/auth/login', { phone: '0500000001', code: '4321' });
  await call('POST', '/api/mosques/enter', { id: 1 });
  const reset = await call('POST', `/api/students/${studentId}/reset-code`);
  assert.equal(reset.status, 200);
  assert.equal(reset.body.code, '1234');

  resetCookies();
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
