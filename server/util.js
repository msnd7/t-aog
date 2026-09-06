'use strict';
const crypto = require('node:crypto');

const nowIso = () => new Date().toISOString();

/** Start of the day (local time) for a given date, as an ISO string. */
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Boundaries of the week containing `date`.
 * `startDay` is 0 for Sunday (the default in Saudi schools) through 6 for Saturday.
 */
function weekBounds(date = new Date(), startDay = 0) {
  const start = startOfDay(date);
  const shift = (start.getDay() - Number(startDay) + 7) % 7;
  start.setDate(start.getDate() - shift);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

function monthBounds(date = new Date()) {
  const start = startOfDay(date);
  start.setDate(1);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

/**
 * Range filter used by the leaderboards and the weekly awards.
 * Returns ISO bounds (or nulls for the all-time range).
 */
function rangeFor(period, startDay = 0, ref = new Date()) {
  if (period === 'day') {
    const start = startOfDay(ref);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { from: start.toISOString(), to: end.toISOString(), label: 'اليوم' };
  }
  if (period === 'month') {
    const { start, end } = monthBounds(ref);
    return { from: start.toISOString(), to: end.toISOString(), label: 'هذا الشهر' };
  }
  if (period === 'all') return { from: null, to: null, label: 'منذ البداية' };
  const { start, end } = weekBounds(ref, startDay);
  return { from: start.toISOString(), to: end.toISOString(), label: 'هذا الأسبوع' };
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Short, human friendly, scanner friendly student code: RQ + 6 chars. */
function makeBarcode(seq) {
  const n = String(seq).padStart(5, '0');
  return `RQ${n}`;
}

function chequeSerial(id, issuedAt = new Date()) {
  const y = issuedAt.getFullYear();
  return `${y}-${String(id).padStart(5, '0')}`;
}

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
  'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر',
  'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة',
  'ثمانمائة', 'تسعمائة'];

function belowThousand(n) {
  const parts = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (rest) {
    if (rest < 20) parts.push(ONES[rest]);
    else {
      const unit = rest % 10;
      const ten = Math.floor(rest / 10);
      parts.push(unit ? `${ONES[unit]} و${TENS[ten]}` : TENS[ten]);
    }
  }
  return parts.join(' و');
}

/** Amount in Arabic words (تفقيط) for the printed cheques. */
function tafqit(amount, currency = 'ريال') {
  const n = Math.abs(Math.round(Number(amount) || 0));
  if (n === 0) return `صفر ${currency} فقط`;
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const parts = [];
  if (thousands === 1) parts.push('ألف');
  else if (thousands === 2) parts.push('ألفان');
  else if (thousands >= 3 && thousands <= 10) parts.push(`${belowThousand(thousands)} آلاف`);
  else if (thousands > 10) parts.push(`${belowThousand(thousands)} ألفاً`);
  if (rest) parts.push(belowThousand(rest));
  return `${parts.join(' و')} ${currency} فقط لا غير`;
}

const toInt = (value, fallback = 0) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

module.exports = { nowIso, startOfDay, weekBounds, monthBounds, rangeFor, randomToken, makeBarcode, chequeSerial, tafqit, toInt };
