/** لوحة مدير المنصة: بيانات كل المساجد، والدخول إلى واجهة أي مسجد */
import { api } from '../api.js';
import { enterMosque } from '../app.js';
import {
  esc, num, nb, avatar, rankBadge, emptyState, icon, menu, menuItem, modal, formValues, ok, fail, confirmDialog
} from '../ui.js';

export async function render() {
  const data = await api.get('/api/mosques');
  const t = data.totals;
  const active = data.mosques.filter((m) => m.active);

  return {
    title: 'لوحة المنصة',
    subtitle: `كل المساجد · ${esc(data.period_label)}`,
    actions: `<button class="btn btn--sm" type="button" data-add-mosque>${icon('plus', { size: 16 })} مسجد جديد</button>`,
    html: `
      <div class="grid cols-4">
        <div class="stat stat--blue">
          <span class="stat__label">${icon('mosque', { size: 16 })} المساجد</span>
          <span class="stat__value">${num(active.length)}</span>
          <span class="stat__hint">${nb(t.halaqat)} حلقة · ${nb(t.supervisors)} مشرف</span>
        </div>
        <div class="stat stat--green">
          <span class="stat__label">${icon('students', { size: 16 })} الطلاب</span>
          <span class="stat__value">${num(t.students)}</span>
          <span class="stat__hint">في كل المساجد</span>
        </div>
        <div class="stat stat--gold">
          <span class="stat__label">${icon('points', { size: 16 })} نقاط ${esc(data.period_label)}</span>
          <span class="stat__value">${num(t.week_points)}</span>
          <span class="stat__hint">${nb(t.month_points)} هذا الشهر · ${nb(t.week_cheques)} شيك هذا الأسبوع</span>
        </div>
        <div class="stat stat--orange">
          <span class="stat__label">${icon('gift', { size: 16 })} طلبات المتجر</span>
          <span class="stat__value">${num(t.pending_orders)}</span>
          <span class="stat__hint">بانتظار التسليم</span>
        </div>
      </div>

      <div class="grid cols-3 mt">
        ${data.mosques.map(mosqueCard).join('')}
      </div>

      <div class="grid cols-2 mt">
        <div class="card">
          <div class="card__head">
            <div><h2>${icon('list')} مقارنة المساجد</h2><p>النقاط المكتسبة لكل مسجد</p></div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>المسجد</th><th>الطلاب</th><th>هذا الأسبوع</th><th>هذا الشهر</th><th>منذ البداية</th></tr></thead>
              <tbody>
                ${data.mosques.map((m) => `
                  <tr>
                    <td><strong>${esc(m.name)}</strong>${m.active ? '' : ' <span class="chip chip--gray">معطل</span>'}</td>
                    <td>${nb(m.students)}</td>
                    <td>${nb(m.week_points)}</td>
                    <td>${nb(m.month_points)}</td>
                    <td>${nb(m.total_points)}</td>
                  </tr>`).join('')}
                <tr>
                  <td><strong>المجموع</strong></td>
                  <td><strong>${nb(t.students)}</strong></td>
                  <td><strong>${nb(t.week_points)}</strong></td>
                  <td><strong>${nb(t.month_points)}</strong></td>
                  <td><strong>${nb(t.total_points)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card__head">
            <div><h2>${icon('trophy')} الأعلى نقاطاً في كل المساجد</h2><p>${esc(data.period_label)}</p></div>
          </div>
          ${data.top_students.length ? `
            <div class="list">
              ${data.top_students.map((student) => `
                <div class="list__item">
                  ${rankBadge(student.rank)}
                  ${avatar(student)}
                  <div style="flex:1">
                    <strong>${esc(student.name)}</strong>
                    <span class="muted small">${esc(student.mosque_name || '')}${student.halaqa_name ? ` · ${esc(student.halaqa_name)}` : ''}</span>
                  </div>
                  <span class="points-pill">${num(student.points)}</span>
                </div>`).join('')}
            </div>` : emptyState('لم تُرصد نقاط هذا الأسبوع بعد', 'trophy')}
        </div>
      </div>`
  };
}

