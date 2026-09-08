'use strict';
const { getSettings } = require('./db');
const { toInt } = require('./util');

/**
 * The three cheque books used in the halaqat, with the point value of every
 * line item. Values are editable from the settings screen.
 */
async function chequeCatalog() {
  const s = await getSettings();
  return {
    attendance: {
      key: 'attendance',
      title: 'شيك الحضور',
      color: '#1b4f9c',
      multi: false,
      items: [
        { key: 'early', label: 'الحضور المبكر', points: toInt(s.cheque_attendance_early, 70) },
        { key: 'general', label: 'الحضور العام', points: toInt(s.cheque_attendance_general, 50) }
      ]
    },
    recitation: {
      key: 'recitation',
      title: 'شيك تسميع الورد اليومي',
      color: '#0f8a4a',
      multi: false,
      items: [
        { key: 'hifz', label: 'حفظ', points: toInt(s.cheque_recitation_hifz, 25) },
        { key: 'review', label: 'مراجعة', points: toInt(s.cheque_recitation_review, 25) },
        { key: 'both', label: 'حفظ ومراجعة', points: toInt(s.cheque_recitation_both, 50) }
      ]
    },
    discipline: {
      key: 'discipline',
      title: 'شيك الانضباط والأخلاق',
      color: '#f39200',
      multi: false,
      items: [
        { key: 'discipline', label: 'الانضباط والأخلاق', points: toInt(s.cheque_discipline, 25) }
      ]
    }
  };
}

const CATEGORY_LABELS = {
  attendance: 'الحضور',
  recitation: 'تسميع الورد',
  discipline: 'الانضباط والأخلاق',
  scan: 'مسح الباركود',
  manual: 'نقاط إضافية',
  halaqa_bonus: 'نقاط للحلقة',
  redeem: 'استبدال من المتجر',
  refund: 'إرجاع نقاط'
};

module.exports = { chequeCatalog, CATEGORY_LABELS };
