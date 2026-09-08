'use strict';
/**
 * مسار الاستضافات بلا قرص دائم (Vercel): قاعدة libSQL بعيدة عبر سائق libsql،
 * والصور المرفوعة داخل قاعدة البيانات بدل القرص.
 * يُتخطّى الملف إن لم تكن حزمة libsql مثبّتة (حزمة اختيارية).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let libsqlAvailable = true;
try { require('libsql'); } catch { libsqlAvailable = false; }

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'riyad-serverless-'));
process.env.DATA_DIR = DATA_DIR;
process.env.ADMIN_PHONE = '0500000007';
// مسار ملف يقبله سائق libsql محلياً، ويسلك المسار نفسه الذي تسلكه قاعدة Turso البعيدة.
process.env.LIBSQL_URL = path.join(DATA_DIR, 'remote.db');

let app;
let db;
let server;
let base;
let cookie = '';

async function call(method, url, body, form) {
  const options = { method, headers: {} };
  if (cookie) options.headers.cookie = cookie;
  if (form) options.body = form;
  else if (body !== undefined) {
    options.headers['content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const response = await fetch(base + url, options);
  for (const raw of (response.headers.getSetCookie ? response.headers.getSetCookie() : [])) {
    cookie = raw.split(';')[0];
  }
  const text = await response.text();
  let payload = null;
  try { payload = JSON.parse(text); } catch { payload = text; }
  return { status: response.status, body: payload };
}

test.before(async (t) => {
  if (!libsqlAvailable) return t.skip('حزمة libsql غير مثبّتة');
  db = require('../server/db');
  const entry = require('../server/index');
  app = entry.app;
  await entry.ensureAdmin();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;

  const login = await call('POST', '/api/auth/login', { phone: '0500000007', code: '1234' });
  assert.equal(login.status, 200);
  const changed = await call('POST', '/api/auth/code', { current: '1234', next: '4321' });
  assert.equal(changed.status, 200);
});

test.after(() => {
  if (server) server.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

test('سائق libsql يعمل ويحوّل التخزين إلى قاعدة البيانات', { skip: !libsqlAvailable }, () => {
  assert.equal(db.REMOTE_DB, true);
  assert.equal(db.UPLOADS_IN_DB, true);
});

test('ردود الواجهة نظيفة من حقول السائق الداخلية', { skip: !libsqlAvailable }, async () => {
  const me = await call('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.ok(!('_metadata' in me.body.user), 'ظهر حقل _metadata في رد الواجهة');
});

test('ترقيم السجلات الجديدة سليم عبر السائق', { skip: !libsqlAvailable }, async () => {
  const halaqa = await call('POST', '/api/halaqat', { name: 'حلقة بلا قرص' });
  assert.equal(halaqa.status, 201);
  assert.ok(Number.isInteger(halaqa.body.halaqa.id));

  const student = await call('POST', '/api/students', {
    name: 'طالب بلا قرص', phone: '0511111111', halaqa_id: halaqa.body.halaqa.id
  });
  assert.equal(student.status, 201);
  assert.ok(Number.isInteger(student.body.student.id));
});

test('الصورة المرفوعة تُحفظ في قاعدة البيانات وتُقدَّم كاملة', { skip: !libsqlAvailable }, async () => {
  const created = await call('POST', '/api/students', { name: 'طالب الصورة' });
  assert.equal(created.status, 201);

  // أكبر من قطعة تخزين واحدة، للتأكد من تجميع القطع عند القراءة
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(700 * 1024, 7)]);
  const form = new FormData();
  form.append('photo', new Blob([png], { type: 'image/png' }), 'p.png');

  const uploaded = await call('POST', `/api/students/${created.body.student.id}/photo`, undefined, form);
  assert.equal(uploaded.status, 200);
  assert.match(uploaded.body.photo, /^\/uploads\//);

  const fetched = await fetch(base + uploaded.body.photo);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.headers.get('content-type'), 'image/png');
  assert.ok(Buffer.from(await fetched.arrayBuffer()).equals(png));

  const missing = await fetch(`${base}/uploads/la-shay2.png`);
  assert.equal(missing.status, 404);
});
