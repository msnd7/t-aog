/** صفحة الطالب لدى المشرف: النقاط، الباركود، السجل والشيكات */
import { api } from '../api.js';
import { esc, num, nb, avatar, dateAr, emptyState, modal, formValues, ok, fail, confirmDialog } from '../ui.js';
import { studentCardMarkup, mountStudentCards, openScanMode } from '../student-card.js';
import { awardPointsModal, printCards, printCheques } from './shared.js';
import { chequeModal } from './students.js';

let current = null;

export async function render({ params, state }) {
  const id = Number(params[0]);
  const [data, halaqatRes] = await Promise.all([api.get(`/api/students/${id}`), api.get('/api/halaqat')]);
  current = { ...data, halaqat: halaqatRes.halaqat };
  const { student, wallet, rank, entries, cheques } = data;

  return {
    title: student.name,
    subtitle: `${student.halaqa_name || 'بدون حلقة'} · ${student.barcode || ''}${student.phone ? ` · ${student.phone}` : ''}`,
    actions: `
      <button class="btn btn--sm btn--green" data-award>➕ نقاط</button>
      <button class="btn btn--sm" data-cheque>🧾 شيك</button>
      <button class="btn btn--sm btn--ghost" data-edit>✏️ تعديل</button>`,
    html: `
      <div class="grid cols-2">
        <div class="card">
          <div class="row" style="gap:1rem">
            ${avatar(student, 'avatar--lg')}
            <div style="flex:1">
              <h2 style="margin:0">${esc(student.name)}</h2>
              <p class="muted small">${esc(student.halaqa_name || 'بدون حلقة')}${student.teacher_name ? ` · ${esc(student.teacher_name)}` : ''}</p>
              <div class="row">
                <span class="chip">ترتيب الأسبوع: ${rank.rank ? `<bdi>${rank.rank}</bdi> من <bdi>${rank.total}</bdi>` : '—'}</span>
                <span class="chip chip--green">${nb(data.week_points)} نقطة هذا الأسبوع</span>
              </div>
            </div>
          </div>
          <div class="grid cols-3 mt">
            <div class="stat stat--green"><span class="stat__label">الرصيد المتاح</span><span class="stat__value">${num(wallet.balance)}</span></div>
            <div class="stat stat--blue"><span class="stat__label">إجمالي المكتسب</span><span class="stat__value">${num(wallet.earned)}</span></div>
            <div class="stat stat--orange"><span class="stat__label">المستبدل</span><span class="stat__value">${num(wallet.spent)}</span></div>
          </div>
          <div class="row mt">
            <span class="muted small">رقم الجوال للدخول: <strong dir="ltr">${esc(student.phone || 'لم يُسجَّل')}</strong></span>
            ${student.must_change_code ? '<span class="chip chip--orange">لم يغيّر الرمز المؤقت بعد</span>' : ''}
            <span class="spacer"></span>
            <button class="btn btn--sm btn--ghost" data-reset-code>🔑 إعادة الرمز المؤقت</button>
            <button class="btn btn--sm btn--ghost" data-photo>🖼️ تغيير الصورة</button>
          </div>
        </div>

        <div class="card">
          <div class="card__head">
            <div><h2>بطاقة الطالب</h2><p>يُمسح الباركود لإضافة النقاط</p></div>
            <div class="row">
              <button class="btn btn--sm btn--ghost" data-scan-mode>🔍 عرض للمسح</button>
              <button class="btn btn--sm btn--ghost" data-print-card>🖨️ طباعة البطاقة</button>
            </div>
          </div>
          ${studentCardMarkup(student, {
        logo: state.settings.logo || '/img/logo.jpg',
        academy: state.settings.academy_name || 'رياض القرآن',
        points: wallet.balance
      })}
        </div>
      </div>

      <div class="grid cols-2 mt">
        <div class="card">
          <div class="card__head"><div><h2>سجل النقاط</h2><p>آخر ٨٠ حركة</p></div></div>
          ${entries.length ? `
            <div class="list">
              ${entries.map((entry) => `
                <div class="list__item">
                  <div style="flex:1">
                    <strong>${esc(entry.note || entry.category)}</strong>
                    <span class="muted small">${dateAr(entry.created_at, true)}${entry.cheque_serial ? ` · شيك ${esc(entry.cheque_serial)}` : ''}</span>
                  </div>
                  <span class="points-pill ${entry.points < 0 ? 'points-pill--minus' : ''}">${entry.points > 0 ? '+' : ''}${num(entry.points)}</span>
                  <button class="btn btn--sm btn--ghost" data-undo="${entry.id}" title="حذف الحركة">✕</button>
                </div>`).join('')}
            </div>` : emptyState('لا توجد حركات بعد', '📋')}
        </div>

        <div class="card">
          <div class="card__head"><div><h2>الشيكات</h2><p>الشيكات الصادرة للطالب</p></div></div>
          ${cheques.length ? `
            <div class="list">
              ${cheques.map((cheque) => `
                <div class="list__item">
                  <div style="flex:1">
                    <strong>${esc(cheque.items.map((i) => i.label).join(' + '))}</strong>
                    <span class="muted small">${esc(cheque.serial)} · ${dateAr(cheque.issued_at)}${cheque.printed_at ? ' · طُبع' : ''}</span>
                  </div>
                  <span class="chip chip--orange">${num(cheque.total)}</span>
                  <button class="btn btn--sm btn--ghost" data-print-cheque="${cheque.id}">🖨️</button>
                </div>`).join('')}
            </div>` : emptyState('لم يصدر أي شيك بعد', '🧾')}
        </div>
      </div>`
  };
}

