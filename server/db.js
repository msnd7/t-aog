'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * مجلد البيانات: يُفضَّل قرص دائم. بعض الاستضافات (مثل Vercel) لا تسمح بالكتابة
 * إلا في مجلد مؤقت، فيُستخدم عندها مجلد النظام المؤقت ويُرفع العلم writable = false
 * ليُخزَّن المرفوع داخل قاعدة البيانات بدل القرص.
 */
function resolveDataDir() {
  const wanted = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  try {
    fs.mkdirSync(path.join(wanted, 'uploads'), { recursive: true });
    fs.accessSync(wanted, fs.constants.W_OK);
    return { dir: wanted, writable: true };
  } catch {
    const fallback = path.join(os.tmpdir(), 'riyad-quran-data');
    try { fs.mkdirSync(path.join(fallback, 'uploads'), { recursive: true }); } catch { /* لا شيء */ }
    return { dir: fallback, writable: false };
  }
}

const dataDir = resolveDataDir();
const DATA_DIR = dataDir.dir;
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const REMOTE_URL = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || '';
const REMOTE_TOKEN = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || '';

/**
 * محرّك SQLite. الترتيب:
 *   ١) قاعدة libSQL بعيدة (Turso) إن ضُبط TURSO_DATABASE_URL — لازمة للاستضافات
 *      بلا قرص دائم مثل Vercel، لأن ملف قاعدة البيانات هناك يُمحى مع كل نشر.
 *   ٢) node:sqlite المدمج في Node 22.5 فأحدث.
 *   ٣) حزمة better-sqlite3 على إصدارات Node الأقدم.
 * الواجهات الثلاث متطابقة في ما تستخدمه المنصة (prepare / run / get / all / exec).
 */
function openDatabase(file) {
  if (REMOTE_URL) {
    let LibsqlDatabase;
    try {
      LibsqlDatabase = require('libsql');
    } catch {
      throw new Error('ضُبط TURSO_DATABASE_URL لكن حزمة libsql غير مثبّتة: npm install libsql');
    }
    return { db: wrapLibsql(new LibsqlDatabase(REMOTE_URL, { authToken: REMOTE_TOKEN })), remote: true };
  }
  try {
    const { DatabaseSync } = require('node:sqlite');
    if (DatabaseSync) return { db: new DatabaseSync(file), remote: false };
  } catch { /* إصدار Node لا يوفّر node:sqlite */ }
  try {
    const BetterSqlite3 = require('better-sqlite3');
    return { db: new BetterSqlite3(file), remote: false };
  } catch {
    throw new Error(
      'تعذّر تشغيل قاعدة البيانات: تحتاج Node.js 22.5 أو أحدث، '
      + 'أو ثبّت الحزمة البديلة بالأمر: npm install better-sqlite3'
    );
  }
}

/** سائق libsql يضيف الحقل _metadata إلى كل صف؛ يُنزع كي لا يظهر في ردود الواجهة. */
function wrapLibsql(raw) {
  const clean = (row) => {
    if (row && typeof row === 'object') delete row._metadata;
    return row;
  };
  return {
    exec: (sql) => raw.exec(sql),
    prepare: (sql) => {
      const statement = raw.prepare(sql);
      return {
        run: (...args) => statement.run(...args),
        get: (...args) => clean(statement.get(...args)),
        all: (...args) => statement.all(...args).map(clean)
      };
    }
  };
}

const opened = openDatabase(path.join(DATA_DIR, 'app.db'));
const db = opened.db;
const REMOTE_DB = opened.remote;

/** الصور المرفوعة تُخزَّن في قاعدة البيانات متى كان القرص مؤقتاً أو القاعدة بعيدة. */
const UPLOADS_IN_DB = REMOTE_DB || !dataDir.writable;

/** أوامر PRAGMA غير مدعومة على القواعد البعيدة، فتُتجاوز بهدوء. */
function tryExec(sql) {
  try { db.exec(sql); } catch { /* غير مدعوم على هذا المحرّك */ }
}

tryExec('PRAGMA journal_mode = WAL');
tryExec('PRAGMA foreign_keys = ON');

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
  tryExec('PRAGMA foreign_keys = OFF');
  tryExec('PRAGMA legacy_alter_table = ON');
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
  tryExec('PRAGMA legacy_alter_table = OFF');
  tryExec('PRAGMA foreign_keys = ON');
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

CREATE TABLE IF NOT EXISTS uploads (
  name       TEXT NOT NULL,
  chunk      INTEGER NOT NULL,
  mime       TEXT NOT NULL,
  data       BLOB NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (name, chunk)
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

module.exports = {
  db, DATA_DIR, UPLOAD_DIR, REMOTE_DB, UPLOADS_IN_DB,
  getSettings, getSetting, setSetting, DEFAULT_SETTINGS
};
