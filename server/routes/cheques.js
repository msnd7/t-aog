'use strict';
const express = require('express');
const { db, getSettings } = require('../db');
const { requireStaff } = require('../auth');
const { nowIso, chequeSerial, tafqit, toInt, asyncHandler, voucherCode, batchId } = require('../util');
const { chequeCatalog } = require('../catalog');
const { addEntry } = require('./points');
const { studentWallet } = require('../stats');

const router = express.Router();

router.get('/catalog', asyncHandler(async (req, res) => {
  res.json({ catalog: await chequeCatalog(), currency: (await getSettings()).currency });
}));

/** currency تُمرَّر جاهزة (تُجلب مرة واحدة لكل طلب) بدل استعلام الإعدادات لكل شيك. */
function hydrate(cheque, currency) {
  return {
    ...cheque,
    items: JSON.parse(cheque.items),
    amount_words: tafqit(cheque.total, currency),
    currency
  };
}

const CHEQUE_QUERY = `
  SELECT c.*, u.name AS student_name, u.photo AS student_photo, u.barcode AS student_barcode,
         h.name AS halaqa_name, a.name AS issued_by_name
    FROM cheques c
    JOIN users u ON u.id = c.student_id
    LEFT JOIN halaqat h ON h.id = c.halaqa_id
    LEFT JOIN users a ON a.id = c.issued_by
`;

router.get('/', requireStaff, asyncHandler(async (req, res) => {
  const params = [];
  let where = 'WHERE 1 = 1';
  if (req.query.type) { where += ' AND c.type = ?'; params.push(String(req.query.type)); }
  if (req.query.student_id) { where += ' AND c.student_id = ?'; params.push(toInt(req.query.student_id)); }
  if (req.query.halaqa_id) { where += ' AND c.halaqa_id = ?'; params.push(toInt(req.query.halaqa_id)); }
  if (req.query.unprinted === '1') where += ' AND c.printed_at IS NULL';
  params.push(Math.min(toInt(req.query.limit, 60), 300));
  const [rows, currency] = await Promise.all([
    db.prepare(`${CHEQUE_QUERY} ${where} ORDER BY c.id DESC LIMIT ?`).all(...params),
    getSettings().then((s) => s.currency)
  ]);
  res.json({ cheques: rows.map((c) => hydrate(c, currency)) });
}));

/** Cheques requested for printing, e.g. /api/cheques/print?ids=4,5,6 */
router.get('/print', requireStaff, asyncHandler(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map((v) => toInt(v)).filter(Boolean);
  if (!ids.length) return res.json({ cheques: [] });
  const placeholders = ids.map(() => '?').join(',');
  const settings = await getSettings();
  const rows = await db.prepare(`${CHEQUE_QUERY} WHERE c.id IN (${placeholders}) ORDER BY c.id`).all(...ids);
  res.json({ cheques: rows.map((c) => hydrate(c, settings.currency)), settings });
}));

/**
 * Issue one cheque per selected student. The chosen line items decide the
 * amount, and the same amount is credited to the student's points balance.
 */
