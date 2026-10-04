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

const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL
  || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || '';
const REMOTE_URL = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || '';
const REMOTE_TOKEN = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || '';

/**
 * محرّك قاعدة البيانات. الترتيب:
 *   ١) Postgres بعيدة (Neon/Vercel Postgres) إن ضُبط POSTGRES_URL أو DATABASE_URL —
 *      الخيار المفعَّل تلقائياً على Vercel عبر تكامل Neon.
 *   ٢) قاعدة libSQL بعيدة (Turso) إن ضُبط TURSO_DATABASE_URL — بديل بلا قرص دائم أيضاً.
 *   ٣) node:sqlite المدمج في Node 22.5 فأحدث، أو حزمة better-sqlite3، على استضافات
 *      ذات قرص دائم (Fly.io، Render، VPS، أو التطوير المحلي).
 * الواجهة العليا (db.prepare(sql).get/all/run) واحدة وغير متزامنة (async) للمحركات الثلاثة.
 */
let engineKind; // 'pg' | 'libsql' | 'sqlite'
let pgPool = null;
let rawDb = null; // مقبض متزامن (sqlite الخام، أو غلاف libsql)

/** غلاف libsql يضيف الحقل _metadata إلى كل صف؛ يُنزع كي لا يظهر في ردود الواجهة. */
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

function openEngine() {
  if (POSTGRES_URL) {
    // قواعد Neon (تكامل Vercel الافتراضي) لا تعمل بثبات مع pg عبر TCP الخام من
    // دوال Vercel بلا خادم (يفشل مصافحة TLS بخطأ ECONNRESET بشكل متكرر)، لذا
    // تُستخدم لها سائقة Neon الرسمية عبر WebSocket، وتبقى pg للـPostgres العادية.
    const isNeon = /neon\.tech/i.test(POSTGRES_URL);
    let Pool, types, neonConfig;
    if (isNeon) {
      ({ Pool, types, neonConfig } = require('@neondatabase/serverless'));
      neonConfig.webSocketConstructor = require('ws');
    } else {
      ({ Pool, types } = require('pg'));
    }
    // pg/سائقة Neon تُعيد BIGINT/NUMERIC كنصوص افتراضياً (تفادياً لفقدان الدقة)، لكن
    // SUM/COUNT في هذه المنصة قيمها صغيرة دائماً (نقاط، عدّادات) وتُستخدم كأرقام JS
    // في كل مكان (طرح رصيد الطالب مثلاً)؛ فتُحوَّل هنا لتطابق سلوك SQLite/better-sqlite3.
    types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // int8/bigint
    types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric/decimal
    pgPool = new Pool({
      connectionString: POSTGRES_URL,
      ssl: /sslmode=disable/.test(POSTGRES_URL) ? false : { rejectUnauthorized: false },
      max: 5
    });
    pgPool.on('error', (err) => console.error('خطأ غير متوقع في اتصال Postgres:', err));
    engineKind = 'pg';
    return;
  }
  if (REMOTE_URL) {
    let LibsqlDatabase;
    try {
      LibsqlDatabase = require('libsql');
    } catch {
      throw new Error('ضُبط TURSO_DATABASE_URL لكن حزمة libsql غير مثبّتة: npm install libsql');
    }
    rawDb = wrapLibsql(new LibsqlDatabase(REMOTE_URL, { authToken: REMOTE_TOKEN }));
    engineKind = 'libsql';
    return;
  }
  try {
    const { DatabaseSync } = require('node:sqlite');
    if (DatabaseSync) {
      rawDb = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
      engineKind = 'sqlite';
      return;
    }
  } catch { /* إصدار Node لا يوفّر node:sqlite */ }
  try {
    const BetterSqlite3 = require('better-sqlite3');
    rawDb = new BetterSqlite3(path.join(DATA_DIR, 'app.db'));
    engineKind = 'sqlite';
    return;
  } catch {
    throw new Error(
      'تعذّر تشغيل قاعدة البيانات: تحتاج Node.js 22.5 أو أحدث، '
      + 'أو ثبّت الحزمة البديلة بالأمر: npm install better-sqlite3'
    );
  }
}

openEngine();

