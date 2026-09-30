/** إعدادات المنصة: هوية المجمع المشتركة، والحسابات في كل المساجد */
import { api } from '../api.js';
import { esc, ok, fail, modal, formValues, confirmDialog, icon, menu, menuItem, pick } from '../ui.js';
import { changeMyCodeModal } from './settings.js';

let cache = { settings: {}, staff: [], mosques: [] };
const view = { mosque: 'all' };

export async function render() {
  const [settingsRes, staffRes, mosquesRes] = await Promise.all([
    api.get('/api/settings'), api.get('/api/settings/staff'), api.get('/api/mosques/public')
  ]);
  cache = { settings: settingsRes.settings, staff: staffRes.staff, mosques: mosquesRes.mosques };
  const s = cache.settings;
  const staff = cache.staff.filter((user) => view.mosque === 'all'
    || (view.mosque === 'admins' ? user.role === 'admin' : String(user.mosque_id) === view.mosque));

  return {
    title: 'الحسابات والإعدادات',
    subtitle: 'مشرفو المساجد وهوية المجمع المشتركة',
    actions: `<button class="btn btn--sm btn--ghost" data-my-code>${icon('key', { size: 16 })} تغيير رمزي</button>`,
    html: `
      <div class="card">
        <div class="card__head">
          <div><h2>${icon('groups')} حسابات المشرفين</h2><p>كل مشرف يتابع طلاب مسجده فقط، ومدير المنصة يرى كل المساجد</p></div>
          <button class="btn btn--sm" data-add-staff>${icon('plus', { size: 16 })} حساب جديد</button>
        </div>
        <div class="toolbar">
          ${pick({
    label: 'المسجد',
    attrs: 'data-filter-mosque',
    value: view.mosque,
    grow: true,
    options: [
      { value: 'all', label: 'كل الحسابات' },
      ...cache.mosques.map((m) => ({ value: String(m.id), label: m.name })),
      { value: 'admins', label: 'مديرو المنصة' }
    ]
  })}
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>الاسم</th><th>رقم الجوال</th><th>الصلاحية</th><th>المسجد</th><th>الحالة</th><th></th></tr></thead>
            <tbody>
              ${staff.map((user) => `
                <tr>
                  <td>${esc(user.name)}</td>
                  <td dir="ltr" style="text-align:right">${esc(user.phone || '—')}</td>
                  <td>${user.role === 'admin' ? 'مدير المنصة' : 'مشرف'}</td>
                  <td>${user.role === 'admin' ? '<span class="chip">كل المساجد</span>' : esc(user.mosque_name || '—')}</td>
                  <td>${user.active
      ? (user.must_change_code ? '<span class="chip chip--orange">لم يغيّر الرمز</span>' : '<span class="chip chip--green">نشط</span>')
      : '<span class="chip chip--gray">معطل</span>'}</td>
                  <td>${menu({
    name: 'more', label: '', className: 'btn btn--sm btn--ghost btn--icon',
    items: [
      ...(user.role === 'supervisor'
        ? [menuItem({ label: 'نقل إلى مسجد آخر', name: 'mosque', attrs: `data-move="${user.id}" data-mosque="${user.mosque_id || ''}"` })]
        : []),
      menuItem({ label: 'إعادة الرمز المؤقت', name: 'key', attrs: `data-reset="${user.id}"` }),
      menuItem({
        label: user.active ? 'تعطيل الحساب' : 'تفعيل الحساب',
        name: user.active ? 'lock' : 'check',
        danger: Boolean(user.active),
        attrs: `data-toggle="${user.id}" data-active="${user.active}"`
      })
    ]
  })}</td>
                </tr>`).join('') || '<tr><td colspan="6" class="muted">لا توجد حسابات</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card mt">
        <div class="card__head"><div><h2>${icon('settings')} هوية المجمع</h2><p>مشتركة بين كل المساجد: تظهر في الشاشات والشيكات والبطاقات</p></div></div>
        <form id="academy-form">
          <div class="field"><label>اسم المجمع</label><input name="academy_name" value="${esc(s.academy_name || '')}"></div>
          <div class="field"><label>العبارة التعريفية</label><input name="academy_subtitle" value="${esc(s.academy_subtitle || '')}"></div>
          <div class="field">
            <label>الرمز المؤقت للحسابات الجديدة</label>
            <input name="default_code" inputmode="numeric" dir="ltr" pattern="\\d{4,6}" value="${esc(s.default_code || '1234')}">
            <span class="hint">يدخل به الطالب أو المشرف أول مرة، ثم تظهر له شاشة تغيير الرمز إجبارياً.</span>
          </div>
          <button class="btn" type="submit">حفظ البيانات</button>
        </form>
        <div class="divider"></div>
        <form id="logo-form">
          <div class="field"><label>شعار المجمع</label><input type="file" name="logo" accept="image/*" required></div>
          <button class="btn btn--ghost btn--sm" type="submit">${icon('upload', { size: 16 })} رفع الشعار</button>
        </form>
        <p class="hint mt">قيم الشيكات ونقاط المسح وبداية الأسبوع خاصة بكل مسجد: تُضبط من «الإعدادات» داخل واجهة المسجد.</p>
      </div>`
  };
}

