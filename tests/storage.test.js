'use strict';
/**
 * تنظيف التخزين: تُحذف صور الطلاب الملغاة والجلسات المنتهية والصور التي لم تعد مرتبطة
 * بجائزة أو بالشعار، وتبقى صور الجوائز والشعار والصور الحديثة التي قد يجري رفعها الآن.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'riyad-storage-'));
const { db, UPLOAD_DIR, cleanupStorage } = require('../server/db');

const old = new Date(Date.now() - 3 * 86400000);
const now = new Date().toISOString();

/** صورة في جدول uploads وعلى القرص معاً، بتاريخ قديم أو حديث */
async function addImage(name, at) {
  await db.prepare('INSERT INTO uploads (name, chunk, mime, data, created_at) VALUES (?, 0, ?, ?, ?)')
    .run(name, 'image/jpeg', Buffer.from('img'), at.toISOString());
  const file = path.join(UPLOAD_DIR, name);
  fs.writeFileSync(file, 'img');
  fs.utimesSync(file, at, at);
}

const stored = async (name) => !!(await db.prepare('SELECT 1 FROM uploads WHERE name = ?').get(name));
const onDisk = (name) => fs.existsSync(path.join(UPLOAD_DIR, name));

test('التنظيف يحذف صور الطلاب والصور اليتيمة والجلسات المنتهية فقط', async () => {
  await addImage('student.jpg', new Date());
  await addImage('orphan.jpg', old);
  await addImage('reward.jpg', old);
  await addImage('logo.png', old);
  await addImage('fresh.webp', new Date());

  const student = await db.prepare(`INSERT INTO users (phone, code_hash, role, name, photo, mosque_id, created_at)
    VALUES ('0599000001', 'x', 'student', 'طالب بصورة', '/uploads/student.jpg', 1, ?) RETURNING id`).get(now);
  await db.prepare("INSERT INTO rewards (name, price, image, mosque_id, created_at) VALUES ('جائزة', 50, '/uploads/reward.jpg', 1, ?)").run(now);
  await db.prepare("INSERT INTO settings (key, value) VALUES ('logo', '/uploads/logo.png') ON CONFLICT (key) DO UPDATE SET value = excluded.value").run();
  await db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run('expired', student.id, now, old.toISOString());
  await db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run('live', student.id, now, new Date(Date.now() + 86400000).toISOString());

  const done = await cleanupStorage({ force: true });
  assert.equal(done.photos, 1);

  const user = await db.prepare('SELECT photo FROM users WHERE id = ?').get(student.id);
  assert.equal(user.photo, null);
  assert.equal(await stored('student.jpg'), false);
  assert.equal(onDisk('student.jpg'), false);
  assert.equal(await stored('orphan.jpg'), false);
  assert.equal(onDisk('orphan.jpg'), false);

  for (const name of ['reward.jpg', 'logo.png', 'fresh.webp']) {
    assert.equal(await stored(name), true, name);
    assert.equal(onDisk(name), true, name);
  }

  assert.equal(await db.prepare("SELECT 1 FROM sessions WHERE token = 'expired'").get(), undefined);
  assert.ok(await db.prepare("SELECT 1 FROM sessions WHERE token = 'live'").get());

  // لا يتكرر التنظيف الكامل قبل مرور يوم
  assert.equal(await cleanupStorage(), null);
});
