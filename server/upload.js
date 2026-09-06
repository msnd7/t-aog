'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const { db, UPLOAD_DIR, UPLOADS_IN_DB } = require('./db');
const { nowIso } = require('./util');

const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MAX_BYTES = 6 * 1024 * 1024;
/** تُقسَّم الصورة إلى قطع صغيرة كي لا تتجاوز حدّ حجم الصف في القواعد البعيدة. */
const CHUNK_BYTES = 256 * 1024;

const newFilename = (originalname) => {
  const ext = path.extname(originalname || '').toLowerCase();
  return `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ALLOWED.has(ext) ? ext : '.jpg'}`;
};

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, newFilename(file.originalname))
});

const multerInstance = multer({
  storage: UPLOADS_IN_DB ? multer.memoryStorage() : diskStorage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error('يُسمح برفع الصور فقط'));
    cb(null, true);
  }
});

const insertChunk = db.prepare('INSERT INTO uploads (name, chunk, mime, data, created_at) VALUES (?, ?, ?, ?, ?)');

/** يحفظ الصورة في قاعدة البيانات ويمنحها اسماً كما لو حُفظت على القرص. */
function storeInDatabase(file) {
  const name = newFilename(file.originalname);
  const mime = file.mimetype || 'image/jpeg';
  const at = nowIso();
  const buffer = file.buffer;
  for (let index = 0, chunk = 0; index < buffer.length; index += CHUNK_BYTES, chunk += 1) {
    insertChunk.run(name, chunk, mime, buffer.subarray(index, index + CHUNK_BYTES), at);
  }
  return name;
}

/** يقرأ صورة محفوظة في قاعدة البيانات، أو null إن لم توجد. */
function readFromDatabase(name) {
  const rows = db.prepare('SELECT mime, data FROM uploads WHERE name = ? ORDER BY chunk').all(name);
  if (!rows.length) return null;
  return { mime: rows[0].mime, body: Buffer.concat(rows.map((row) => Buffer.from(row.data))) };
}

/** يُكمل ما بدأه multer: يخزّن الصورة في القاعدة ويضبط filename كما في حفظ القرص. */
function persistUpload(req, res, next) {
  if (!req.file || !UPLOADS_IN_DB) return next();
  try {
    req.file.filename = storeInDatabase(req.file);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * بديل multer.single يعيد سلسلة وسيطين، فتبقى المسارات مكتوبة كما هي.
 * (Express يقبل مصفوفة من الوسائط في مكان الوسيط الواحد.)
 */
const upload = { single: (field) => [multerInstance.single(field), persistUpload] };

/** Public URL for a stored upload, served by the /uploads mount. */
const uploadUrl = (filename) => (filename ? `/uploads/${filename}` : null);

module.exports = { upload, uploadUrl, readFromDatabase, UPLOADS_IN_DB };
