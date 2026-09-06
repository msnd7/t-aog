'use strict';
const fs = require('node:fs');
const path = require('node:path');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/**
 * محرّك SQLite: يُستخدم المدمج في Node 22.5+ (node:sqlite)، وإن كانت
 * الاستضافة تعمل بإصدار أقدم فتُستخدم حزمة better-sqlite3 إن كانت مثبّتة.
 * الواجهتان متطابقتان في ما تستخدمه المنصة (prepare / run / get / all / exec).
 */
function openDatabase(file) {
  try {
    const { DatabaseSync } = require('node:sqlite');
    if (DatabaseSync) return new DatabaseSync(file);
  } catch { /* إصدار Node لا يوفّر node:sqlite */ }
  try {
    const BetterSqlite3 = require('better-sqlite3');
    return new BetterSqlite3(file);
  } catch {
    throw new Error(
      'تعذّر تشغيل قاعدة البيانات: تحتاج Node.js 22.5 أو أحدث، '
      + 'أو ثبّت الحزمة البديلة بالأمر: npm install better-sqlite3'
    );
  }
}

const db = openDatabase(path.join(DATA_DIR, 'app.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const USERS_TABLE = `
CREATE TABLE IF NOT EXISTS users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  phone            TEXT UNIQUE,
  code_hash        TEXT NOT NULL,
  must_change_code INTEGER NOT NULL DEFAULT 1,
  role             TEXT NOT NULL CHECK (role IN ('admin','supervisor','student')),
  name             TEXT NOT NULL,
  halaqa_id        INTEGER REFERENCES halaqat(id) ON DELETE SET NULL,
  photo            TEXT,
  barcode          TEXT UNIQUE,
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL
);`;

/**
 * ترقية قواعد البيانات القديمة: كان الدخول باسم مستخدم وكلمة مرور،
 * وأصبح برقم الجوال ورمز مؤقت. تُنقل الحسابات القائمة كما هي.
 */
function migrateUsersToPhoneLogin() {
  const table = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (!table || !/username/.test(table.sql)) return;
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('PRAGMA legacy_alter_table = ON');
  db.exec('ALTER TABLE users RENAME TO users_legacy');
  db.exec(USERS_TABLE);
  db.exec(`
    INSERT INTO users (id, phone, code_hash, must_change_code, role, name, halaqa_id, photo, barcode, active, created_at)
    SELECT id,
           CASE WHEN username GLOB '0[0-9]*' THEN username ELSE NULL END,
           password_hash, 1, role, name, halaqa_id, photo, barcode, active, created_at
      FROM users_legacy
  `);
  db.exec('DROP TABLE users_legacy');
  db.exec('PRAGMA legacy_alter_table = OFF');
  db.exec('PRAGMA foreign_keys = ON');
  console.log('تمت ترقية الحسابات إلى الدخول برقم الجوال.');
}

migrateUsersToPhoneLogin();

db.exec(`
CREATE TABLE IF NOT EXISTS halaqat (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  teacher_name  TEXT,
  supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

${USERS_TABLE}

CREATE TABLE IF NOT EXISTS cheques (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  serial       TEXT NOT NULL UNIQUE,
  student_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  halaqa_id    INTEGER REFERENCES halaqat(id) ON DELETE SET NULL,
  type         TEXT NOT NULL,
  items        TEXT NOT NULL,
  total        INTEGER NOT NULL,
  teacher_name TEXT,
  note         TEXT,
  issued_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  issued_at    TEXT NOT NULL,
  printed_at   TEXT
);

CREATE TABLE IF NOT EXISTS point_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  halaqa_id  INTEGER REFERENCES halaqat(id) ON DELETE SET NULL,
  category   TEXT NOT NULL,
  subtype    TEXT,
  points     INTEGER NOT NULL,
  note       TEXT,
  cheque_id  INTEGER REFERENCES cheques(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_student ON point_entries(student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_entries_halaqa  ON point_entries(halaqa_id, created_at);

CREATE TABLE IF NOT EXISTS rewards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,
  price       INTEGER NOT NULL,
  image       TEXT,
  stock       INTEGER NOT NULL DEFAULT -1,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS redemptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id  INTEGER NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  price      INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  note       TEXT,
  created_at TEXT NOT NULL,
  handled_at TEXT,
  handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`);

const DEFAULT_SETTINGS = {
  academy_name: 'مجمع رياض القرآن التعليمي',
  academy_subtitle: 'لتحفيظ القرآن الكريم - بمدينة الملك سعود السكنية - ديراب',
  currency: 'ريال',
  scan_points: '25',
  scan_cooldown_seconds: '20',
  week_start_day: '0',
  cheque_attendance_early: '70',
  cheque_attendance_general: '50',
  cheque_recitation_hifz: '25',
  cheque_recitation_review: '25',
  cheque_recitation_both: '50',
  cheque_discipline: '25',
  screen_rotate_seconds: '14',
  allow_student_photo_upload: '1',
  default_code: '1234'
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(key, value);

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULT_SETTINGS };
  for (const row of rows) out[row.key] = row.value;
  return out;
}

function getSetting(key) {
  return getSettings()[key];
}

function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

module.exports = { db, DATA_DIR, UPLOAD_DIR, getSettings, getSetting, setSetting, DEFAULT_SETTINGS };
