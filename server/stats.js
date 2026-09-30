'use strict';
const { db, getSettings } = require('./db');
const { rangeFor, toInt } = require('./util');

/** Builds the `AND created_at ...` fragment shared by every aggregation below. */
function rangeClause(alias, from, to, params) {
  let sql = '';
  if (from) { sql += ` AND ${alias}.created_at >= ?`; params.push(from); }
  if (to) { sql += ` AND ${alias}.created_at < ?`; params.push(to); }
  return sql;
}

async function currentRange(period = 'week', mosqueId = null) {
  const settings = await getSettings(mosqueId);
  return rangeFor(period, toInt(settings.week_start_day, 0));
}

/**
 * ترتيب الطلاب. mosqueId يحصر الترتيب في مسجد واحد، وبدونه يشمل كل المساجد
 * (لوحة مدير المنصة).
 */
async function studentLeaderboard({ from = null, to = null, halaqaId = null, limit = null, mosqueId = null } = {}) {
  const params = [];
  let entryFilter = rangeClause('e', from, to, params);
  let where = "WHERE u.role = 'student' AND u.active = 1";
  if (mosqueId) { where += ' AND u.mosque_id = ?'; params.push(mosqueId); }
  if (halaqaId) { where += ' AND u.halaqa_id = ?'; params.push(halaqaId); }
  let sql = `
    SELECT u.id, u.name, u.photo, u.barcode, u.phone, u.halaqa_id, u.mosque_id,
           h.name AS halaqa_name, m.name AS mosque_name,
           COALESCE(SUM(CASE WHEN e.points > 0 THEN e.points ELSE 0 END), 0) AS points,
           COALESCE(SUM(e.points), 0) AS net_points
      FROM users u
      LEFT JOIN halaqat h ON h.id = u.halaqa_id
      LEFT JOIN mosques m ON m.id = u.mosque_id
      LEFT JOIN point_entries e ON e.student_id = u.id${entryFilter}
      ${where}
     GROUP BY u.id, h.name, m.name
     ORDER BY points DESC, u.name ASC`;
  if (limit) { sql += ' LIMIT ?'; params.push(limit); }
  const rows = await db.prepare(sql).all(...params);
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

async function halaqaLeaderboard({ from = null, to = null, mosqueId = null } = {}) {
  const params = [];
  const entryFilter = rangeClause('e', from, to, params);
  let where = 'WHERE h.active = 1';
  if (mosqueId) { where += ' AND h.mosque_id = ?'; params.push(mosqueId); }
  const rows = await db.prepare(`
    SELECT h.id, h.name, h.teacher_name, h.mosque_id,
           COALESCE(SUM(CASE WHEN e.points > 0 THEN e.points ELSE 0 END), 0) AS points,
           (SELECT COUNT(*) FROM users u WHERE u.halaqa_id = h.id AND u.role = 'student' AND u.active = 1)
             AS students_count
      FROM halaqat h
      LEFT JOIN point_entries e ON e.halaqa_id = h.id${entryFilter}
     ${where}
     GROUP BY h.id
     ORDER BY points DESC, h.name ASC
  `).all(...params);
  return rows.map((row, index) => {
    const avg = row.students_count ? Math.round(row.points / row.students_count) : 0;
    return { ...row, average: avg, rank: index + 1 };
  });
}

/** Earned / spent / spendable balance for one student (all time). */
async function studentWallet(studentId) {
  const row = await db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN points > 0 THEN points ELSE 0 END), 0) AS earned,
           COALESCE(SUM(CASE WHEN points < 0 THEN -points ELSE 0 END), 0) AS spent,
           COALESCE(SUM(points), 0) AS balance
      FROM point_entries WHERE student_id = ?
  `).get(studentId);
  return row || { earned: 0, spent: 0, balance: 0 };
}

async function studentPeriodPoints(studentId, period = 'week', mosqueId = null) {
  const { from, to } = await currentRange(period, mosqueId);
  const params = [studentId];
  const filter = rangeClause('e', from, to, params);
  const row = await db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN e.points > 0 THEN e.points ELSE 0 END), 0) AS points
      FROM point_entries e WHERE e.student_id = ?${filter}
  `).get(...params);
  return row ? row.points : 0;
}

async function studentRank(studentId, period = 'week', mosqueId = null) {
  const { from, to } = await currentRange(period, mosqueId);
  const board = await studentLeaderboard({ from, to, mosqueId });
  const index = board.findIndex((s) => s.id === studentId);
  return { rank: index === -1 ? null : index + 1, total: board.length };
}

/** فارس الأسبوع — the student with the most points inside the current week. */
async function knightOfWeek(mosqueId = null) {
  const { from, to, label } = await currentRange('week', mosqueId);
  const [top] = await studentLeaderboard({ from, to, limit: 1, mosqueId });
  if (!top || top.points <= 0) return null;
  return { ...top, period: label, from, to };
}

/** حلقة الأسبوع — the circle with the most points inside the current week. */
async function halaqaOfWeek(mosqueId = null) {
  const { from, to, label } = await currentRange('week', mosqueId);
  const [top] = await halaqaLeaderboard({ from, to, mosqueId });
  if (!top || top.points <= 0) return null;
  const members = await studentLeaderboard({ from, to, halaqaId: top.id, limit: 5, mosqueId });
  return { ...top, members, period: label, from, to };
}

module.exports = {
  currentRange, studentLeaderboard, halaqaLeaderboard, studentWallet,
  studentPeriodPoints, studentRank, knightOfWeek, halaqaOfWeek
};