export function mount({ content, refresh }) {
  content.querySelector('[data-filter-mosque]').onchange = (event) => {
    view.mosque = event.target.value;
    refresh();
  };
  content.querySelector('#academy-form').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api.patch('/api/settings', formValues(event.target));
      ok('تم الحفظ');
      window.location.reload();
    } catch (error) { fail(error.message); }
  };
  content.querySelector('#logo-form').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api.upload('/api/settings/logo', new FormData(event.target));
      ok('تم رفع الشعار');
      window.location.reload();
    } catch (error) { fail(error.message); }
  };

  content.querySelector('[data-add-staff]').onclick = () => staffModal(refresh);
  content.querySelectorAll('[data-move]').forEach((button) => {
    button.onclick = () => moveModal(button.dataset.move, button.dataset.mosque, refresh);
  });
  content.querySelectorAll('[data-reset]').forEach((button) => {
    button.onclick = async () => {
      if (!await confirmDialog('إعادة رمز هذا الحساب إلى الرمز المؤقت؟', { confirmText: 'إعادة الرمز', danger: false })) return;
      try {
        const result = await api.post(`/api/settings/staff/${button.dataset.reset}/reset-code`, {});
        ok(`الرمز المؤقت الآن: ${result.code}`);
        refresh();
      } catch (error) { fail(error.message); }
    };
  });
  content.querySelectorAll('[data-toggle]').forEach((button) => {
    button.onclick = async () => {
      const active = button.dataset.active === '1';
      if (!await confirmDialog(active ? 'تعطيل هذا الحساب؟' : 'تفعيل هذا الحساب؟', { danger: active })) return;
      try {
        await api.patch(`/api/settings/staff/${button.dataset.toggle}`, { active: !active });
        ok('تم التحديث');
        refresh();
      } catch (error) { fail(error.message); }
    };
  });
  document.querySelector('[data-my-code]').onclick = () => changeMyCodeModal();
}

const mosqueOptions = (selected = '') => cache.mosques.map((m) =>
  `<option value="${m.id}" ${String(m.id) === String(selected) ? 'selected' : ''}>${esc(m.name)}</option>`).join('');

/** حساب جديد: مشرف لمسجد محدد، أو مدير منصة يرى كل المساجد */
function staffModal(onDone) {
  const preset = /^\d+$/.test(view.mosque) ? view.mosque : '';
  modal({
    title: 'حساب جديد',
    render: () => `
      <form id="staff-form">
        <div class="field"><label>الاسم</label><input name="name" required></div>
        <div class="field">
          <label>رقم الجوال (للدخول)</label>
          <input name="phone" inputmode="tel" dir="ltr" placeholder="05xxxxxxxx" required>
        </div>
        <div class="field"><label>الصلاحية</label>
          <select name="role"><option value="supervisor">مشرف مسجد</option><option value="admin">مدير المنصة (كل المساجد)</option></select>
        </div>
        <div class="field" data-mosque-field><label>المسجد</label>
          <select name="mosque_id" required>${mosqueOptions(preset)}</select>
        </div>
        <span class="hint">يدخل المشرف برقم جواله والرمز المؤقت، ثم يختار رمزه الخاص ويرى طلاب مسجده فقط.</span>
        <button class="btn btn--block mt" type="submit">إضافة</button>
      </form>`,
    onMount: (root, close) => {
      const form = root.querySelector('#staff-form');
      const mosqueField = root.querySelector('[data-mosque-field]');
      form.role.onchange = () => {
        const isAdminRole = form.role.value === 'admin';
        mosqueField.hidden = isAdminRole;
        form.mosque_id.required = !isAdminRole;
      };
      form.onsubmit = async (event) => {
        event.preventDefault();
        try {
          const values = formValues(event.target);
          if (values.role === 'admin') delete values.mosque_id;
          const result = await api.post('/api/settings/staff', values);
          close();
          ok(`تم إنشاء الحساب — الرمز المؤقت ${result.code}`);
          if (onDone) onDone();
        } catch (error) { fail(error.message); }
      };
    }
  });
}

function moveModal(userId, current, onDone) {
  modal({
    title: 'نقل المشرف إلى مسجد آخر',
    render: () => `
      <form id="move-form">
        <div class="field"><label>المسجد</label><select name="mosque_id" required>${mosqueOptions(current)}</select></div>
        <button class="btn btn--block mt" type="submit">حفظ</button>
      </form>`,
    onMount: (root, close) => {
      root.querySelector('#move-form').onsubmit = async (event) => {
        event.preventDefault();
        try {
          await api.patch(`/api/settings/staff/${userId}`, formValues(event.target));
          close();
          ok('تم نقل المشرف');
          if (onDone) onDone();
        } catch (error) { fail(error.message); }
      };
    }
  });
}
