'use strict';
const express = require('express');
const { getSettings } = require('../db');
const { toInt } = require('../util');
const { knightOfWeek, halaqaOfWeek, studentLeaderboard, halaqaLeaderboard, currentRange } = require('../stats');

const router = express.Router();

/**
 * Everything the hall display needs in one payload:
 * فارس الأسبوع، حلقة الأسبوع، وشاشة الصدارة.
 */
router.get('/', (req, res) => {
  const settings = getSettings();
  if (settings.public_screen === '0' && !req.user) {
    return res.status(403).json({ error: 'شاشة العرض متاحة بعد تسجيل الدخول' });
  }
  const period = ['day', 'week', 'month', 'all'].includes(req.query.period) ? req.query.period : 'week';
  const { from, to, label } = currentRange(period);
  res.json({
    academy: {
      name: settings.academy_name,
      subtitle: settings.academy_subtitle,
      currency: settings.currency,
      logo: settings.logo || '/img/logo.jpg',
      rotate_seconds: toInt(settings.screen_rotate_seconds, 14)
    },
    period,
    period_label: label,
    range: { from, to },
    knight: knightOfWeek(),
    halaqa_of_week: halaqaOfWeek(),
    students: studentLeaderboard({ from, to, limit: 20 }),
    halaqat: halaqaLeaderboard({ from, to }),
    updated_at: new Date().toISOString()
  });
});

/** Leaderboard used inside the app (students or halaqat, any period). */
router.get('/leaderboard', (req, res) => {
  const period = ['day', 'week', 'month', 'all'].includes(req.query.period) ? req.query.period : 'week';
  const { from, to, label } = currentRange(period);
  const scope = req.query.scope === 'halaqat' ? 'halaqat' : 'students';
  const rows = scope === 'halaqat'
    ? halaqaLeaderboard({ from, to })
    : studentLeaderboard({ from, to, limit: Math.min(toInt(req.query.limit, 50), 200) });
  res.json({ scope, period, period_label: label, rows });
});

module.exports = router;
