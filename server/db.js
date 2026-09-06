'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS halaqat (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  teacher_name  TEXT,
  supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','supervisor','student')),
  name          TEXT NOT NULL,
  halaqa_id     INTEGER REFERENCES halaqat(id) ON DELETE SET NULL,
  photo         TEXT,
  barcode       TEXT UNIQUE,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

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
  allow_student_photo_upload: '1'
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