router.post('/', requireStaff, asyncHandler(async (req, res) => {
  const catalog = await chequeCatalog();
  const book = catalog[req.body.type];
  if (!book) return res.status(400).json({ error: 'نوع الشيك غير معروف' });

  const wanted = Array.isArray(req.body.items) ? req.body.items.map(String) : [];
  const items = book.items.filter((item) => wanted.includes(item.key));
  if (!items.length) return res.status(400).json({ error: 'اختر بنداً واحداً على الأقل' });

  const studentIds = (Array.isArray(req.body.student_ids) ? req.body.student_ids : [req.body.student_id])
    .map((v) => toInt(v)).filter(Boolean);
  if (!studentIds.length) return res.status(400).json({ error: 'اختر طالباً واحداً على الأقل' });

  const total = items.reduce((sum, item) => sum + item.points, 0);
  const teacherName = String(req.body.teacher_name || '').trim() || null;
  const note = String(req.body.note || '').trim() || null;
  const issuedAt = nowIso();
  const created = [];

  for (const studentId of studentIds) {
    const student = await db.prepare("SELECT * FROM users WHERE id = ? AND role = 'student' AND active = 1").get(studentId);
    if (!student) continue;
    const halaqa = student.halaqa_id
      ? await db.prepare('SELECT * FROM halaqat WHERE id = ?').get(student.halaqa_id) : null;
    const info = await db.prepare(`
      INSERT INTO cheques (serial, student_id, halaqa_id, type, items, total, teacher_name, note, issued_by, issued_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `).run('pending', studentId, student.halaqa_id, book.key, JSON.stringify(items), total,
      teacherName || halaqa?.teacher_name || null, note, req.user.id, issuedAt);
    const id = Number(info.lastInsertRowid);
    const serial = chequeSerial(id, new Date(issuedAt));
    await db.prepare('UPDATE cheques SET serial = ? WHERE id = ?').run(serial, id);

    for (const item of items) {
      await addEntry({
        studentId, category: book.key, subtype: item.key, points: item.points,
        note: item.label, chequeId: id, userId: req.user.id
      });
    }
    created.push(id);
  }

  if (!created.length) return res.status(400).json({ error: 'لم يتم إصدار أي شيك' });
  const placeholders = created.map(() => '?').join(',');
  const currency = (await getSettings()).currency;
  const rows = await db.prepare(`${CHEQUE_QUERY} WHERE c.id IN (${placeholders}) ORDER BY c.id`).all(...created);
  res.status(201).json({ ids: created, cheques: rows.map((c) => hydrate(c, currency)), total });
}));

router.post('/printed', requireStaff, asyncHandler(async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map((v) => toInt(v)).filter(Boolean);
  if (!ids.length) return res.status(400).json({ error: 'لا توجد شيكات' });
  const at = nowIso();
  for (const id of ids) {
    await db.prepare('UPDATE cheques SET printed_at = ? WHERE id = ?').run(at, id);
  }
  res.json({ ok: true, count: ids.length });
}));

// ---------------------------------------------------------------------------
// الشيكات الفارغة (دفاتر الطباعة)
// المشرف يختار نوع الشيك وقيمته وعدد النسخ، فتُنشأ شيكات فارغة يحمل كلٌّ منها
// باركوداً فريداً وقيمته بالنقاط. يكتب المعلم اسم الطالب ويوقّع، ثم يُصرف الشيك
// من شاشة المسح: باركود الشيك ثم بطاقة الطالب.
// ---------------------------------------------------------------------------

const MAX_BATCH = 500;

const VOUCHER_QUERY = `
  SELECT v.*, u.name AS student_name, h.name AS halaqa_name, a.name AS created_by_name
    FROM cheque_vouchers v
    LEFT JOIN users u ON u.id = v.student_id
    LEFT JOIN halaqat h ON h.id = u.halaqa_id
    LEFT JOIN users a ON a.id = v.created_by
`;

/** أنواع الشيكات وبنودها في صيغة مسطّحة تسهّل عرضها في قائمة منسدلة */
router.get('/vouchers/options', requireStaff, asyncHandler(async (req, res) => {
  const catalog = await chequeCatalog();
  const settings = await getSettings();
  const options = [];
  for (const book of Object.values(catalog)) {
    for (const item of book.items) {
      options.push({
        value: `${book.key}:${item.key}`,
        type: book.key,
        item: item.key,
        book_title: book.title,
        label: item.label,
        title: `${book.title} — ${item.label}`,
        color: book.color,
        points: item.points
      });
    }
  }
  res.json({ options, currency: settings.currency });
}));

/** ملخّص دفعات الطباعة: العدد، المطبوع، المصروف */
router.get('/vouchers/batches', requireStaff, asyncHandler(async (req, res) => {
  const rows = await db.prepare(`
    SELECT batch, type, item_key, item_label, points,
           COUNT(*) AS total,
           SUM(CASE WHEN redeemed_at IS NULL THEN 0 ELSE 1 END) AS redeemed,
           SUM(CASE WHEN printed_at IS NULL THEN 0 ELSE 1 END) AS printed,
           MIN(created_at) AS created_at
      FROM cheque_vouchers
     GROUP BY batch, type, item_key, item_label, points
     ORDER BY MIN(created_at) DESC, batch DESC
     LIMIT 30
  `).all();
  res.json({ batches: rows });
}));