function mosqueCard(m) {
  return `
    <div class="card mosque-card ${m.active ? '' : 'mosque-card--off'}">
      <div class="mosque-card__head">
        <span class="mosque-card__icon">${icon('mosque', { size: 24 })}</span>
        <div style="flex:1">
          <h2>${esc(m.name)}</h2>
          <p>${m.active ? `${nb(m.halaqat)} حلقة · ${nb(m.supervisors)} مشرف` : 'معطل — لا يدخله مشرفوه وطلابه'}</p>
        </div>
        ${menu({
    name: 'more', label: '', className: 'btn btn--sm btn--ghost btn--icon',
    items: [
      menuItem({ label: 'تعديل الاسم', name: 'edit', attrs: `data-rename="${m.id}" data-name="${esc(m.name)}"` }),
      menuItem({ label: 'شاشة العرض', name: 'screen', href: `/screen.html?mosque=${m.id}`, target: '_blank' }),
      menuItem({
        label: m.active ? 'تعطيل المسجد' : 'تفعيل المسجد',
        name: m.active ? 'lock' : 'check',
        danger: Boolean(m.active),
        attrs: `data-toggle-mosque="${m.id}" data-active="${m.active}"`
      })
    ]
  })}
      </div>
      <div class="mosque-card__stats">
        <div><b>${num(m.students)}</b><span>طالب</span></div>
        <div><b>${num(m.week_points)}</b><span>نقاط الأسبوع</span></div>
        <div><b>${num(m.pending_orders)}</b><span>طلب معلّق</span></div>
      </div>
      <div class="mosque-card__awards">
        <div>${icon('medal', { size: 16 })} فارس الأسبوع:
          <strong>${m.knight ? `${esc(m.knight.name)} (${nb(m.knight.points)})` : '—'}</strong></div>
        <div>${icon('groups', { size: 16 })} حلقة الأسبوع:
          <strong>${m.halaqa_of_week ? `${esc(m.halaqa_of_week.name)} (${nb(m.halaqa_of_week.points)})` : '—'}</strong></div>
      </div>
      <div class="mosque-card__actions">
        <button class="btn" type="button" data-enter="${m.id}">${icon('back', { size: 16 })} دخول واجهة المسجد</button>
      </div>
    </div>`;
}

export function mount({ content, refresh }) {
  content.querySelectorAll('[data-enter]').forEach((button) => {
    button.onclick = () => enterMosque(Number(button.dataset.enter));
  });
  content.querySelectorAll('[data-rename]').forEach((button) => {
    button.onclick = () => mosqueModal({ id: button.dataset.rename, name: button.dataset.name }, refresh);
  });
  content.querySelectorAll('[data-toggle-mosque]').forEach((button) => {
    button.onclick = async () => {
      const active = button.dataset.active === '1';
      const question = active
        ? 'تعطيل هذا المسجد؟ لن يستطيع مشرفوه وطلابه الدخول، وتبقى بياناته محفوظة.'
        : 'تفعيل هذا المسجد؟';
      if (!await confirmDialog(question, { danger: active })) return;
      try {
        await api.patch(`/api/mosques/${button.dataset.toggleMosque}`, { active: !active });
        ok('تم التحديث');
        refresh();
      } catch (error) { fail(error.message); }
    };
  });
  const add = document.querySelector('[data-add-mosque]');
  if (add) add.onclick = () => mosqueModal(null, refresh);
}

/** إضافة مسجد جديد أو تعديل اسمه */
function mosqueModal(mosque, onDone) {
  modal({
    title: mosque ? 'تعديل اسم المسجد' : 'مسجد جديد',
    render: () => `
      <form id="mosque-form">
        <div class="field"><label>اسم المسجد</label>
          <input name="name" required value="${esc(mosque ? mosque.name : '')}" placeholder="جامع …"></div>
        ${mosque ? '' : '<span class="hint">يبدأ المسجد الجديد بواجهة كاملة فارغة: أضف حلقاته ومشرفيه من داخله.</span>'}
        <button class="btn btn--block mt" type="submit">${mosque ? 'حفظ' : 'إضافة المسجد'}</button>
      </form>`,
    onMount: (root, close) => {
      root.querySelector('#mosque-form').onsubmit = async (event) => {
        event.preventDefault();
        try {
          const values = formValues(event.target);
          if (mosque) await api.patch(`/api/mosques/${mosque.id}`, values);
          else await api.post('/api/mosques', values);
          close();
          ok(mosque ? 'تم تعديل الاسم' : 'تمت إضافة المسجد');
          if (onDone) onDone();
        } catch (error) { fail(error.message); }
      };
    }
  });
}