export function mount({ content, refresh }) {
  mountStudentCards(content);
  const student = current.student;
  content.querySelector('[data-scan-mode]').onclick = () => openScanMode(student);

  document.querySelector('[data-award]').onclick = () => awardPointsModal({ students: [student], onDone: refresh });
  document.querySelector('[data-cheque]').onclick = () => chequeModal([student], refresh);
  document.querySelector('[data-edit]').onclick = () => editModal(student, current.halaqat, refresh);
  content.querySelector('[data-print-card]').onclick = () => printCards({ studentIds: [student.id] });
  content.querySelector('[data-photo]').onclick = () => photoModal(student, refresh);
  content.querySelector('[data-reset-code]').onclick = async () => {
    if (!await confirmDialog(`إعادة رمز ${student.name} إلى الرمز المؤقت؟ سيُطلب منه اختيار رمز جديد عند الدخول.`,
      { confirmText: 'إعادة الرمز', danger: false })) return;
    try {
      const result = await api.post(`/api/students/${student.id}/reset-code`, {});
      ok(`الرمز المؤقت الآن: ${result.code}`);
      refresh();
    } catch (error) { fail(error.message); }
  };

  content.querySelectorAll('[data-print-cheque]').forEach((button) => {
    button.onclick = () => printCheques([Number(button.dataset.printCheque)]);
  });
  content.querySelectorAll('[data-undo]').forEach((button) => {
    button.onclick = async () => {
      if (!await confirmDialog('حذف هذه الحركة وإرجاع نقاطها؟')) return;
      try {
        await api.del(`/api/points/${button.dataset.undo}`);
        ok('تم حذف الحركة');
        refresh();
      } catch (error) { fail(error.message); }
    };
  });
}

function editModal(student, halaqat, onDone) {
  modal({
    title: 'تعديل بيانات الطالب',
    render: () => `
      <form id="edit-form">
        <div class="field"><label>الاسم</label><input name="name" value="${esc(student.name)}" required></div>
        <div class="field">
          <label>الحلقة</label>
          <select name="halaqa_id">
            <option value="">بدون حلقة</option>
            ${halaqat.map((h) => `<option value="${h.id}" ${h.id === student.halaqa_id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>رقم الجوال (للدخول)</label>
          <input name="phone" inputmode="tel" dir="ltr" value="${esc(student.phone || '')}" placeholder="05xxxxxxxx">
        </div>
        <button class="btn btn--block" type="submit">حفظ</button>
      </form>`,
    onMount: (root, close) => {
      root.querySelector('#edit-form').onsubmit = async (event) => {
        event.preventDefault();
        try {
          await api.patch(`/api/students/${student.id}`, formValues(event.target));
          ok('تم الحفظ');
          close();
          if (onDone) onDone();
        } catch (error) { fail(error.message); }
      };
    }
  });
}

function photoModal(student, onDone) {
  modal({
    title: 'صورة الطالب',
    render: () => `
      <form id="photo-form">
        <div class="field">
          <label>اختر صورة</label>
          <input type="file" name="photo" accept="image/*" required>
        </div>
        <button class="btn btn--block" type="submit">رفع الصورة</button>
      </form>`,
    onMount: (root, close) => {
      root.querySelector('#photo-form').onsubmit = async (event) => {
        event.preventDefault();
        try {
          await api.upload(`/api/students/${student.id}/photo`, new FormData(event.target));
          ok('تم تحديث الصورة');
          close();
          if (onDone) onDone();
        } catch (error) { fail(error.message); }
      };
    }
  });
}