/** الشيكات الفارغة المطلوبة للطباعة: دفعة كاملة أو معرّفات محددة */
router.get('/vouchers/print', requireStaff, asyncHandler(async (req, res) => {
  const settings = await getSettings();
  let rows = [];
  if (req.query.batch) {
    rows = await db.prepare('SELECT * FROM cheque_vouchers WHERE batch = ? ORDER BY id').all(String(req.query.batch));
  } else {
    const ids = String(req.query.ids || '').split(',').map((v) => toInt(v)).filter(Boolean);
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      rows = await db.prepare(`SELECT * FROM cheque_vouchers WHERE id IN (${placeholders}) ORDER BY id`).all(...ids);
    }
  }
  const catalog = await chequeCatalog();
  res.json({
    vouchers: rows.map((v) => ({
      ...v,
      book_title: catalog[v.type] ? catalog[v.type].title : 'شيك تحفيزي',
      color: catalog[v.type] ? catalog[v.type].color : '#123f52',
      amount_words: tafqit(v.points, settings.currency),
      currency: settings.currency
    })),
    settings
  });
}));

/** قائمة الشيكات الفارغة (للمتابعة والبحث) */
router.get('/vouchers', requireStaff, asyncHandler(async (req, res) => {
  const params = [];
  let where = 'WHERE 1 = 1';
  if (req.query.batch) { where += ' AND v.batch = ?'; params.push(String(req.query.batch)); }
  if (req.query.status === 'redeemed') where += ' AND v.redeemed_at IS NOT NULL';
  if (req.query.status === 'open') where += ' AND v.redeemed_at IS NULL';
  params.push(Math.min(toInt(req.query.limit, 60), 300));
  const rows = await db.prepare(`${VOUCHER_QUERY} ${where} ORDER BY v.id DESC LIMIT ?`).all(...params);
  res.json({ vouchers: rows });
}));

/** إنشاء دفعة شيكات فارغة جاهزة للطباعة */
router.post('/vouchers', requireStaff, asyncHandler(async (req, res) => {
  const catalog = await chequeCatalog();
  const book = catalog[req.body.type];
  if (!book) return res.status(400).json({ error: 'نوع الشيك غير معروف' });
  const item = book.items.find((one) => one.key === String(req.body.item || req.body.item_key));
  if (!item) return res.status(400).json({ error: 'بند الشيك غير معروف' });

  const count = toInt(req.body.count, 0);
  if (count < 1) return res.status(400).json({ error: 'أدخل عدد الشيكات المطلوب' });
  if (count > MAX_BATCH) return res.status(400).json({ error: `أقصى عدد في الدفعة الواحدة ${MAX_BATCH} شيك` });

  const note = String(req.body.note || '').trim() || null;
  const batch = batchId();
  const createdAt = nowIso();

  // ترقيم متسلسل مقروء يبدأ بعد آخر شيك فارغ، مع محاولة ثانية إذا تزامنت دفعتان.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const last = await db.prepare('SELECT MAX(id) AS last FROM cheque_vouchers').get();
    const start = toInt(last && last.last, 0) + 1 + (attempt * 1000);
    const values = [];
    const params = [];
    for (let i = 0; i < count; i += 1) {
      values.push('(?, ?, ?, ?, ?, ?, ?, ?, ?)');
      params.push(voucherCode(start + i), batch, book.key, item.key, item.label, item.points, note, req.user.id, createdAt);
    }
    try {
      await db.prepare(`
        INSERT INTO cheque_vouchers (code, batch, type, item_key, item_label, points, note, created_by, created_at)
        VALUES ${values.join(', ')}
      `).run(...params);
      const vouchers = await db.prepare('SELECT * FROM cheque_vouchers WHERE batch = ? ORDER BY id').all(batch);
      return res.status(201).json({
        ok: true, batch, count: vouchers.length, total: item.points * vouchers.length,
        item: { type: book.key, key: item.key, label: item.label, points: item.points, title: `${book.title} — ${item.label}` },
        vouchers
      });
    } catch (error) {
      if (attempt === 2) throw error; // تعارض في الترقيم بعد ثلاث محاولات
    }
  }
  return res.status(500).json({ error: 'تعذّر إنشاء دفعة الشيكات' });
}));

