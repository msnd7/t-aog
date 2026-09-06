/** شاشة المجموعات (الحلقات): ترتيب الحلقات ونقاطها وأعضاؤها */
import { api } from '../api.js';
import { esc, num, nb, avatar, rankBadge, emptyState, modal, formValues, ok, fail, periodTabs, dateAr } from '../ui.js';
import { awardPointsModal, printCards } from './shared.js';

const view = { period: 'week' };
let cache = { halaqat: [], detail: null };

export async function render({ params }) {
  const id = params[0] ? Number(params[0]) : null;
  if (id) return renderDetail(id);

  const data = await api.get(`/api/halaqat?period=${view.period}`);
  cache = { halaqat: data.halaqat, detail: null };
  const max = Math.max(1, ...data.halaqat.map((h) => h.period_points));

  return {
    title: 'المجموعات',
    subtitle: `ترتيب الحلقات · ${esc(data.period_label)}`,
    actions: `<button class="btn btn--sm" data-add-halaqa>➕ حلقة جديدة</button>`,
    html: `
      ${periodTabs(view.period)}
      ${data.halaqat.length ? `
        <div class="grid cols-2">
          ${data.halaqat.map((halaqa) => `
            <div class="card">
              <div class="card__head">
                <div class="row" style="gap:.6rem">
                  ${rankBadge(halaqa.rank)}
                  <div>
                    <h2>${esc(halaqa.name)}</h2>
                    <p>${esc(halaqa.teacher_name || 'بدون معلم')} · ${nb(halaqa.students_count)} طلاب</p>
                  </div>
                </div>
                <span class="points-pill">${num(halaqa.period_points)}</span>
              </div>
              <div class="progress"><span style="width:${Math.round((halaqa.period_points / max) * 100)}%"></span></div>
              <div class="row between mt">
                <span class="muted small">المعدل لكل طالب: ${nb(halaqa.average)} · الإجمالي: ${nb(halaqa.total_points)}</span>
                <div class="row">
                  <button class="btn btn--sm btn--green" data-bonus="${halaqa.id}">➕ نقاط للحلقة</button>
                  <a class="btn btn--sm btn--ghost" href="#/halaqat/${halaqa.id}">التفاصيل</a>
                </div>
              </div>
            </div>`).join('')}
        </div>` : emptyState('لم تُضف حلقات بعد', '👥')}`
  };
}

async function renderDetail(id) {
  const data = await api.get(`/api/halaqat/${id}?period=${view.period}`);
  cache = { ...cache, detail: data };
  return {
    title: data.halaqa.name,
    subtitle: `${data.halaqa.teacher_name || 'بدون معلم'} · ${num(data.members.length)} طالباً`,
    actions: `
      <button class="btn btn--sm btn--green" data-bonus="${data.halaqa.id}">➕ نقاط للحلقة</button>
      <button class="btn btn--sm btn--ghost" data-edit-halaqa="${data.halaqa.id}">✏️ تعديل</button>
      <button class="btn btn--sm btn--ghost" data-cards="${data.halaqa.id}">🖨️ بطاقات الباركود</button>
      <a class="btn btn--sm btn--ghost" href="#/halaqat">رجوع</a>`,
    html: `
      ${periodTabs(view.period)}
      <div class="grid cols-3">
        <div class="stat stat--green"><span class="stat__label">نقاط الفترة</span><span class="stat__value">${num(data.totals.points || 0)}</span></div>
        <div class="stat stat--blue"><span class="stat__label">ترتيب الحلقة</span><span class="stat__value">${data.totals.rank || '—'}</span></div>
        <div class="stat stat--orange"><span class="stat__label">المعدل لكل طالب</span><span class="stat__value">${num(data.totals.average || 0)}</span></div>
      </div>

      <div class="card mt">
        <div class="card__head"><div><h2>طلاب الحلقة</h2><p>مرتبون حسب نقاط الفترة</p></div></div>
        ${data.members.length ? `
          <div class="list">
            ${data.members.map((student) => `
              <a class="list__item" href="#/students/${student.id}" style="text-decoration:none;color:inherit">
                ${rankBadge(student.rank)}
                ${avatar(student)}
                <div style="flex:1"><strong>${esc(student.name)}</strong><span class="muted small">${esc(student.barcode || '')}</span></div>
                <span class="points-pill">${num(student.points)}</span>
              </a>`).join('')}
          </div>` : emptyState('لا يوجد طلاب في هذه الحلقة', '🎓')}
      </div>

      ${data.bonuses.length ? `
        <div class="card mt">
          <div class="card__head"><div><h2>نقاط أضافها المشرف للحلقة</h2></div></div>
          <div class="list">
            ${data.bonuses.map((bonus) => `
              <div class="list__item">
                <div style="flex:1"><strong>${esc(bonus.note || 'نقاط للحلقة')}</strong><span class="muted small">${dateAr(bonus.created_at, true)}</span></div>
                <span class="points-pill">${bonus.points > 0 ? '+' : ''}${num(bonus.points)}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}`
  };
}

export function mount({ content, refresh }) {
  content.querySelectorAll('[data-period]').forEach((button) => {
    button.onclick = () => { view.period = button.dataset.period; refresh(); };
  });
  document.querySelectorAll('[data-bonus]').forEach((button) => {
    button.onclick = () => awardPointsModal({ halaqaId: Number(button.dataset.bonus), halaqaOnly: true, onDone: refresh });
  });
  const addButton = document.querySelector('[data-add-halaqa]');
  if (addButton) addButton.onclick = () => halaqaModal(null, refresh);
  const editButton = document.querySelector('[data-edit-halaqa]');
  if (editButton) editButton.onclick = () => halaqaModal(cache.detail.halaqa, refresh);
  const cardsButton = document.querySelector('[data-cards]');
  if (cardsButton) cardsButton.onclick = () => printCards({ halaqaId: Number(cardsButton.dataset.cards) });
}

function halaqaModal(halaqa, onDone) {
  modal({
    title: halaqa ? 'تعديل الحلقة' : 'حلقة جديدة',
    render: () => `
      <form id="halaqa-form">
        <div class="field"><label>اسم الحلقة</label><input name="name" value="${esc(halaqa?.name || '')}" required></div>
        <div class="field"><label>اسم المعلم</label><input name="teacher_name" value="${esc(halaqa?.teacher_name || '')}"></div>
        <button class="btn btn--block" type="submit">حفظ</button>
      </form>`,
    onMount: (root, close) => {
      root.querySelector('#halaqa-form').onsubmit = async (event) => {
        event.preventDefault();
        const values = formValues(event.target);
        try {
          if (halaqa) await api.patch(`/api/halaqat/${halaqa.id}`, values);
          else await api.post('/api/halaqat', values);
          ok('تم الحفظ');
          close();
          if (onDone) onDone();
        } catch (error) { fail(error.message); }
      };
    }
  });
}