const REMOTE_DB = engineKind === 'pg' || engineKind === 'libsql';
/** الصور المرفوعة تُخزَّن في قاعدة البيانات متى كان القرص مؤقتاً أو القاعدة بعيدة. */
const UPLOADS_IN_DB = REMOTE_DB || !dataDir.writable;

// ---------------------------------------------------------------------------
// طبقة الاستعلام الخام: واحدة لكل محرّك، تُستخدم داخلياً وأثناء تجهيز المخطط.
// ---------------------------------------------------------------------------

/** يحوّل عناصر الاستبدال بنمط SQLite (?) إلى نمط Postgres ($1, $2, ...). */
function toPgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/**
 * يقسّم نص SQL متعدد الجمل (بفاصلة منقوطة) إلى جمل مفردة، مع معاملة كتلة
 * `DO $do$ ... $do$;` ككتلة واحدة غير قابلة للتقسيم (علامة الدولار تُستخدم فيها
 * كمحدّد نص وليس فاصلاً). ضروري لأن سائقة Neon عبر WebSocket (على عكس pg عبر
 * TCP الخام) لا تُنفّذ استعلاماً واحداً يحوي عدّة جمل بثبات، فتُرسَل كل جملة
 * على حدة.
 */
function splitPgStatements(sql) {
  const statements = [];
  let depth = 0; // مستوى التعشيش داخل $tag$...$tag$
  let tag = null;
  let current = '';
  let i = 0;
  while (i < sql.length) {
    const dollarMatch = depth === 0 ? /^\$([a-zA-Z_]*)\$/.exec(sql.slice(i)) : null;
    if (depth === 0 && dollarMatch) {
      tag = dollarMatch[0];
      depth = 1;
      current += tag;
      i += tag.length;
      continue;
    }
    if (depth === 1 && sql.startsWith(tag, i)) {
      current += tag;
      i += tag.length;
      depth = 0;
      tag = null;
      continue;
    }
    const ch = sql[i];
    if (depth === 0 && ch === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

async function rawExec(sql) {
  if (engineKind === 'pg') {
    for (const statement of splitPgStatements(sql)) {
      await pgPool.query(statement);
    }
    return;
  }
  rawDb.exec(sql);
}

/** أوامر PRAGMA غير مدعومة على القواعد البعيدة أو Postgres، فتُتجاوز بهدوء. */
function tryExecSync(sql) {
  try { rawDb.exec(sql); } catch { /* غير مدعوم على هذا المحرّك */ }
}

async function rawRun(sql, params) {
  const hasReturning = /\breturning\b/i.test(sql);
  if (engineKind === 'pg') {
    const result = await pgPool.query(toPgSql(sql), params);
    if (hasReturning) {
      const row = result.rows[0];
      return { lastInsertRowid: row ? row.id : undefined, changes: result.rows.length };
    }
    return { changes: result.rowCount, lastInsertRowid: undefined };
  }
  const stmt = rawDb.prepare(sql);
  if (hasReturning) {
    // better-sqlite3 وnode:sqlite يرفضان .run() على جملة تُعيد صفوفاً؛ نستخدم .get() بدلاً منها.
    const row = stmt.get(...params);
    return { lastInsertRowid: row ? row.id : undefined, changes: row ? 1 : 0 };
  }
  return stmt.run(...params);
}

async function rawGet(sql, params) {
  if (engineKind === 'pg') {
    const result = await pgPool.query(toPgSql(sql), params);
    return result.rows[0];
  }
  return rawDb.prepare(sql).get(...params);
}

async function rawAll(sql, params) {
  if (engineKind === 'pg') {
    const result = await pgPool.query(toPgSql(sql), params);
    return result.rows;
  }
  return rawDb.prepare(sql).all(...params);
}

// ---------------------------------------------------------------------------
// المخطط (Schema)
// ---------------------------------------------------------------------------

const SQLITE_USERS_TABLE = `
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
  created_at       TEXT NOT NULL,
  mosque_id        INTEGER REFERENCES mosques(id)
);`;

/**
 * ترقية قواعد البيانات القديمة: كان الدخول باسم مستخدم وكلمة مرور،
 * وأصبح برقم الجوال ورمز مؤقت. تُنقل الحسابات القائمة كما هي. (SQLite/libSQL فقط)
 */
function migrateUsersToPhoneLoginSqlite() {
  const table = rawDb.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (!table || !/username/.test(table.sql)) return;
  tryExecSync('PRAGMA foreign_keys = OFF');
  tryExecSync('PRAGMA legacy_alter_table = ON');
  rawDb.exec('ALTER TABLE users RENAME TO users_legacy');
  rawDb.exec(SQLITE_USERS_TABLE);
  rawDb.exec(`
    INSERT INTO users (id, phone, code_hash, must_change_code, role, name, halaqa_id, photo, barcode, active, created_at)
    SELECT id,
           CASE WHEN username GLOB '0[0-9]*' THEN username ELSE NULL END,
           password_hash, 1, role, name, halaqa_id, photo, barcode, active, created_at
      FROM users_legacy
  `);
  rawDb.exec('DROP TABLE users_legacy');
  tryExecSync('PRAGMA legacy_alter_table = OFF');
  tryExecSync('PRAGMA foreign_keys = ON');
  console.log('تمت ترقية الحسابات إلى الدخول برقم الجوال.');
}

const SQLITE_SCHEMA = `
-- المساجد (الجوامع): لكل مسجد واجهته وحلقاته وطلابه ومتجره وإعداداته الخاصة
CREATE TABLE IF NOT EXISTS mosques (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mosque_settings (
  mosque_id INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  key       TEXT NOT NULL,
  value     TEXT,
  PRIMARY KEY (mosque_id, key)
);

CREATE TABLE IF NOT EXISTS halaqat (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  teacher_name  TEXT,
  supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  mosque_id     INTEGER REFERENCES mosques(id)
);

${SQLITE_USERS_TABLE}

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
  printed_at   TEXT,
  mosque_id    INTEGER REFERENCES mosques(id)
);

-- دفاتر الشيكات الفارغة: تُطبع بكميات كبيرة بنوع وقيمة محددة، ويكتب المعلم
-- اسم الطالب ويوقّع عليها، ثم يُصرف الشيك بمسح باركوده مع بطاقة الطالب.
CREATE TABLE IF NOT EXISTS cheque_vouchers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  batch       TEXT NOT NULL,
  type        TEXT NOT NULL,
  item_key    TEXT NOT NULL,
  item_label  TEXT NOT NULL,
  points      INTEGER NOT NULL,
  note        TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  printed_at  TEXT,
  student_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  redeemed_at TEXT,
  redeemed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  mosque_id   INTEGER REFERENCES mosques(id)
);
CREATE INDEX IF NOT EXISTS idx_vouchers_batch ON cheque_vouchers(batch);
CREATE INDEX IF NOT EXISTS idx_vouchers_student ON cheque_vouchers(student_id);

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
  created_at TEXT NOT NULL,
  mosque_id  INTEGER REFERENCES mosques(id)
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
  purchasable INTEGER NOT NULL DEFAULT 1,
  deleted_at  TEXT,
  created_at  TEXT NOT NULL,
  mosque_id   INTEGER REFERENCES mosques(id)
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
`;

/**
 * مخطط Postgres. الفرق عن SQLite: SERIAL بدل AUTOINCREMENT، BYTEA بدل BLOB،
 * وربط دائري بين halaqat وusers (كل منهما يشير إلى الأخرى) يُضاف بعد إنشاء
 * الجدولين عبر ALTER TABLE، لأن Postgres يتطلب وجود الجدول المُشار إليه مسبقاً.
 */
const PG_SCHEMA = `
CREATE TABLE IF NOT EXISTS mosques (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mosque_settings (
  mosque_id INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  key       TEXT NOT NULL,
  value     TEXT,
  PRIMARY KEY (mosque_id, key)
);

CREATE TABLE IF NOT EXISTS users (
  id               SERIAL PRIMARY KEY,
  phone            TEXT UNIQUE,
  code_hash        TEXT NOT NULL,
  must_change_code INTEGER NOT NULL DEFAULT 1,
  role             TEXT NOT NULL CHECK (role IN ('admin','supervisor','student')),
  name             TEXT NOT NULL,
  halaqa_id        INTEGER,
  photo            TEXT,
  barcode          TEXT UNIQUE,
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL,
  mosque_id        INTEGER REFERENCES mosques(id)
);

CREATE TABLE IF NOT EXISTS halaqat (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  teacher_name  TEXT,
  supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  mosque_id     INTEGER REFERENCES mosques(id)
);

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_halaqa_id_fkey') THEN
    ALTER TABLE users ADD CONSTRAINT users_halaqa_id_fkey
      FOREIGN KEY (halaqa_id) REFERENCES halaqat(id) ON DELETE SET NULL;
  END IF;
END
$do$;

CREATE TABLE IF NOT EXISTS cheques (
  id           SERIAL PRIMARY KEY,
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
  printed_at   TEXT,
  mosque_id    INTEGER REFERENCES mosques(id)
);

CREATE TABLE IF NOT EXISTS cheque_vouchers (
  id          SERIAL PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  batch       TEXT NOT NULL,
  type        TEXT NOT NULL,
  item_key    TEXT NOT NULL,
  item_label  TEXT NOT NULL,
  points      INTEGER NOT NULL,
  note        TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  printed_at  TEXT,
  student_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  redeemed_at TEXT,
  redeemed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  mosque_id   INTEGER REFERENCES mosques(id)
);
CREATE INDEX IF NOT EXISTS idx_vouchers_batch ON cheque_vouchers(batch);
CREATE INDEX IF NOT EXISTS idx_vouchers_student ON cheque_vouchers(student_id);

CREATE TABLE IF NOT EXISTS point_entries (
  id         SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  halaqa_id  INTEGER REFERENCES halaqat(id) ON DELETE SET NULL,
  category   TEXT NOT NULL,
  subtype    TEXT,
  points     INTEGER NOT NULL,
  note       TEXT,
  cheque_id  INTEGER REFERENCES cheques(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  mosque_id  INTEGER REFERENCES mosques(id)
);
CREATE INDEX IF NOT EXISTS idx_entries_student ON point_entries(student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_entries_halaqa  ON point_entries(halaqa_id, created_at);

CREATE TABLE IF NOT EXISTS rewards (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  price       INTEGER NOT NULL,
  image       TEXT,
  stock       INTEGER NOT NULL DEFAULT -1,
  active      INTEGER NOT NULL DEFAULT 1,
  purchasable INTEGER NOT NULL DEFAULT 1,
  deleted_at  TEXT,
  created_at  TEXT NOT NULL,
  mosque_id   INTEGER REFERENCES mosques(id)
);

CREATE TABLE IF NOT EXISTS redemptions (
  id         SERIAL PRIMARY KEY,
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
  data       BYTEA NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (name, chunk)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

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
  // المتجر: 1 الشراء مفتوح لكل الجوائز، 0 مقفل (تبقى الجوائز ظاهرة للطلاب)
  store_open: '1',
  // فترة شاشة العرض: week · month · since (من تاريخ screen_from) · all (كل الأيام السابقة)
  screen_period: 'week',
  screen_from: '',
  default_code: '1234'
};

async function seedDefaultSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    // بناء متوافق مع Postgres وSQLite الحديث على حد سواء.
    await rawRun('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING', [key, value]);
  }
}

// ---------------------------------------------------------------------------
// تعدد المساجد
// ---------------------------------------------------------------------------

/**
 * المساجد الافتراضية. الأول هو المسجد الذي كانت المنصة تعمل له قبل تعدد المساجد،
 * فتُنقل إليه كل البيانات القائمة (الحلقات والطلاب والنقاط والشيكات والمتجر).
 */
const DEFAULT_MOSQUES = ['جامع عبدالله بن عمر', 'جامع ماجد بن مترك', 'جامع تركي الضحيان'];

/** الجداول التي تحمل عمود mosque_id */
const MOSQUE_TABLES = ['halaqat', 'users', 'cheques', 'cheque_vouchers', 'point_entries', 'rewards'];

/**
 * إعدادات خاصة بكل مسجد. بقية الإعدادات (اسم المجمع، الشعار، الرمز المؤقت)
 * مشتركة على مستوى المنصة.
 */
const MOSQUE_SETTING_KEYS = [
  'currency', 'scan_points', 'scan_cooldown_seconds', 'week_start_day',
  'cheque_attendance_early', 'cheque_attendance_general', 'cheque_recitation_hifz',
  'cheque_recitation_review', 'cheque_recitation_both', 'cheque_discipline',
  'screen_rotate_seconds', 'allow_student_photo_upload', 'public_screen',
  'store_open', 'screen_period', 'screen_from'
];

async function columnExists(table, column) {
  if (engineKind === 'pg') {
    return !!(await rawGet(
      'SELECT 1 FROM information_schema.columns WHERE table_name = ? AND column_name = ?', [table, column]));
  }
  return (await rawAll(`PRAGMA table_info(${table})`, [])).some((col) => col.name === column);
}

/**
 * ترقية تعدد المساجد (مرة واحدة): يضيف عمود mosque_id للقواعد القديمة، وينشئ
 * المساجد الثلاثة، وينسب كل البيانات السابقة إلى المسجد الأول مع نسخ قيم
 * إعداداته الحالية إليه حتى لا تتأثر بأي تعديل لاحق. حساب المدير يبقى بلا مسجد
 * لأنه مدير المنصة كلها.
 */
async function migrateMosques() {
  for (const table of MOSQUE_TABLES) {
    if (!(await columnExists(table, 'mosque_id'))) {
      await rawExec(`ALTER TABLE ${table} ADD COLUMN mosque_id INTEGER REFERENCES mosques(id)`);
    }
  }
  for (const table of MOSQUE_TABLES) {
    await rawExec(`CREATE INDEX IF NOT EXISTS idx_${table}_mosque ON ${table}(mosque_id)`);
  }

  const done = await rawGet("SELECT value FROM settings WHERE key = 'mosques_migrated'", []);
  if (done) return;

  let first = await rawGet('SELECT id FROM mosques ORDER BY id LIMIT 1', []);
  if (!first) {
    // معرّفات ثابتة مع ON CONFLICT: إن تزامن تشغيلان باردان (Vercel) لا تتكرر المساجد
    const at = new Date().toISOString();
    for (const [index, name] of DEFAULT_MOSQUES.entries()) {
      await rawRun('INSERT INTO mosques (id, name, active, sort_order, created_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT (id) DO NOTHING',
        [index + 1, name, index + 1, at]);
    }
    if (engineKind === 'pg') {
      await rawExec("SELECT setval(pg_get_serial_sequence('mosques', 'id'), (SELECT MAX(id) FROM mosques))");
    }
    first = await rawGet('SELECT id FROM mosques ORDER BY id LIMIT 1', []);
  }
  const firstId = first.id;

  for (const table of MOSQUE_TABLES) {
    const extra = table === 'users' ? " AND role <> 'admin'" : '';
    await rawRun(`UPDATE ${table} SET mosque_id = ? WHERE mosque_id IS NULL${extra}`, [firstId]);
  }
  for (const key of MOSQUE_SETTING_KEYS) {
    const row = await rawGet('SELECT value FROM settings WHERE key = ?', [key]);
    if (row) {
      await rawRun('INSERT INTO mosque_settings (mosque_id, key, value) VALUES (?, ?, ?) ON CONFLICT (mosque_id, key) DO NOTHING',
        [firstId, key, row.value]);
    }
  }
  await rawRun("INSERT INTO settings (key, value) VALUES ('mosques_migrated', '1') ON CONFLICT (key) DO NOTHING", []);
}

/**
 * أعمدة المتجر الأحدث للقواعد القديمة: purchasable يقفل شراء الجائزة مع بقائها
 * ظاهرة، وdeleted_at يحذف الجائزة من المتجر مع بقاء طلبات الطلاب السابقة عليها.
 */
async function migrateRewards() {
  if (!(await columnExists('rewards', 'purchasable'))) {
    await rawExec('ALTER TABLE rewards ADD COLUMN purchasable INTEGER NOT NULL DEFAULT 1');
  }
  if (!(await columnExists('rewards', 'deleted_at'))) {
    await rawExec('ALTER TABLE rewards ADD COLUMN deleted_at TEXT');
  }
}

async function initSchema() {
  if (engineKind === 'pg') {
    await rawExec(PG_SCHEMA);
  } else {
    tryExecSync('PRAGMA journal_mode = WAL');
    tryExecSync('PRAGMA foreign_keys = ON');
    migrateUsersToPhoneLoginSqlite();
    rawDb.exec(SQLITE_SCHEMA);
  }
  await seedDefaultSettings();
  await migrateMosques();
  await migrateRewards();
}

/**
 * يُحل بعد اكتمال تجهيز المخطط والإعدادات الافتراضية؛ كل استعلام عام ينتظره أولاً.
 * إن فشل التجهيز (كأن تكون قاعدة Neon نائمة فينقطع أول اتصال وهي تستيقظ) يُنسى الوعد
 * الفاشل ويُعاد المحاولة مع الطلب التالي، بدل أن يبقى الخطأ محفوظاً في الدالة الدافئة
 * فتفشل كل الطلبات بعده إلى أن يُعاد النشر.
 */
let schemaPromise = null;
function schemaReady() {
  if (!schemaPromise) {
    schemaPromise = withRetry(initSchema).catch((err) => {
      console.error('تعذّر تجهيز مخطط قاعدة البيانات:', err);
      schemaPromise = null;
      throw err;
    });
  }
  return schemaPromise;
}
schemaReady().catch(() => {});

/** أخطاء الاتصال العابرة (استيقاظ القاعدة من الخمول) تُعاد محاولتها بدل أن تُرجع 500. */
function isTransient(err) {
  const msg = String((err && (err.message || err[Symbol.for('kMessage')])) || err || '');
  const code = err && (err.code || (err.error && err.error.code));
  return /socket hang up|ECONNRESET|ETIMEDOUT|ECONNREFUSED|Connection terminated|closed|WebSocket/i.test(msg)
    || ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', '57P01', '08006', '08001'].includes(code)
    || (err && err.type === 'error' && err.target); // ErrorEvent من ws
}

async function withRetry(fn, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      if (!isTransient(err) || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  if (lastErr && !(lastErr instanceof Error)) {
    const e = new Error((lastErr.message) || 'database connection failed');
    e.cause = lastErr;
    throw e;
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// الواجهة العامة: async في كل المحركات، بنفس شكل الاستخدام السابق (prepare/run/get/all).
// ---------------------------------------------------------------------------

const db = {
  prepare(sql) {
    return {
      async run(...params) { await schemaReady(); return withRetry(() => rawRun(sql, params)); },
      async get(...params) { await schemaReady(); return withRetry(() => rawGet(sql, params)); },
      async all(...params) { await schemaReady(); return withRetry(() => rawAll(sql, params)); }
    };
  },
  async exec(sql) { await schemaReady(); return withRetry(() => rawExec(sql)); }
};

/**
 * الإعدادات الفعّالة: الافتراضية ← إعدادات المنصة ← إعدادات المسجد (إن مُرِّر mosqueId).
 * إعدادات المسجد (قيم الشيكات والمسح…) لا تُورث من جدول المنصة، فيبدأ المسجد
 * الجديد بالقيم الافتراضية لا بقيم مسجد آخر.
 */
async function getSettings(mosqueId = null) {
  const rows = await db.prepare('SELECT key, value FROM settings').all();
  const out = { ...DEFAULT_SETTINGS };
  const perMosque = new Set(MOSQUE_SETTING_KEYS);
  for (const row of rows) {
    if (mosqueId && perMosque.has(row.key)) continue;
    out[row.key] = row.value;
  }
  if (mosqueId) {
    const own = await db.prepare('SELECT key, value FROM mosque_settings WHERE mosque_id = ?').all(mosqueId);
    for (const row of own) out[row.key] = row.value;
  }
  return out;
}

async function getSetting(key, mosqueId = null) {
  return (await getSettings(mosqueId))[key];
}

async function setSetting(key, value) {
  await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

async function setMosqueSetting(mosqueId, key, value) {
  await db.prepare(`INSERT INTO mosque_settings (mosque_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(mosque_id, key) DO UPDATE SET value = excluded.value`).run(mosqueId, key, String(value));
}

module.exports = {
  db, get ready() { return schemaReady(); }, DATA_DIR, UPLOAD_DIR, REMOTE_DB, UPLOADS_IN_DB,
  getSettings, getSetting, setSetting, setMosqueSetting, DEFAULT_SETTINGS, MOSQUE_SETTING_KEYS, DEFAULT_MOSQUES
};
