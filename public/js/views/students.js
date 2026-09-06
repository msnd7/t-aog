/** شاشة الأفراد: قائمة الطلاب، إضافة، نقاط، شيكات وبطاقات الباركود */
import { api } from '../api.js';
import { esc, num, avatar, rankBadge, emptyState, modal, formValues, ok, fail, periodTabs, confirmDialog } from '../ui.js';
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
    actions: `
      <button class="btn btn--sm" data-add>➕ طالب جديد</button>
      <button class="btn btn--sm btn--ghost" data-bulk>📋 إضافة دفعة</button>`,
    html: `
      <div class="card">
        <div class="row between" style="margin-bottom:.6rem">
          ${periodTabs(view.period)}
          <div class="row">
            <select data-halaqa style="min-height:40px;border-radius:12px;border:1px solid var(--line);padding:0 .6rem">
              <option value="">كل الحلقات</option>
              ${data.halaqat.map((h) => `<option value="${h.id}" ${String(view.halaqa) === String(h.id) ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}
            </select>
            <input data-search value="${esc(view.query)}" placeholder="بحث بالاسم أو الباركود"
                   style="min-height:40px;border-radius:12px;border:1px solid var(--line);padding:0 .7rem">
          </div>
        </div>

        <div class="row" style="margin-bottom:.6rem">
          <label class="switch"><input type="checkbox" data-all> تحديد الكل</label>
          <span class="chip" data-count>${selected.size} محدد</span>
          <span class="spacer"></span>
          <button class="btn btn--sm btn--green" data-award ${selected.size ? '' : 'disabled'}>➕ نقاط للمحددين</button>
          <button class="btn btn--sm" data-cheque ${selected.size ? '' : 'disabled'}>🧾 شيك للمحددين</button>
          <button class="btn btn--sm btn--ghost" data-cards>🖨️ طباعة بطاقات الباركود</button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:40px"></th>
                <th style="width:44px">#</th>
                <th>الطالب</th>
                <th>الحلقة</th>
                <th class="num">نقاط الفترة</th>
                <th class="num">الرصيد</th>
                <th class="num">الإجمالي</th>
                <th style="width:180px">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              ${data.students.map((student) => `
                <tr data-row="${student.id}" data-name="${esc(student.name)} ${esc(student.barcode || '')}">
                  <td><input type="checkbox" data-pick="${student.id}" ${selected.has(student.id) ? 'checked' : ''}></td>
                  <td>${rankBadge(student.rank)}</td>
                  <td>
                    <a class="person" href="#/students/${student.id}" style="text-decoration:none;color:inherit">
                      ${avatar(student)}
                      <span><strong>${esc(student.name)}</strong><span>${esc(student.barcode || '')}</span></span>
                    </a>
                  </td>
                  <td>${esc(student.halaqa_name || '—')}</td>
                  <td class="num"><span class="points-pill">${num(student.period_points)}</span></td>
                  <td class="num">${num(student.balance)}</td>
                  <td class="num muted">${num(student.earned)}</td>
                  <td>
                    <button class="btn btn--sm btn--green" data-quick-award="${student.id}">نقاط</button>
                    <button class="btn btn--sm btn--ghost" data-quick-cheque="${student.id}">شيك</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ${data.students.length ? '' : emptyState('لا يوجد طلاب بعد. ابدأ بإضافة طالب أو دفعة أسماء.', '🎓')}
      </div>`
  };
}

export function mount({ content, refresh }) {
  const countChip = content.querySelector('[data-count]');
  const syncButtons = () => {
    countChip.textContent = `${selected.size} محدد`;
    content.querySelector('[data-award]').disabled = !selected.size;
    content.querySelector('[data-cheque]').disabled = !selected.size;
  };

  content.querySelectorAll('[data-period]').forEach((button) => {
    button.onclick = () => { view.period = button.dataset.period; refresh(); };
  });
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

  content.querySelector('[data-award]').onclick = () =>
    awardPointsModal({ students: pickedStudents(), onDone: refresh });
  content.querySelector('[data-cheque]').onclick = () => chequeModal(pickedStudents(), refresh);
  content.querySelector('[data-cards]').onclick = () =>
    printCards({ halaqaId: view.halaqa || null, studentIds: selected.size ? [...selected] : [] });

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

  document.querySelector('[data-add]').onclick = () => addStudentModal(data.halaqat, refresh);
  document.querySelector('[data-bulk]').onclick = () => bulkModal(data.halaqat, refresh);
}

