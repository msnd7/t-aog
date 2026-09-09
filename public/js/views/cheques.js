/**
 * شاشة الشيكات:
 *   ١) دفاتر الشيكات الفارغة — يختار المشرف نوع الشيك وعدده فتُطبع خمسة
 *      شيكات في كل صفحة، الاسم والتوقيع فارغان، وفي كل شيك باركود وقيمته.
 *   ٢) شيك باسم طالب — الشيك القديم الذي يُصدر ويُضيف النقاط مباشرة.
 */
import { api } from '../api.js';
import { esc, num, nb, dateAr, emptyState, ok, fail, confirmDialog, icon, pick, menu, menuItem } from '../ui.js';
import { studentPickerMarkup, bindStudentPicker, printCheques, printVouchers } from './shared.js';

const view = { tab: 'blank', option: '', count: '100', halaqa: '', item: '' };
let data = { options: [], currency: 'ريال', batches: [], students: [], halaqat: [], cheques: [], catalog: {} };
const selected = new Set();

const COUNTS = [10, 25, 50, 100, 150, 200, 300, 500];

const findOption = (value) => data.options.find((one) => one.value === value) || data.options[0];

export async function render() {
  const [optionsRes, batchesRes] = await Promise.all([
    api.get('/api/cheques/vouchers/options'),
    api.get('/api/cheques/vouchers/batches')
  ]);
  data.options = optionsRes.options;
  data.currency = optionsRes.currency;
  data.batches = batchesRes.batches;
  if (!findOption(view.option)) view.option = data.options[0].value;

  if (view.tab === 'named') {
    const [catalogRes, studentsRes, halaqatRes, chequesRes] = await Promise.all([
      api.get('/api/cheques/catalog'),
      api.get(`/api/students?period=week${view.halaqa ? `&halaqa=${view.halaqa}` : ''}`),
      api.get('/api/halaqat'),
      api.get('/api/cheques?limit=40')
    ]);
    data = {
      ...data,
      catalog: catalogRes.catalog,
      students: studentsRes.students,
      halaqat: halaqatRes.halaqat,
      cheques: chequesRes.cheques
    };
  }

  const unprinted = data.cheques.filter((cheque) => !cheque.printed_at);

  return {
    title: 'الشيكات',
    subtitle: view.tab === 'blank' ? 'طباعة دفاتر الشيكات الفارغة' : 'إصدار شيك باسم طالب',
    actions: view.tab === 'named' && unprinted.length
      ? `<button class="btn btn--sm btn--ghost" data-print-unprinted>${icon('print', { size: 16 })} طباعة ${unprinted.length} شيك غير مطبوع</button>`
      : '',
    html: `
      <div class="tabs">
        <button type="button" data-tab="blank" class="${view.tab === 'blank' ? 'active' : ''}">دفاتر الشيكات الفارغة</button>
        <button type="button" data-tab="named" class="${view.tab === 'named' ? 'active' : ''}">شيك باسم طالب</button>
      </div>
      ${view.tab === 'blank' ? blankSection() : namedSection()}`
  };
}

// ---------------------------------------------------------------------------
// دفاتر الشيكات الفارغة
// ---------------------------------------------------------------------------

