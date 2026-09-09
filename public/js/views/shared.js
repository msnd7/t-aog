/** مكوّنات مشتركة بين الشاشات: منح النقاط، اختيار الطلاب، وبطاقات الباركود */
import { api } from '../api.js';
import { esc, num, avatar, ok, fail, modal, formValues, icon, pointsPick, bindPointsPick, searchPick } from '../ui.js';

/** نافذة منح نقاط لطالب أو لمجموعة طلاب — عدد النقاط من قائمة منسدلة */
export function awardPointsModal({ students = [], halaqaId = null, halaqaOnly = false, onDone }) {
  const title = halaqaOnly ? 'إضافة نقاط للحلقة'
    : students.length === 1 ? `إضافة نقاط للطالب: ${students[0].name}`
      : `إضافة نقاط لـ ${students.length} طلاب`;
  modal({
    title,
    render: () => `
      <form id="award-form">
        <div class="row" style="align-items:flex-start">
          ${pointsPick({ label: 'عدد النقاط', value: 25 })}
        </div>
        <div class="field" hidden>
          <label>عدد النقاط (قيمة أخرى)</label>
          <input name="points_custom" type="number" step="5" value="25">
          <span class="hint">النقاط من فئة ٢٥ عادةً، ويمكن استخدام قيمة سالبة للخصم.</span>
        </div>
        <div class="field">
          <label>السبب / الملاحظة</label>
          <input name="note" placeholder="مثال: إتقان التلاوة">
        </div>
        <div class="row" style="justify-content:flex-end">
          <button class="btn btn--green" type="submit">${icon('check', { size: 18 })} حفظ النقاط</button>
        </div>
      </form>`,
    onMount: (root, close) => {
      const form = root.querySelector('#award-form');
      const readPoints = bindPointsPick(form);
      form.onsubmit = async (event) => {
        event.preventDefault();
        const values = formValues(form);
        const points = readPoints();
        if (!points) return fail('اختر عدد النقاط');
        try {
          await api.post('/api/points', halaqaOnly
            ? { halaqa_id: halaqaId, halaqa_only: true, points, note: values.note }
            : { student_ids: students.map((s) => s.id), points, note: values.note, category: 'manual' });
          ok('تم تسجيل النقاط');
          close();
          if (onDone) onDone();
        } catch (error) { fail(error.message); }
      };
    }
  });
}

/** قائمة اختيار طلاب مع بحث وتحديد جماعي */
export function studentPickerMarkup(students, selected = new Set()) {
  return `
    <div class="row" style="margin-bottom:.6rem;align-items:flex-end">
      ${searchPick({ label: 'بحث عن طالب', attrs: 'data-picker-search', placeholder: 'الاسم أو رقم الباركود' })}
      <button type="button" class="btn btn--ghost btn--sm" data-select-all>${icon('check', { size: 16 })} تحديد الكل</button>
      <button type="button" class="btn btn--ghost btn--sm" data-select-none>${icon('close', { size: 16 })} إلغاء التحديد</button>
      <span class="chip" data-picker-count>${selected.size} محدد</span>
    </div>
    <div class="list" data-picker-list style="max-height:44vh;overflow-y:auto">
      ${students.map((student) => `
        <label class="list__item ${selected.has(student.id) ? 'selected' : ''}" data-student="${student.id}"
               data-name="${esc(student.name)} ${esc(student.barcode || '')}">
          <input type="checkbox" value="${student.id}" ${selected.has(student.id) ? 'checked' : ''}>
          ${avatar(student)}
          <div style="flex:1">
            <strong>${esc(student.name)}</strong>
            <span class="muted small">${esc(student.halaqa_name || 'بدون حلقة')} · ${esc(student.barcode || '')}</span>
          </div>
          <span class="points-pill">${num(student.period_points ?? student.points ?? 0)}</span>
        </label>`).join('')}
    </div>`;
}

/** يربط أحداث قائمة اختيار الطلاب ويعيد دالة لجلب المحدد */
export function bindStudentPicker(root, selected = new Set()) {
  const list = root.querySelector('[data-picker-list]');
  const counter = root.querySelector('[data-picker-count]');
  const search = root.querySelector('[data-picker-search]');
  const update = () => {
    counter.textContent = `${selected.size} محدد`;
    list.querySelectorAll('[data-student]').forEach((row) => {
      row.classList.toggle('selected', selected.has(Number(row.dataset.student)));
    });
  };
  list.addEventListener('change', (event) => {
    const row = event.target.closest('[data-student]');
    if (!row) return;
    const id = Number(row.dataset.student);
    if (event.target.checked) selected.add(id); else selected.delete(id);
    update();
  });
  if (search) {
    search.addEventListener('input', () => {
      const needle = search.value.trim().toLowerCase();
      list.querySelectorAll('[data-student]').forEach((row) => {
        row.hidden = needle ? !row.dataset.name.toLowerCase().includes(needle) : false;
      });
    });
  }
  const selectAll = root.querySelector('[data-select-all]');
  const selectNone = root.querySelector('[data-select-none]');
  if (selectAll) selectAll.onclick = () => {
    list.querySelectorAll('[data-student]').forEach((row) => {
      if (row.hidden) return;
      selected.add(Number(row.dataset.student));
      row.querySelector('input').checked = true;
    });
    update();
  };
  if (selectNone) selectNone.onclick = () => {
    selected.clear();
    list.querySelectorAll('input[type=checkbox]').forEach((input) => { input.checked = false; });
    update();
  };
  update();
  return () => [...selected];
}

/** فتح صفحة طباعة الشيكات الصادرة باسم طلاب */
export function printCheques(ids) {
  if (!ids.length) return fail('لا توجد شيكات للطباعة');
  window.open(`/print.html?ids=${ids.join(',')}`, '_blank', 'noopener');
}

/** فتح صفحة طباعة دفعة الشيكات الفارغة (خمسة في كل صفحة) */
export function printVouchers({ batch = null, ids = [] } = {}) {
  if (!batch && !ids.length) return fail('لا توجد شيكات للطباعة');
  const query = batch ? `batch=${encodeURIComponent(batch)}` : `ids=${ids.join(',')}`;
  window.open(`/blank.html?${query}`, '_blank', 'noopener');
}

/** فتح صفحة طباعة بطاقات الباركود */
export function printCards({ halaqaId = null, studentIds = [], layout = '' } = {}) {
  const params = new URLSearchParams();
  if (halaqaId) params.set('halaqa', halaqaId);
  if (studentIds.length) params.set('ids', studentIds.join(','));
  if (layout) params.set('layout', layout);
  window.open(`/cards.html?${params.toString()}`, '_blank', 'noopener');
}