/** إصدار شيك سريع من شاشة الأفراد */
export async function chequeModal(students, onDone) {
  if (!students.length) return fail('اختر طالباً واحداً على الأقل');
  const { catalog, currency } = await api.get('/api/cheques/catalog');
  const types = Object.values(catalog);
  let activeType = types[0].key;
  let activeItems = [types[0].items[0].key];

  modal({
    title: `إصدار شيك لـ ${students.length === 1 ? students[0].name : `${students.length} طلاب`}`,
    wide: true,
    render: () => `
      <div class="grid cols-3" data-types>
        ${types.map((type) => `
          <button type="button" class="cheque-type ${type.key === activeType ? 'active' : ''}" data-type="${type.key}">
            <h3>${esc(type.title)}</h3>
            <div class="items">${type.items.map((item) => `<span class="chip chip--gray">${esc(item.label)} · ${item.points}</span>`).join('')}</div>
          </button>`).join('')}
      </div>
      <div class="divider"></div>
      <div class="field">
        <label>بنود الشيك</label>
        <div class="row" data-items></div>
      </div>
      <form id="cheque-form">
        <div class="inline-fields">
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
            <button class="btn" type="submit" data-print>🖨️ إصدار وطباعة</button>
          </div>
        </div>
      </form>`,
    onMount: (root, close) => {
      const itemsBox = root.querySelector('[data-items]');
      const totalBox = root.querySelector('[data-total]');
      const drawItems = () => {
        const type = catalog[activeType];
        itemsBox.innerHTML = type.items.map((item) => `
          <label class="option ${activeItems.includes(item.key) ? 'active' : ''}">
            <input type="radio" name="item" value="${item.key}" ${activeItems.includes(item.key) ? 'checked' : ''}>
            ${esc(item.label)} — ${item.points} ${esc(currency)}
          </label>`).join('');
        itemsBox.querySelectorAll('input[name=item]').forEach((input) => {
          input.onchange = () => { activeItems = [input.value]; drawItems(); };
        });
        const total = type.items.filter((i) => activeItems.includes(i.key)).reduce((sum, i) => sum + i.points, 0);
        totalBox.textContent = `قيمة الشيك: ${total} ${currency} × ${students.length} = ${total * students.length}`;
      };
      root.querySelectorAll('[data-type]').forEach((button) => {
        button.onclick = () => {
          activeType = button.dataset.type;
          activeItems = [catalog[activeType].items[0].key];
          root.querySelectorAll('[data-type]').forEach((b) => b.classList.toggle('active', b === button));
          drawItems();
        };
      });
      drawItems();

      let printAfter = true;
      root.querySelector('[data-save-only]').onclick = () => { printAfter = false; };
      root.querySelector('[data-print]').onclick = () => { printAfter = true; };
      root.querySelector('#cheque-form').onsubmit = async (event) => {
        event.preventDefault();
        const values = formValues(event.target);
        try {
          const result = await api.post('/api/cheques', {
            type: activeType,
            items: activeItems,
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
        <div class="inline-fields">
          <div class="field">
            <label>اسم المستخدم (اختياري)</label>
            <input name="username" placeholder="يُنشأ تلقائياً من الباركود">
          </div>
          <div class="field">
            <label>كلمة المرور (اختياري)</label>
            <input name="password" placeholder="الافتراضي: رقم الباركود">
          </div>
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
                <p>الباركود: <strong>${esc(student.barcode)}</strong></p>
                <p>اسم المستخدم: <strong>${esc(student.username)}</strong></p>
                <p>كلمة المرور: <strong>${esc(student.password)}</strong></p>
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
          <textarea name="names" placeholder="اسم في كل سطر" required></textarea>
          <span class="hint">يُنشأ لكل طالب باركود وحساب دخول تلقائياً.</span>
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
          if (await confirmDialog('هل تريد طباعة بطاقات الباركود للطلاب الجدد؟', { confirmText: 'طباعة', danger: false })) {
            printCards({ studentIds: result.created.map((s) => s.id) });
          }
          if (onDone) onDone();
        } catch (error) { fail(error.message); }
      };
    }
  });
}
