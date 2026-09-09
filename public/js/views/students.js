/** شاشة الأفراد: قائمة الطلاب، إضافة، نقاط، شيكات وبطاقات الباركود */
import { api } from '../api.js';
import {
  esc, num, avatar, rankBadge, emptyState, modal, formValues, ok, fail, confirmDialog,
  icon, pick, searchPick, periodPick, menu, menuItem, menuSep
} from '../ui.js';
import { awardPointsModal, printCards, printCheques } from './shared.js';

const view = { period: 'week', halaqa: '', query: '' };
let data = { students: [], halaqat: [] };
const selected = new Set();

export async function render() {
  const [studentsRes, halaqatRes] = await Promise.all([
    api.get(`/api/students?period=${view.period}${view.halaqa ? `&halaqa=${view.halaqa}` : ''}`),
    api.get('/api/halaqat')
  ]);
  data = { students: studentsRes.students, halaqat: halaqatRes.halaqat };
  for (const id of [...selected]) if (!data.students.some((s) => s.id === id)) selected.delete(id);

  return {
    title: 'الأفراد',
    subtitle: `${num(data.students.length)} طالباً`,
    actions: menu({
      label: 'إجراءات',
      name: 'plus',
      className: 'btn btn--sm',
      items: [
        menuItem({ label: 'طالب جديد', name: 'user', attrs: 'data-add' }),
        menuItem({ label: 'إضافة دفعة أسماء', name: 'list', attrs: 'data-bulk' }),
        menuSep(),
        menuItem({ label: 'طباعة بطاقات الباركود', name: 'barcode', attrs: 'data-cards' })
      ]
    }),
    html: `
      <div class="toolbar">
        ${periodPick(view.period)}
        ${pick({
    label: 'الحلقة',
    attrs: 'data-halaqa',
    value: view.halaqa,
    options: [{ value: '', label: 'كل الحلقات' }, ...data.halaqat.map((h) => ({ value: String(h.id), label: h.name }))]
  })}
        ${searchPick({
    label: 'بحث',
    attrs: 'data-search',
    value: view.query,
    placeholder: 'الاسم أو الجوال أو الباركود'
  })}
      </div>

      <div class="card">
        <div class="row between" style="margin-bottom:.7rem">
          <div class="row">
            <label class="switch"><input type="checkbox" data-all> تحديد الكل</label>
            <span class="chip" data-count>${selected.size} محدد</span>
          </div>
          ${menu({
    label: 'إجراءات المحدد',
    name: 'check',
    className: 'btn btn--sm btn--ghost',
    items: [
      menuItem({ label: 'إضافة نقاط', name: 'points', attrs: 'data-award' }),
      menuItem({ label: 'إصدار شيك باسمهم', name: 'cheque', attrs: 'data-cheque' }),
      menuSep(),
      menuItem({ label: 'طباعة بطاقات المحددين', name: 'barcode', attrs: 'data-cards-selected' })
    ]
  })}
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:38px"></th>
                <th style="width:44px">#</th>
                <th>الطالب</th>
                <th>رقم الجوال</th>
                <th>الحلقة</th>
                <th class="num">نقاط الفترة</th>
                <th class="num">الرصيد</th>
                <th class="num">الإجمالي</th>
                <th style="width:56px"></th>
              </tr>
            </thead>
            <tbody>
              ${data.students.map((student) => `
                <tr data-row="${student.id}" data-name="${esc(student.name)} ${esc(student.barcode || '')} ${esc(student.phone || '')}">
                  <td><input type="checkbox" data-pick="${student.id}" ${selected.has(student.id) ? 'checked' : ''}></td>
                  <td>${rankBadge(student.rank)}</td>
                  <td>
                    <a class="person" href="#/students/${student.id}" style="text-decoration:none;color:inherit">
                      ${avatar(student)}
                      <span><strong>${esc(student.name)}</strong><span dir="ltr">${esc(student.barcode || '')}</span></span>
                    </a>
                  </td>
                  <td dir="ltr" style="text-align:right">${esc(student.phone || '—')}</td>
                  <td>${esc(student.halaqa_name || '—')}</td>
                  <td class="num"><span class="points-pill">${num(student.period_points)}</span></td>
                  <td class="num">${num(student.balance)}</td>
                  <td class="num muted">${num(student.earned)}</td>
                  <td>${menu({
    name: 'more', label: '', className: 'btn btn--sm btn--ghost btn--icon',
    items: [
      menuItem({ label: 'إضافة نقاط', name: 'points', attrs: `data-quick-award="${student.id}"` }),
      menuItem({ label: 'إصدار شيك', name: 'cheque', attrs: `data-quick-cheque="${student.id}"` }),
      menuItem({ label: 'طباعة البطاقة', name: 'barcode', attrs: `data-quick-card="${student.id}"` }),
      menuSep(),
      menuItem({ label: 'ملف الطالب', name: 'user', href: `#/students/${student.id}` })
    ]
  })}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${data.students.length ? '' : emptyState('لا يوجد طلاب بعد. ابدأ بإضافة طالب أو دفعة أسماء.', 'students')}
      </div>`
  };
}

export function mount({ content, refresh }) {
  const countChip = content.querySelector('[data-count]');
  const syncButtons = () => { countChip.textContent = `${selected.size} محدد`; };

  const periodSelect = content.querySelector('[data-period-select]');
  periodSelect.onchange = () => { view.period = periodSelect.value; refresh(); };
  content.querySelector('[data-halaqa]').onchange = (event) => { view.halaqa = event.target.value; refresh(); };

  const search = content.querySelector('[data-search]');
  search.oninput = () => {
    view.query = search.value;
    const needle = view.query.trim().toLowerCase();
    content.querySelectorAll('tbody tr').forEach((row) => {
      row.hidden = needle ? !row.dataset.name.toLowerCase().includes(needle) : false;
    });
  };

  content.querySelectorAll('[data-pick]').forEach((box) => {
    box.onchange = () => {
      const id = Number(box.dataset.pick);
      if (box.checked) selected.add(id); else selected.delete(id);
      syncButtons();
    };
  });
  content.querySelector('[data-all]').onchange = (event) => {
    content.querySelectorAll('tbody tr').forEach((row) => {
      if (row.hidden) return;
      const box = row.querySelector('[data-pick]');
      box.checked = event.target.checked;
      const id = Number(box.dataset.pick);
      if (event.target.checked) selected.add(id); else selected.delete(id);
    });
    syncButtons();
  };

  const pickedStudents = () => data.students.filter((s) => selected.has(s.id));
  const needSelection = () => {
    if (selected.size) return false;
    fail('اختر طالباً واحداً على الأقل');
    return true;
  };

  content.querySelector('[data-award]').onclick = () => {
    if (needSelection()) return;
    awardPointsModal({ students: pickedStudents(), onDone: refresh });
  };
  content.querySelector('[data-cheque]').onclick = () => {
    if (needSelection()) return;
    chequeModal(pickedStudents(), refresh);
  };
  content.querySelector('[data-cards-selected]').onclick = () => {
    if (needSelection()) return;
    cardsModal({ studentIds: [...selected] });
  };

  content.querySelectorAll('[data-quick-award]').forEach((button) => {
    button.onclick = () => {
      const student = data.students.find((s) => s.id === Number(button.dataset.quickAward));
      awardPointsModal({ students: [student], onDone: refresh });
    };
  });
  content.querySelectorAll('[data-quick-cheque]').forEach((button) => {
    button.onclick = () => {
      const student = data.students.find((s) => s.id === Number(button.dataset.quickCheque));
      chequeModal([student], refresh);
    };
  });
  content.querySelectorAll('[data-quick-card]').forEach((button) => {
    button.onclick = () => cardsModal({ studentIds: [Number(button.dataset.quickCard)] });
  });

  document.querySelector('[data-add]').onclick = () => addStudentModal(data.halaqat, refresh);
  document.querySelector('[data-bulk]').onclick = () => bulkModal(data.halaqat, refresh);
  document.querySelector('[data-cards]').onclick = () => cardsModal({
    halaqaId: view.halaqa || null,
    studentIds: selected.size ? [...selected] : []
  });
}

/** اختيار كثافة صفحة الباركودات قبل الطباعة */
export function cardsModal({ halaqaId = null, studentIds = [] } = {}) {
  modal({
    title: 'طباعة بطاقات الباركود',
    render: () => `
      <form id="cards-form">
        ${pick({
    label: 'شكل الطباعة',
    attrs: 'name="layout"',
    value: 'label',
    options: [
      { value: 'label', label: 'ملصقات متوسطة — ٢٤ باركود في الصفحة' },
      { value: 'mini', label: 'ملصقات مصغّرة — ٤٠ باركود في الصفحة' },
      { value: 'card', label: 'بطاقات كاملة بالصورة — ١٠ في الصفحة' }
    ]
  })}
        <p class="muted small mt">${icon('info', { size: 16 })}
          الملصقات تطبع أكبر عدد ممكن في الصفحة الواحدة لتسهيل القص والتوزيع،
          والبطاقات الكاملة بمقاس البطاقة البنكية وفيها صورة الطالب.</p>
        <button class="btn btn--block mt" type="submit">${icon('print', { size: 18 })} فتح صفحة الطباعة</button>
      </form>`,
    onMount: (root, close) => {
      root.querySelector('#cards-form').onsubmit = (event) => {
        event.preventDefault();
        printCards({ halaqaId, studentIds, layout: formValues(event.target).layout });
        close();
      };
    }
  });
}

/** إصدار شيك سريع باسم طالب أو مجموعة طلاب */
export async function chequeModal(students, onDone) {
  if (!students.length) return fail('اختر طالباً واحداً على الأقل');
  const { options, currency } = await api.get('/api/cheques/vouchers/options');
  let active = options[0].value;
  const find = (value) => options.find((one) => one.value === value) || options[0];

  modal({
    title: `إصدار شيك لـ ${students.length === 1 ? students[0].name : `${students.length} طلاب`}`,
    render: () => `
      <form id="cheque-form">
        ${pick({
    label: 'نوع الشيك وبنده',
    attrs: 'name="option" data-option',
    value: active,
    options: options.map((one) => ({ value: one.value, label: `${one.title} · ${one.points} ${currency}` }))
  })}
        <div class="inline-fields mt">
          <div class="field">
            <label>اسم المعلم (للتوقيع)</label>
            <input name="teacher_name" placeholder="يُترك فارغاً لاستخدام معلم الحلقة">
          </div>
          <div class="field">
            <label>ملاحظة</label>
            <input name="note" placeholder="اختياري">
          </div>
        </div>
        <div class="row between">
          <strong data-total></strong>
          <div class="row">
            <button class="btn btn--ghost" type="submit" data-save-only>حفظ بدون طباعة</button>
            <button class="btn" type="submit" data-print>${icon('print', { size: 18 })} إصدار وطباعة</button>
          </div>
        </div>
      </form>`,
    onMount: (root, close) => {
      const select = root.querySelector('[data-option]');
      const totalBox = root.querySelector('[data-total]');
      const updateTotal = () => {
        const option = find(select.value);
        totalBox.textContent = `قيمة الشيك: ${option.points} ${currency} × ${students.length} = ${option.points * students.length}`;
      };
      select.onchange = () => { active = select.value; updateTotal(); };
      updateTotal();

      let printAfter = true;
      root.querySelector('[data-save-only]').onclick = () => { printAfter = false; };
      root.querySelector('[data-print]').onclick = () => { printAfter = true; };
      root.querySelector('#cheque-form').onsubmit = async (event) => {
        event.preventDefault();
        const values = formValues(event.target);
        const option = find(select.value);
        try {
          const result = await api.post('/api/cheques', {
            type: option.type,
            items: [option.item],
            student_ids: students.map((s) => s.id),
            teacher_name: values.teacher_name,
            note: values.note
          });
          ok(`تم إصدار ${result.ids.length} شيك`);
          close();
          if (printAfter) printCheques(result.ids);
          if (onDone) onDone();
        } catch (error) { fail(error.message); }
      };
    }
  });
}

function addStudentModal(halaqat, onDone) {
  modal({
    title: 'إضافة طالب',
    render: () => `
      <form id="student-form">
        <div class="field">
          <label>اسم الطالب</label>
          <input name="name" required autofocus>
        </div>
        <div class="field">
          <label>الحلقة</label>
          <select name="halaqa_id">
            <option value="">بدون حلقة</option>
            ${halaqat.map((h) => `<option value="${h.id}">${esc(h.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>رقم الجوال (للدخول)</label>
          <input name="phone" inputmode="tel" dir="ltr" placeholder="05xxxxxxxx">
          <span class="hint">يدخل الطالب برقم جواله والرمز المؤقت، ثم تظهر له شاشة تغيير الرمز.</span>
        </div>
        <button class="btn btn--block" type="submit">إضافة الطالب</button>
      </form>`,
    onMount: (root, close) => {
      root.querySelector('#student-form').onsubmit = async (event) => {
        event.preventDefault();
        try {
          const { student } = await api.post('/api/students', formValues(event.target));
          close();
          modal({
            title: 'تمت الإضافة',
            render: () => `
              <p>تم إنشاء حساب الطالب <strong>${esc(student.name)}</strong>.</p>
              <div class="card">
                <p>الباركود: <strong dir="ltr">${esc(student.barcode)}</strong></p>
                <p>رقم الجوال للدخول: <strong dir="ltr">${esc(student.phone || 'لم يُسجَّل')}</strong></p>
                <p>الرمز المؤقت: <strong dir="ltr">${esc(student.code)}</strong> — يُطلب تغييره عند أول دخول</p>
              </div>
              <div class="barcode-box"><svg data-barcode="${esc(student.barcode)}"></svg></div>`,
            onMount: async (box) => {
              const { renderBarcodes } = await import('../barcode.js');
              renderBarcodes(box);
            }
          });
          if (onDone) onDone();
        } catch (error) { fail(error.message); }
      };
    }
  });
}

function bulkModal(halaqat, onDone) {
  modal({
    title: 'إضافة دفعة طلاب',
    render: () => `
      <form id="bulk-form">
        <div class="field">
          <label>الحلقة</label>
          <select name="halaqa_id">
            <option value="">بدون حلقة</option>
            ${halaqat.map((h) => `<option value="${h.id}">${esc(h.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>أسماء الطلاب</label>
          <textarea name="names" placeholder="عبدالرحمن الأحمد, 0501234567&#10;محمد العتيبي, 0559876543" required></textarea>
          <span class="hint">سطر لكل طالب: الاسم ثم فاصلة ثم رقم الجوال (الرقم اختياري). يُنشأ الباركود والرمز المؤقت تلقائياً.</span>
        </div>
        <button class="btn btn--block" type="submit">إضافة</button>
      </form>`,
    onMount: (root, close) => {
      root.querySelector('#bulk-form').onsubmit = async (event) => {
        event.preventDefault();
        try {
          const result = await api.post('/api/students/bulk', formValues(event.target));
          ok(`تمت إضافة ${result.count} طالباً`);
          close();
          if (result.skipped && result.skipped.length) {
            fail(`تم تجاوز ${result.skipped.length} سطراً: ${result.skipped[0].reason}`);
          }
          if (await confirmDialog('هل تريد طباعة بطاقات الباركود للطلاب الجدد؟', { confirmText: 'طباعة', danger: false })) {
            cardsModal({ studentIds: result.created.map((s) => s.id) });
          }
          if (onDone) onDone();
        } catch (error) { fail(error.message); }
      };
    }
  });
}