function blankSection() {
  const option = findOption(view.option);
  return `
    <div class="card">
      <div class="card__head">
        <div><h2>${icon('cheque')} إنشاء دفعة شيكات فارغة</h2>
          <p>اختر نوع الشيك وعدده، وستُطبع خمسة شيكات في كل صفحة جاهزة للقص</p></div>
      </div>

      <div class="toolbar" style="margin-bottom:1rem">
        ${pick({
    label: 'نوع الشيك وقيمته',
    attrs: 'data-option',
    value: view.option,
    grow: true,
    options: data.options.map((one) => ({
      value: one.value,
      label: `${one.title} · ${one.points} ${data.currency}`
    }))
  })}
        ${pick({
    label: 'عدد الشيكات',
    attrs: 'data-count',
    value: view.count,
    options: [...COUNTS.map((c) => ({ value: String(c), label: `${c} شيك` })), { value: 'custom', label: 'عدد آخر…' }]
  })}
        <label class="pick" data-count-custom hidden>
          <span>العدد المطلوب</span>
          <input type="number" min="1" max="500" value="100" data-count-input>
        </label>
        ${pick({
    label: 'ملاحظة على الشيك',
    attrs: 'data-note-choice',
    value: 'words',
    options: [
      { value: 'words', label: 'تفقيط المبلغ' },
      { value: 'custom', label: 'ملاحظة خاصة…' },
      { value: 'none', label: 'بدون ملاحظة' }
    ]
  })}
        <label class="pick pick--grow" data-note-wrap hidden>
          <span>نص الملاحظة</span>
          <input data-note placeholder="مثال: يُسلَّم لمعلم الحلقة">
        </label>
      </div>

      <div class="voucher-preview">
        <div class="voucher-preview__lines">
          <span class="chip" style="align-self:flex-start">${esc(option ? option.title : '')}</span>
          <span class="voucher-preview__line">يُصرف للطالب / <i></i></span>
          <span class="voucher-preview__line">توقيع المعلم / <i></i></span>
          <span class="muted small">${icon('barcode', { size: 16 })} لكل شيك باركود فريد يُمسح مع بطاقة الطالب لإضافة النقاط</span>
        </div>
        <div class="center">
          <div class="voucher-preview__amount" data-preview-amount>${option ? num(option.points) : 0} ${esc(data.currency)}</div>
          <div class="muted small mt">قيمة الشيك</div>
        </div>
      </div>

      <div class="row between mt">
        <strong data-total></strong>
        <div class="row">
          <button class="btn btn--ghost" data-create-only>${icon('save', { size: 18 })} إنشاء بدون طباعة</button>
          <button class="btn" data-create-print>${icon('print', { size: 18 })} إنشاء وطباعة</button>
        </div>
      </div>
    </div>

    <div class="card mt">
      <div class="card__head">
        <div><h2>${icon('list')} دفعات الطباعة</h2><p>إعادة طباعة أي دفعة أو متابعة المصروف منها</p></div>
      </div>
      ${data.batches.length ? `
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>الدفعة</th><th>نوع الشيك</th><th class="num">القيمة</th><th class="num">العدد</th>
                <th class="num">المصروف</th><th>التاريخ</th><th style="width:60px"></th></tr>
            </thead>
            <tbody>
              ${data.batches.map((batch) => `
                <tr>
                  <td dir="ltr" style="text-align:right">${esc(batch.batch)}</td>
                  <td>${esc(batch.item_label)}</td>
                  <td class="num">${num(batch.points)}</td>
                  <td class="num">${num(batch.total)}</td>
                  <td class="num">
                    <span class="chip ${Number(batch.redeemed) ? 'chip--green' : 'chip--gray'}">
                      ${num(batch.redeemed)} / ${num(batch.total)}</span>
                  </td>
                  <td>${dateAr(batch.created_at)}</td>
                  <td>${menu({
    name: 'more', label: '', className: 'btn btn--sm btn--ghost btn--icon',
    items: [
      menuItem({ label: 'إعادة الطباعة', name: 'print', attrs: `data-reprint-batch="${esc(batch.batch)}"` }),
      menuItem({ label: 'حذف غير المصروف', name: 'trash', danger: true, attrs: `data-delete-batch="${esc(batch.batch)}"` })
    ]
  })}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : emptyState('لم تُنشأ دفعات بعد — ابدأ بإنشاء أول دفعة شيكات فارغة', 'cheque')}
    </div>`;
}

function mountBlank({ content, refresh }) {
  const optionSelect = content.querySelector('[data-option]');
  const countSelect = content.querySelector('[data-count]');
  const countCustom = content.querySelector('[data-count-custom]');
  const countInput = content.querySelector('[data-count-input]');
  const noteChoice = content.querySelector('[data-note-choice]');
  const noteWrap = content.querySelector('[data-note-wrap]');
  const noteInput = content.querySelector('[data-note]');
  const totalBox = content.querySelector('[data-total]');
  const amountBox = content.querySelector('[data-preview-amount]');

  const currentCount = () => (countSelect.value === 'custom' ? Number(countInput.value) : Number(countSelect.value));

  const update = () => {
    const option = findOption(optionSelect.value);
    const count = currentCount();
    countCustom.hidden = countSelect.value !== 'custom';
    noteWrap.hidden = noteChoice.value !== 'custom';
    amountBox.textContent = `${num(option.points)} ${data.currency}`;
    const pages = Math.ceil((count || 0) / 5);
    totalBox.innerHTML = `${nb(count || 0)} شيك × ${nb(option.points)} ${esc(data.currency)}`
      + ` = ${nb((count || 0) * option.points)} ${esc(data.currency)} · ${nb(pages)} صفحة للطباعة`;
  };

  optionSelect.onchange = () => { view.option = optionSelect.value; update(); };
  countSelect.onchange = () => { view.count = countSelect.value; update(); };
  countInput.oninput = update;
  noteChoice.onchange = update;
  update();

  const create = async (print) => {
    const option = findOption(optionSelect.value);
    const count = currentCount();
    if (!count || count < 1) return fail('أدخل عدد الشيكات المطلوب');
    if (count > 500) return fail('أقصى عدد في الدفعة الواحدة ٥٠٠ شيك');
    const note = noteChoice.value === 'custom' ? noteInput.value.trim() : '';
    try {
      const result = await api.post('/api/cheques/vouchers', {
        type: option.type, item: option.item, count, note
      });
      ok(`تم إنشاء ${result.count} شيك فارغ`);
      if (print) printVouchers({ batch: result.batch });
      refresh();
    } catch (error) { fail(error.message); }
  };

  content.querySelector('[data-create-only]').onclick = () => create(false);
  content.querySelector('[data-create-print]').onclick = () => create(true);

  content.querySelectorAll('[data-reprint-batch]').forEach((button) => {
    button.onclick = () => printVouchers({ batch: button.dataset.reprintBatch });
  });
  content.querySelectorAll('[data-delete-batch]').forEach((button) => {
    button.onclick = async () => {
      if (!await confirmDialog('حذف الشيكات غير المصروفة من هذه الدفعة؟ الشيكات المصروفة تبقى كما هي.')) return;
      try {
        const result = await api.del(`/api/cheques/vouchers/batch/${encodeURIComponent(button.dataset.deleteBatch)}`);
        ok(`تم حذف ${result.count} شيك`);
        refresh();
      } catch (error) { fail(error.message); }
    };
  });
}

// ---------------------------------------------------------------------------
// شيك باسم طالب
// ---------------------------------------------------------------------------

function namedSection() {
  const option = findOption(view.item || view.option);
  return `
    <div class="card">
      <div class="card__head">
        <div><h2>${icon('cheque')} إصدار شيك باسم طالب</h2>
          <p>تُضاف قيمة الشيك إلى رصيد الطالب مباشرة عند الإصدار</p></div>
      </div>

      <div class="toolbar">
        ${pick({
    label: 'نوع الشيك وبنده',
    attrs: 'data-item',
    value: option ? option.value : '',
    grow: true,
    options: data.options.map((one) => ({ value: one.value, label: `${one.title} · ${one.points} ${data.currency}` }))
  })}
        ${pick({
    label: 'الحلقة',
    attrs: 'data-halaqa',
    value: view.halaqa,
    options: [{ value: '', label: 'كل الحلقات' }, ...data.halaqat.map((h) => ({ value: String(h.id), label: h.name }))]
  })}
      </div>

      <h3 class="section-title"><span class="step">١</span> اختر الطلاب</h3>
      ${studentPickerMarkup(data.students, selected)}

      <div class="divider"></div>
      <h3 class="section-title"><span class="step">٢</span> بيانات الشيك</h3>
      <div class="inline-fields">
        <div class="field"><label>اسم المعلم (التوقيع)</label>
          <input data-teacher placeholder="يُترك فارغاً لاستخدام معلم الحلقة"></div>
        <div class="field"><label>ملاحظة على الشيك</label><input data-note placeholder="اختياري"></div>
      </div>

      <div class="row between">
        <strong data-total></strong>
        <div class="row">
          <button class="btn btn--ghost" data-issue-only>${icon('save', { size: 18 })} حفظ بدون طباعة</button>
          <button class="btn" data-issue-print>${icon('print', { size: 18 })} إصدار وطباعة</button>
        </div>
      </div>
    </div>

    <div class="card mt">
      <div class="card__head"><div><h2>${icon('list')} آخر الشيكات الصادرة</h2><p>يمكن إعادة الطباعة أو الإلغاء</p></div></div>
      ${data.cheques.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>الرقم</th><th>الطالب</th><th>الحلقة</th><th>البنود</th><th class="num">القيمة</th>
              <th>التاريخ</th><th>الحالة</th><th style="width:60px"></th></tr></thead>
            <tbody>
              ${data.cheques.map((cheque) => `
                <tr>
                  <td dir="ltr" style="text-align:right">${esc(cheque.serial)}</td>
                  <td>${esc(cheque.student_name)}</td>
                  <td>${esc(cheque.halaqa_name || '—')}</td>
                  <td>${esc(cheque.items.map((item) => item.label).join(' + '))}</td>
                  <td class="num">${num(cheque.total)}</td>
                  <td>${dateAr(cheque.issued_at)}</td>
                  <td>${cheque.printed_at
    ? '<span class="chip chip--green">طُبع</span>'
    : '<span class="chip chip--orange">لم يُطبع</span>'}</td>
                  <td>${menu({
    name: 'more', label: '', className: 'btn btn--sm btn--ghost btn--icon',
    items: [
      menuItem({ label: 'إعادة الطباعة', name: 'print', attrs: `data-reprint="${cheque.id}"` }),
      menuItem({ label: 'إلغاء الشيك', name: 'trash', danger: true, attrs: `data-cancel="${cheque.id}"` })
    ]
  })}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>` : emptyState('لم يصدر أي شيك بعد', 'cheque')}
    </div>`;
}

function mountNamed({ content, refresh }) {
  const getSelected = bindStudentPicker(content, selected);
  const itemSelect = content.querySelector('[data-item]');
  const totalBox = content.querySelector('[data-total]');

  const updateTotal = () => {
    const option = findOption(itemSelect.value);
    const count = getSelected().length;
    totalBox.innerHTML = `قيمة الشيك ${nb(option.points)} ${esc(data.currency)} × ${nb(count)} طالب`
      + ` = ${nb(option.points * count)} ${esc(data.currency)}`;
  };

  itemSelect.onchange = () => { view.item = itemSelect.value; updateTotal(); };
  content.querySelector('[data-picker-list]').addEventListener('change', updateTotal);
  content.querySelector('[data-select-all]').addEventListener('click', () => setTimeout(updateTotal));
  content.querySelector('[data-select-none]').addEventListener('click', () => setTimeout(updateTotal));
  content.querySelector('[data-halaqa]').onchange = (event) => { view.halaqa = event.target.value; refresh(); };
  updateTotal();

  const issue = async (print) => {
    const studentIds = getSelected();
    if (!studentIds.length) return fail('اختر طالباً واحداً على الأقل');
    const option = findOption(itemSelect.value);
    try {
      const result = await api.post('/api/cheques', {
        type: option.type,
        items: [option.item],
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
    printUnprinted.onclick = () => printCheques(data.cheques.filter((cheque) => !cheque.printed_at).map((cheque) => cheque.id));
  }
}

export function mount(context) {
  context.content.querySelectorAll('[data-tab]').forEach((button) => {
    button.onclick = () => { view.tab = button.dataset.tab; context.refresh(); };
  });
  if (view.tab === 'blank') mountBlank(context); else mountNamed(context);
}
