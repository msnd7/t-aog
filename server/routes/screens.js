'use strict';
const express = require('express');
const { getSettings, setMosqueSetting } = require('../db');
const { requireStaff } = require('../auth');
const { toInt, parseDay, asyncHandler } = require('../util');
const { knightOfWeek, halaqaOfWeek, studentLeaderboard, halaqaLeaderboard, currentRange } = require('../stats');

const router = express.Router();

/** فترات شاشة العرض: أسبوع، شهر، يوم، من تاريخ معيّن، أو كل الأيام السابقة */
const SCREEN_PERIODS = ['week', 'month', 'day', 'since', 'all'];

/** عناوين الجائزتين حسب الفترة المعروضة */
const AWARD_TITLES = {
  week: { knight: 'فارس الأسبوع', halaqa: 'حلقة الأسبوع' },
  month: { knight: 'فارس الشهر', halaqa: 'حلقة الشهر' },
  day: { knight: 'فارس اليوم', halaqa: 'حلقة اليوم' },
  since: { knight: 'فارس الفترة', halaqa: 'حلقة الفترة' },
  all: { knight: 'الفارس الأول', halaqa: 'الحلقة الأولى' }
};

/**
 * Everything the hall display needs in one payload:
 * فارس الأسبوع، حلقة الأسبوع، وشاشة الصدارة.
 * الفترة من الرابط (?period=&from=) إن وُجدت، وإلا من إعدادات شاشة المسجد.
 */
router.get('/', asyncHandler(async (req, res) => {
  const mosqueId = req.mosqueId;
  const settings = await getSettings(mosqueId);
  if (settings.public_screen === '0' && !req.user) {
    return res.status(403).json({ error: 'شاشة العرض متاحة بعد تسجيل الدخول' });
  }
  let period = SCREEN_PERIODS.includes(req.query.period) ? req.query.period : settings.screen_period;
  if (!SCREEN_PERIODS.includes(period)) period = 'week';
  const since = req.query.from || settings.screen_from || null;
  if (period === 'since' && !parseDay(since)) period = 'all';
  const range = await currentRange(period, mosqueId, since);
  const { from, to, label } = range;
  const [knight, halaqaWeek, students, halaqat] = await Promise.all([
    knightOfWeek(mosqueId, range),
    halaqaOfWeek(mosqueId, range),
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
    titles: AWARD_TITLES[period],
    range: { from, to },
    knight,
    halaqa_of_week: halaqaWeek,
    students,
    halaqat,
    updated_at: new Date().toISOString()
  });
}));

/** إعدادات شاشة العرض الحالية للمسجد */
router.get('/settings', requireStaff, asyncHandler(async (req, res) => {
  const settings = await getSettings(req.mosqueId);
  res.json({
    screen_period: SCREEN_PERIODS.includes(settings.screen_period) ? settings.screen_period : 'week',
    screen_from: settings.screen_from || '',
    screen_rotate_seconds: toInt(settings.screen_rotate_seconds, 14)
  });
}));

/** يضبط المشرف فترة شاشة العرض لمسجده: أسبوع، شهر، من تاريخ، أو كل الأيام */
router.patch('/settings', requireStaff, asyncHandler(async (req, res) => {
  const period = String(req.body.screen_period || '');
  if (!SCREEN_PERIODS.includes(period)) return res.status(400).json({ error: 'اختر فترة العرض' });
  const since = String(req.body.screen_from || '').trim();
  if (period === 'since') {
    const day = parseDay(since);
    if (!day) return res.status(400).json({ error: 'اختر تاريخ بداية العرض' });
    if (day > new Date()) return res.status(400).json({ error: 'تاريخ البداية لا يكون في المستقبل' });
  }
  await setMosqueSetting(req.mosqueId, 'screen_period', period);
  if (period === 'since') await setMosqueSetting(req.mosqueId, 'screen_from', since);
  if (req.body.screen_rotate_seconds !== undefined) {
    const seconds = Math.min(Math.max(toInt(req.body.screen_rotate_seconds, 14), 5), 300);
    await setMosqueSetting(req.mosqueId, 'screen_rotate_seconds', seconds);
  }
  const { label } = await currentRange(period, req.mosqueId, since);
  res.json({ ok: true, screen_period: period, screen_from: since, period_label: label });
}));

/** Leaderboard used inside the app (students or halaqat, any period). */
router.get('/leaderboard', asyncHandler(async (req, res) => {
  const period = SCREEN_PERIODS.includes(req.query.period) ? req.query.period : 'week';
  const mosqueId = req.mosqueId;
  const { from, to, label } = await currentRange(period, mosqueId, req.query.from);
  const scope = req.query.scope === 'halaqat' ? 'halaqat' : 'students';
  const rows = scope === 'halaqat'
    ? await halaqaLeaderboard({ from, to, mosqueId })
    : await studentLeaderboard({ from, to, limit: Math.min(toInt(req.query.limit, 50), 200), mosqueId });
  res.json({ scope, period, period_label: label, rows });
}));

module.exports = router;