/** تعليم دفعة (أو شيكات محددة) كمطبوعة */
router.post('/vouchers/printed', requireStaff, asyncHandler(async (req, res) => {
  const at = nowIso();
  if (req.body.batch) {
    const result = await db.prepare('UPDATE cheque_vouchers SET printed_at = ? WHERE batch = ? AND printed_at IS NULL')
      .run(at, String(req.body.batch));
    return res.json({ ok: true, count: result.changes || 0 });
  }
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map((v) => toInt(v)).filter(Boolean);
  if (!ids.length) return res.status(400).json({ error: 'لا توجد شيكات' });
  for (const id of ids) {
    await db.prepare('UPDATE cheque_vouchers SET printed_at = ? WHERE id = ?').run(at, id);
  }
  res.json({ ok: true, count: ids.length });
}));

/** صرف شيك فارغ لطالب: باركود الشيك + باركود الطالب (أو معرّفه) */
router.post('/vouchers/redeem', requireStaff, asyncHandler(async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'لم يتم قراءة باركود الشيك' });
  const voucher = await db.prepare('SELECT * FROM cheque_vouchers WHERE upper(code) = ?').get(code);
  if (!voucher) return res.status(404).json({ error: `لا يوجد شيك بالباركود ${code}` });

  if (voucher.redeemed_at) {
    const owner = await db.prepare('SELECT name FROM users WHERE id = ?').get(voucher.student_id);
    return res.status(409).json({
      error: `الشيك ${voucher.code} مصروف مسبقاً${owner ? ` للطالب ${owner.name}` : ''}`,
      voucher, duplicate: true
    });
  }

  const studentCode = String(req.body.student_code || '').trim().toUpperCase();
  const student = studentCode
    ? await db.prepare(`
        SELECT u.*, h.name AS halaqa_name FROM users u LEFT JOIN halaqat h ON h.id = u.halaqa_id
         WHERE upper(u.barcode) = ? AND u.role = 'student' AND u.active = 1`).get(studentCode)
    : await db.prepare(`
        SELECT u.*, h.name AS halaqa_name FROM users u LEFT JOIN halaqat h ON h.id = u.halaqa_id
         WHERE u.id = ? AND u.role = 'student' AND u.active = 1`).get(toInt(req.body.student_id));
  if (!student) return res.status(404).json({ error: 'لم يُعثر على الطالب — امسح بطاقته أو اخترها من القائمة' });

  const at = nowIso();
  await addEntry({
    studentId: student.id, category: voucher.type, subtype: voucher.item_key,
    points: voucher.points, note: `شيك ${voucher.item_label} (${voucher.code})`, userId: req.user.id
  });
  await db.prepare('UPDATE cheque_vouchers SET student_id = ?, redeemed_at = ?, redeemed_by = ? WHERE id = ?')
    .run(student.id, at, req.user.id, voucher.id);

  res.status(201).json({
    ok: true,
    points: voucher.points,
    voucher: { ...voucher, student_id: student.id, redeemed_at: at },
    student: {
      id: student.id, name: student.name, photo: student.photo,
      barcode: student.barcode, halaqa_name: student.halaqa_name
    },
    wallet: await studentWallet(student.id)
  });
}));

/** حذف الشيكات الفارغة غير المصروفة من دفعة */
router.delete('/vouchers/batch/:batch', requireStaff, asyncHandler(async (req, res) => {
  const result = await db.prepare('DELETE FROM cheque_vouchers WHERE batch = ? AND redeemed_at IS NULL')
    .run(String(req.params.batch));
  res.json({ ok: true, count: result.changes || 0 });
}));

/** Cancelling a cheque also removes the points it granted. */
router.delete('/:id', requireStaff, asyncHandler(async (req, res) => {
  const id = toInt(req.params.id);
  const cheque = await db.prepare('SELECT * FROM cheques WHERE id = ?').get(id);
  if (!cheque) return res.status(404).json({ error: 'الشيك غير موجود' });
  await db.prepare('DELETE FROM point_entries WHERE cheque_id = ?').run(id);
  await db.prepare('DELETE FROM cheques WHERE id = ?').run(id);
  res.json({ ok: true });
}));

module.exports = router;
