'use strict';
const express = require('express');
const { getSettings } = require('../db');
const { toInt, asyncHandler } = require('../util');
const { knightOfWeek, halaqaOfWeek, studentLeaderboard, halaqaLeaderboard, currentRange } = require('../stats');

const router = express.Router();

/**
 * Everything the hall display needs in one payload:
 * فارس الأسبوع، حلقة الأسبوع، وشاشة الصدارة.
 */
router.get('/', asyncHandler(async (req, res) => {
  const mosqueId = req.mosqueId;
  const settings = await getSettings(mosqueId);
  if (settings.public_screen === '0' && !req.user) {
    return res.status(403).json({ error: 'شاشة العرض متاحة بعد تسجيل الدخول' });
  }
  const period = ['day', 'week', 'month', 'all'].includes(req.query.period) ? req.query.period : 'week';
  const { from, to, label } = await currentRange(period, mosqueId);
  const [knight, halaqaWeek, students, halaqat] = await Promise.all([
    knightOfWeek(mosqueId),
    halaqaOfWeek(mosqueId),
    studentLeaderboard({ from, to, limit: 20, mosqueId }),
    halaqaLeaderboard({ from, to, mosqueId })
  ]);
  res.json({
    mosque: { id: req.mosque.id, name: req.mosque.name },
    academy: {
      name: settings.academy_name,
      subtitle: settings.academy_subtitle,
      mosque: req.mosque.name,
      currency: settings.currency,
      logo: settings.logo || '/img/logo.jpg',
      rotate_seconds: toInt(settings.screen_rotate_seconds, 14)
    },
    period,
    period_label: label,
    range: { from, to },
    knight,
    halaqa_of_week: halaqaWeek,
    students,
    halaqat,
    updated_at: new Date().toISOString()
  });
}));

/** Leaderboard used inside the app (students or halaqat, any period). */
router.get('/leaderboard', asyncHandler(async (req, res) => {
  const period = ['day', 'week', 'month', 'all'].includes(req.query.period) ? req.query.period : 'week';
  const mosqueId = req.mosqueId;
  const { from, to, label } = await currentRange(period, mosqueId);
  const scope = req.query.scope === 'halaqat' ? 'halaqat' : 'students';
  const rows = scope === 'halaqat'
    ? await halaqaLeaderboard({ from, to, mosqueId })
    : await studentLeaderboard({ from, to, limit: Math.min(toInt(req.query.limit, 50), 200), mosqueId });
  res.json({ scope, period, period_label: label, rows });
}));

module.exports = router;
