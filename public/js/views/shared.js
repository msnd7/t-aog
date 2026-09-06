/** مكوّنات مشتركة بين الشاشات: منح النقاط، اختيار الطلاب، وبطاقات الباركود */
import { api } from '../api.js';
import { esc, num, avatar, ok, fail, modal, formValues } from '../ui.js';

export const QUICK_POINTS = [25, 50, 75, 100, -25];

/** نافذة منح نقاط لطالب أو لمجموعة طلاب */
export function awardPointsModal({ students = [], halaqaId = null, halaqaOnly = false, onDone }) {
  const title = halaqaOnly ? 'إضافة نقاط للحلقة'
    : students.length === 1 ? `إضافة نقاط للطالب: ${students[0].name}`
      : `إضافة نقاط لـ ${students.length} طلاب`;
  modal({
    title,
    render: () => `
      <form id="award-form">
        <div class="field">
          <label>عدد النقاط</label>
          <div class="row" style="margin-bottom:.4rem">
            ${QUICK_POINTS.map((p) => `<button type="button" class="btn btn--ghost btn--sm" data-quick="${p}">${p > 0 ? '+' : ''}${p}</button>`).join('')}
          </div>
          <input name="points" type="number" step="5" value="25" required>
          <span class="hint">النقاط من فئة 25 عادةً. استخدم قيمة سالبة للخصم.</span>
        </div>
        <div class="field">
          <label>السبب / الملاحظة</label>
          <input name="note" placeholder="مثال: إتقان التلاوة">
        </div>
        <div class="row" style="justify-content:flex-end">
          <button class="btn btn--green" type="submit">حفظ النقاط</button>
        </div>
      </form>`,
    onMount: (root, close) => {
      const form = root.querySelector('#award-form');
      root.querySelectorAll('[data-quick]').forEach((button) => {
        button.onclick = () => { form.points.value = button.dataset.quick; };
      });
      form.onsubmit = async (event) => {
        event.preventDefault();
        const values = formValues(form);
        try {
          await api.post('/api/points', halaqaOnly
            ? { halaqa_id: halaqaId, halaqa_only: true, points: Number(values.points), note: values.note }
            : { student_ids: students.map((s) => s.id), points: Number(values.points), note: values.note, category: 'manual' });
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
    <div class="field">
      <input data-picker-search placeholder="ابحث باسم الطالب أو رقم الباركود">
    </div>
    <div class="row" style="margin-bottom:.5rem">
      <button type="button" class="btn btn--ghost btn--sm" data-select-all>تحديد الكل</button>
      <button type="button" class="btn btn--ghost btn--sm" data-select-none>إلغاء التحديد</button>
      <span class="spacer"></span>
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

/** فتح صفحة طباعة الشيكات المحددة */
export function printCheques(ids) {
  if (!ids.length) return fail('لا توجد شيكات للطباعة');
  window.open(`/print.html?ids=${ids.join(',')}`, '_blank', 'noopener');
}

/** فتح صفحة طباعة بطاقات الباركود */
export function printCards({ halaqaId = null, studentIds = [] } = {}) {
  const params = new URLSearchParams();
  if (halaqaId) params.set('halaqa', halaqaId);
  if (studentIds.length) params.set('ids', studentIds.join(','));
  window.open(`/cards.html?${params.toString()}`, '_blank', 'noopener');
}
