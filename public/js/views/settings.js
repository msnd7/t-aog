/** الإعدادات: بيانات المجمع، قيم الشيكات، حسابات المشرفين */
import { api } from '../api.js';
import { esc, ok, fail, modal, formValues, confirmDialog } from '../ui.js';

let cache = { settings: {}, staff: [] };

export async function render() {
  const [settingsRes, staffRes] = await Promise.all([api.get('/api/settings'), api.get('/api/settings/staff')]);
  cache = { settings: settingsRes.settings, staff: staffRes.staff };
  const s = cache.settings;

  return {
    title: 'الإعدادات',
    subtitle: 'ضبط المنصة وقيم النقاط وحسابات المشرفين',
    actions: `<button class="btn btn--sm btn--ghost" data-my-password>🔑 كلمة مروري</button>`,
    html: `
      <div class="grid cols-2">
        <div class="card">
          <div class="card__head"><div><h2>بيانات المجمع</h2><p>تظهر في الشاشات والشيكات</p></div></div>
          <form id="academy-form">
            <div class="field"><label>اسم المجمع</label><input name="academy_name" value="${esc(s.academy_name || '')}"></div>
            <div class="field"><label>العبارة التعريفية</label><input name="academy_subtitle" value="${esc(s.academy_subtitle || '')}"></div>
            <div class="inline-fields">
              <div class="field"><label>مسمى العملة/النقاط</label><input name="currency" value="${esc(s.currency || 'ريال')}"></div>
              <div class="field"><label>بداية الأسبوع</label>
                <select name="week_start_day">
                  ${['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'].map((day, index) =>
      `<option value="${index}" ${String(s.week_start_day) === String(index) ? 'selected' : ''}>${day}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="inline-fields">
              <div class="field"><label>نقاط كل مسحة باركود</label><input name="scan_points" type="number" step="5" value="${esc(s.scan_points || 25)}"></div>
              <div class="field"><label>مهلة منع تكرار المسح (ثانية)</label><input name="scan_cooldown_seconds" type="number" value="${esc(s.scan_cooldown_seconds || 20)}"></div>
            </div>
            <div class="inline-fields">
              <div class="field"><label>مدة عرض كل شاشة (ثانية)</label><input name="screen_rotate_seconds" type="number" value="${esc(s.screen_rotate_seconds || 14)}"></div>
              <div class="field"><label>شاشة العرض بدون تسجيل دخول</label>
                <select name="public_screen">
                  <option value="1" ${s.public_screen !== '0' ? 'selected' : ''}>متاحة للجميع</option>
                  <option value="0" ${s.public_screen === '0' ? 'selected' : ''}>تتطلب تسجيل الدخول</option>
                </select>
              </div>
            </div>
            <button class="btn" type="submit">حفظ البيانات</button>
          </form>
          <div class="divider"></div>
          <form id="logo-form">
            <div class="field"><label>شعار المجمع</label><input type="file" name="logo" accept="image/*" required></div>
            <button class="btn btn--ghost btn--sm" type="submit">رفع الشعار</button>
          </form>
        </div>

        <div class="card">
          <div class="card__head"><div><h2>قيم بنود الشيكات</h2><p>بالنقاط/الريالات</p></div></div>
          <form id="cheque-form">
            <h3 style="font-size:1rem;color:var(--blue)">شيك الحضور</h3>
            <div class="inline-fields">
              <div class="field"><label>الحضور المبكر</label><input name="cheque_attendance_early" type="number" step="5" value="${esc(s.cheque_attendance_early || 70)}"></div>
              <div class="field"><label>الحضور العام</label><input name="cheque_attendance_general" type="number" step="5" value="${esc(s.cheque_attendance_general || 50)}"></div>
            </div>
            <h3 style="font-size:1rem;color:var(--green)">شيك تسميع الورد اليومي</h3>
            <div class="inline-fields">
              <div class="field"><label>حفظ</label><input name="cheque_recitation_hifz" type="number" step="5" value="${esc(s.cheque_recitation_hifz || 25)}"></div>
              <div class="field"><label>مراجعة</label><input name="cheque_recitation_review" type="number" step="5" value="${esc(s.cheque_recitation_review || 25)}"></div>
              <div class="field"><label>حفظ ومراجعة</label><input name="cheque_recitation_both" type="number" step="5" value="${esc(s.cheque_recitation_both || 50)}"></div>
            </div>
            <h3 style="font-size:1rem;color:var(--orange)">شيك الانضباط والأخلاق</h3>
            <div class="field"><label>قيمة الشيك</label><input name="cheque_discipline" type="number" step="5" value="${esc(s.cheque_discipline || 25)}"></div>
            <button class="btn" type="submit">حفظ القيم</button>
          </form>
        </div>
      </div>

      <div class="card mt">
        <div class="card__head">
          <div><h2>حسابات المشرفين</h2><p>من يستطيع الرصد وإصدار الشيكات</p></div>
          <button class="btn btn--sm" data-add-staff>➕ حساب جديد</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>الاسم</th><th>اسم المستخدم</th><th>الصلاحية</th><th>الحالة</th><th></th></tr></thead>
            <tbody>
              ${cache.staff.map((user) => `
                <tr>
                  <td>${esc(user.name)}</td>
                  <td>${esc(user.username)}</td>
                  <td>${user.role === 'admin' ? 'مدير المنصة' : 'مشرف'}</td>
                  <td>${user.active ? '<span class="chip chip--green">نشط</span>' : '<span class="chip chip--gray">معطل</span>'}</td>
                  <td class="row" style="gap:.3rem">
                    <button class="btn btn--sm btn--ghost" data-reset="${user.id}">كلمة المرور</button>
                    <button class="btn btn--sm btn--ghost" data-toggle="${user.id}" data-active="${user.active}">${user.active ? 'تعطيل' : 'تفعيل'}</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`
  };
}

export function mount({ content, refresh }) {
  const save = async (form) => {
    try {
      await api.patch('/api/settings', formValues(form));
      ok('تم الحفظ');
      refresh();
    } catch (error) { fail(error.message); }
  };
  content.querySelector('#academy-form').onsubmit = (event) => { event.preventDefault(); save(event.target); };
  content.querySelector('#cheque-form').onsubmit = (event) => { event.preventDefault(); save(event.target); };
  content.querySelector('#logo-form').onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api.upload('/api/settings/logo', new FormData(event.target));
      ok('تم رفع الشعار');
      window.location.reload();
    } catch (error) { fail(error.message); }
  };

  content.querySelector('[data-add-staff]').onclick = () => staffModal(refresh);
  content.querySelectorAll('[data-reset]').forEach((button) => {
    button.onclick = () => passwordModal(button.dataset.reset);
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

  document.querySelector('[data-my-password]').onclick = () => {
    modal({
      title: 'تغيير كلمة مروري',
      render: () => `
        <form id="mine-form">
          <div class="field"><label>كلمة المرور الحالية</label><input type="password" name="current" required></div>
          <div class="field"><label>كلمة المرور الجديدة</label><input type="password" name="next" required minlength="4"></div>
          <button class="btn btn--block" type="submit">حفظ</button>
        </form>`,
      onMount: (root, close) => {
        root.querySelector('#mine-form').onsubmit = async (event) => {
          event.preventDefault();
          try {
            await api.post('/api/auth/password', formValues(event.target));
            ok('تم تغيير كلمة المرور');
            close();
          } catch (error) { fail(error.message); }
        };
      }
    });
  };
}

function staffModal(onDone) {
  modal({
    title: 'حساب مشرف جديد',
    render: () => `
      <form id="staff-form">
        <div class="field"><label>الاسم</label><input name="name" required></div>
        <div class="field"><label>اسم المستخدم</label><input name="username" required inputmode="latin"></div>
        <div class="field"><label>كلمة المرور</label><input name="password" required minlength="4"></div>
        <div class="field"><label>الصلاحية</label>
          <select name="role"><option value="supervisor">مشرف</option><option value="admin">مدير المنصة</option></select>
        </div>
        <button class="btn btn--block" type="submit">إضافة</button>
      </form>`,
    onMount: (root, close) => {
      root.querySelector('#staff-form').onsubmit = async (event) => {
        event.preventDefault();
        try {
          await api.post('/api/settings/staff', formValues(event.target));
          ok('تم إنشاء الحساب');
          close();
          if (onDone) onDone();
        } catch (error) { fail(error.message); }
      };
    }
  });
}

function passwordModal(id) {
  modal({
    title: 'كلمة مرور جديدة',
    render: () => `
      <form id="reset-form">
        <div class="field"><label>كلمة المرور الجديدة</label><input name="password" required minlength="4"></div>
        <button class="btn btn--block" type="submit">حفظ</button>
      </form>`,
    onMount: (root, close) => {
      root.querySelector('#reset-form').onsubmit = async (event) => {
        event.preventDefault();
        try {
          await api.patch(`/api/settings/staff/${id}`, formValues(event.target));
          ok('تم تغيير كلمة المرور');
          close();
        } catch (error) { fail(error.message); }
      };
    }
  });
}
