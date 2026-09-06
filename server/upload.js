'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const { UPLOAD_DIR } = require('./db');

const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ALLOWED.has(ext) ? ext : '.jpg'}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) return cb(new Error('يُسمح برفع الصور فقط'));
    cb(null, true);
  }
});

/** Public URL for a stored upload, served by the /uploads static mount. */
const uploadUrl = (filename) => (filename ? `/uploads/${filename}` : null);

module.exports = { upload, uploadUrl };
