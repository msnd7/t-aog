/** شاشة الشيكات: بناء الشيك، اختيار الطلاب، الإصدار والطباعة */
import { api } from '../api.js';
import { esc, num, dateAr, emptyState, ok, fail, confirmDialog } from '../ui.js';
import { studentPickerMarkup, bindStudentPicker, printCheques } from './shared.js';

const view = { type: 'attendance', items: [], halaqa: '' };
let data = { catalog: {}, currency: 'ريال', students: [], halaqat: [], cheques: [] };
const selected = new Set();

export async function render() {
  const [catalogRes, studentsRes, halaqatRes, chequesRes] = await Promise.all([
    api.get('/api/cheques/catalog'),
    api.get(`/api/students?period=week${view.halaqa ? `&halaqa=${view.halaqa}` : ''}`),
    api.get('/api/halaqat'),
    api.get('/api/cheques?limit=40')
  ]);
  data = {
    catalog: catalogRes.catalog,
    currency: catalogRes.currency,
    students: studentsRes.students,
    halaqat: halaqatRes.halaqat,
    cheques: chequesRes.cheques
  };
  const types = Object.values(data.catalog);
  if (!data.catalog[view.type]) view.type = types[0].key;
  if (!view.items.length) view.items = [data.catalog[view.type].items[0].key];

  const unprinted = data.cheques.filter((c) => !c.printed_at);

  return {
    title: 'الشيكات',
    subtitle: 'إصدار شيكات النقاط وطباعتها',
    actions: unprinted.length
      ? `<button class="btn btn--sm btn--ghost" data-print-unprinted>🖨️ طباعة ${unprinted.length} شيك غير مطبوع</button>` : '',
    html: `
      <div class="card">
        <div class="card__head"><div><h2>١. اختر نوع الشيك</h2><p>لكل نوع بنوده وقيمته</p></div></div>
        <div class="grid cols-3">
          ${types.map((type) => `
            <button type="button" class="cheque-type ${type.key === view.type ? 'active' : ''}" data-type="${type.key}">
              <h3 style="color:${esc(type.color)}">${esc(type.title)}</h3>
              <div class="items">${type.items.map((item) => `<span class="chip chip--gray">${esc(item.label)} · ${item.points}</span>`).join('')}</div>
            </button>`).join('')}
        </div>

        <div class="divider"></div>
        <h2 style="font-size:1.05rem">٢. بنود الشيك</h2>
        <div class="row" data-items></div>

        <div class="divider"></div>
        <h2 style="font-size:1.05rem">٣. الطلاب</h2>
        <div class="field">
          <label>تصفية بالحلقة</label>
          <select data-halaqa>
            <option value="">كل الحلقات</option>
            ${data.halaqat.map((h) => `<option value="${h.id}" ${String(view.halaqa) === String(h.id) ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}
          </select>
        </div>
        ${studentPickerMarkup(data.students, selected)}

        <div class="divider"></div>
        <div class="inline-fields">
          <div class="field"><label>اسم المعلم (التوقيع)</label><input data-teacher placeholder="يُترك فارغاً لاستخدام معلم الحلقة"></div>
          <div class="field"><label>ملاحظة على الشيك</label><input data-note placeholder="اختياري"></div>
        </div>
        <div class="row between">
          <strong data-total></strong>
          <div class="row">
            <button class="btn btn--ghost" data-issue-only>حفظ بدون طباعة</button>
            <button class="btn" data-issue-print>🖨️ إصدار وطباعة</button>
          </div>
        </div>
      </div>

      <div class="card mt">
        <div class="card__head"><div><h2>آخر الشيكات الصادرة</h2><p>يمكن إعادة الطباعة أو الإلغاء</p></div></div>
        ${data.cheques.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th>الرقم</th><th>الطالب</th><th>الحلقة</th><th>البنود</th><th class="num">القيمة</th><th>التاريخ</th><th>الحالة</th><th></th></tr></thead>
              <tbody>
                ${data.cheques.map((cheque) => `
                  <tr>
                    <td>${esc(cheque.serial)}</td>
                    <td>${esc(cheque.student_name)}</td>
                    <td>${esc(cheque.halaqa_name || '—')}</td>
                    <td>${esc(cheque.items.map((i) => i.label).join(' + '))}</td>
                    <td class="num">${num(cheque.total)}</td>
                    <td>${dateAr(cheque.issued_at)}</td>
                    <td>${cheque.printed_at ? '<span class="chip chip--green">طُبع</span>' : '<span class="chip chip--orange">لم يُطبع</span>'}</td>
                    <td class="row" style="gap:.3rem">
                      <button class="btn btn--sm btn--ghost" data-reprint="${cheque.id}">🖨️</button>
                      <button class="btn btn--sm btn--ghost" data-cancel="${cheque.id}">🗑️</button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : emptyState('لم يصدر أي شيك بعد', '🧾')}
      </div>`
  };
}

export function mount({ content, refresh }) {
  const getSelected = bindStudentPicker(content, selected);
  const itemsBox = content.querySelector('[data-items]');
  const totalBox = content.querySelector('[data-total]');

  const drawItems = () => {
    const type = data.catalog[view.type];
    itemsBox.innerHTML = type.items.map((item) => `
      <label class="option ${view.items.includes(item.key) ? 'active' : ''}">
        <input type="radio" name="cheque-item" value="${item.key}" ${view.items.includes(item.key) ? 'checked' : ''}>
        ${esc(item.label)} — ${item.points} ${esc(data.currency)}
      </label>`).join('');
    itemsBox.querySelectorAll('input').forEach((input) => {
      input.onchange = () => { view.items = [input.value]; drawItems(); };
    });
    updateTotal();
  };

  const updateTotal = () => {
    const type = data.catalog[view.type];
    const value = type.items.filter((i) => view.items.includes(i.key)).reduce((sum, i) => sum + i.points, 0);
    const count = getSelected().length;
    totalBox.textContent = `قيمة الشيك ${value} ${data.currency} × ${count} طالب = ${value * count} ${data.currency}`;
  };

  content.querySelectorAll('[data-type]').forEach((button) => {
    button.onclick = () => {
      view.type = button.dataset.type;
      view.items = [data.catalog[view.type].items[0].key];
      content.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('active', b === button));
      drawItems();
    };
  });
  content.querySelector('[data-picker-list]').addEventListener('change', updateTotal);
  content.querySelector('[data-select-all]').addEventListener('click', () => setTimeout(updateTotal));
  content.querySelector('[data-select-none]').addEventListener('click', () => setTimeout(updateTotal));
  content.querySelector('[data-halaqa]').onchange = (event) => { view.halaqa = event.target.value; refresh(); };
  drawItems();

  const issue = async (print) => {
    const studentIds = getSelected();
    if (!studentIds.length) return fail('اختر طالباً واحداً على الأقل');
    try {
      const result = await api.post('/api/cheques', {
        type: view.type,
        items: view.items,
        student_ids: studentIds,
        teacher_name: content.querySelector('[data-teacher]').value,
        note: content.querySelector('[data-note]').value
      });
      ok(`تم إصدار ${result.ids.length} شيك بقيمة ${num(result.total)} لكل طالب`);
      if (print) printCheques(result.ids);
      selected.clear();
      refresh();
    } catch (error) { fail(error.message); }
  };

  content.querySelector('[data-issue-only]').onclick = () => issue(false);
  content.querySelector('[data-issue-print]').onclick = () => issue(true);

  content.querySelectorAll('[data-reprint]').forEach((button) => {
    button.onclick = () => printCheques([Number(button.dataset.reprint)]);
  });
  content.querySelectorAll('[data-cancel]').forEach((button) => {
    button.onclick = async () => {
      if (!await confirmDialog('إلغاء الشيك سيحذف نقاطه من رصيد الطالب. هل تريد المتابعة؟')) return;
      try {
        await api.del(`/api/cheques/${button.dataset.cancel}`);
        ok('تم إلغاء الشيك');
        refresh();
      } catch (error) { fail(error.message); }
    };
  });

  const printUnprinted = document.querySelector('[data-print-unprinted]');
  if (printUnprinted) {
    printUnprinted.onclick = () => printCheques(data.cheques.filter((c) => !c.printed_at).map((c) => c.id));
  }
}
