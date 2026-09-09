/** الإعدادات: بيانات المجمع، قيم الشيكات، حسابات المشرفين */
import { api } from '../api.js';
import { esc, ok, fail, modal, formValues, confirmDialog, icon, menu, menuItem, pick } from '../ui.js';

let cache = { settings: {}, staff: [] };
const view = { section: 'all' };

const SECTIONS = [
  { value: 'all', label: 'كل الأقسام' },
  { value: 'academy', label: 'بيانات المجمع والشاشة' },
  { value: 'cheques', label: 'قيم بنود الشيكات' },
  { value: 'staff', label: 'حسابات المشرفين' }
];

export async function render() {
  const [settingsRes, staffRes] = await Promise.all([api.get('/api/settings'), api.get('/api/settings/staff')]);
  cache = { settings: settingsRes.settings, staff: staffRes.staff };
  const s = cache.settings;

  return {
    title: 'الإعدادات',
    subtitle: 'ضبط المنصة وقيم النقاط وحسابات المشرفين',
    actions: `<button class="btn btn--sm btn--ghost" data-my-code>${icon('key', { size: 16 })} تغيير رمزي</button>`,
    html: `
      <div class="toolbar">
        ${pick({ label: 'قسم الإعدادات', attrs: 'data-section', value: view.section, options: SECTIONS, grow: true })}
      </div>
      <div class="grid cols-2">
        <div class="card" data-sec="academy">
          <div class="card__head"><div><h2>${icon('settings')} بيانات المجمع</h2><p>تظهر في الشاشات والشيكات</p></div></div>
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
            <div class="field">
              <label>الرمز المؤقت للحسابات الجديدة</label>
              <input name="default_code" inputmode="numeric" dir="ltr" pattern="\\d{4,6}" value="${esc(s.default_code || '1234')}">
              <span class="hint">يدخل به الطالب أو المشرف أول مرة، ثم تظهر له شاشة تغيير الرمز إجبارياً.</span>
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
            <button class="btn btn--ghost btn--sm" type="submit">${icon('upload', { size: 16 })} رفع الشعار</button>
          </form>
        </div>

        <div class="card" data-sec="cheques">
          <div class="card__head"><div><h2>${icon('cheque')} قيم بنود الشيكات</h2><p>بالنقاط/الريالات</p></div></div>
          <form id="cheque-form">
            <h3 class="section-title">${icon('cheque', { size: 18 })} شيك الحضور</h3>
            <div class="inline-fields">
              <div class="field"><label>الحضور المبكر</label><input name="cheque_attendance_early" type="number" step="5" value="${esc(s.cheque_attendance_early || 70)}"></div>
              <div class="field"><label>الحضور العام</label><input name="cheque_attendance_general" type="number" step="5" value="${esc(s.cheque_attendance_general || 50)}"></div>
            </div>
            <h3 class="section-title">${icon('cheque', { size: 18 })} شيك تسميع الورد اليومي</h3>
            <div class="inline-fields">
              <div class="field"><label>حفظ</label><input name="cheque_recitation_hifz" type="number" step="5" value="${esc(s.cheque_recitation_hifz || 25)}"></div>
              <div class="field"><label>مراجعة</label><input name="cheque_recitation_review" type="number" step="5" value="${esc(s.cheque_recitation_review || 25)}"></div>
              <div class="field"><label>حفظ ومراجعة</label><input name="cheque_recitation_both" type="number" step="5" value="${esc(s.cheque_recitation_both || 50)}"></div>
            </div>
            <h3 class="section-title">${icon('cheque', { size: 18 })} شيك الانضباط والأخلاق</h3>
            <div class="field"><label>قيمة الشيك</label><input name="cheque_discipline" type="number" step="5" value="${esc(s.cheque_discipline || 25)}"></div>
            <button class="btn" type="submit">حفظ القيم</button>
          </form>
        </div>
      </div>

      <div class="card mt" data-sec="staff">
        <div class="card__head">
          <div><h2>${icon('groups')} حسابات المشرفين</h2><p>من يستطيع الرصد وإصدار الشيكات</p></div>
          <button class="btn btn--sm" data-add-staff>${icon('plus', { size: 16 })} حساب جديد</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>الاسم</th><th>رقم الجوال</th><th>الصلاحية</th><th>الحالة</th><th></th></tr></thead>
            <tbody>
              ${cache.staff.map((user) => `
                <tr>
                  <td>${esc(user.name)}</td>
                  <td dir="ltr" style="text-align:right">${esc(user.phone || '—')}</td>
                  <td>${user.role === 'admin' ? 'مدير المنصة' : 'مشرف'}</td>
                  <td>${user.active
      ? (user.must_change_code ? '<span class="chip chip--orange">لم يغيّر الرمز</span>' : '<span class="chip chip--green">نشط</span>')
      : '<span class="chip chip--gray">معطل</span>'}</td>
                  <td>${menu({
    name: 'more', label: '', className: 'btn btn--sm btn--ghost btn--icon',
    items: [
      menuItem({ label: 'إعادة الرمز المؤقت', name: 'key', attrs: `data-reset="${user.id}"` }),
      menuItem({
        label: user.active ? 'تعطيل الحساب' : 'تفعيل الحساب',
        name: user.active ? 'lock' : 'check',
        danger: Boolean(user.active),
        attrs: `data-toggle="${user.id}" data-active="${user.active}"`
      })
    ]
  })}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`
  };
}

export function mount({ content, refresh }) {
  // قائمة منسدلة تعرض قسماً واحداً من الإعدادات لتبسيط الشاشة
  const sectionSelect = content.querySelector('[data-section]');
  const applySection = () => {
    view.section = sectionSelect.value;
    content.querySelectorAll('[data-sec]').forEach((box) => {
      box.hidden = view.section !== 'all' && box.dataset.sec !== view.section;
    });
  };
  sectionSelect.onchange = applySection;
  applySection();

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

function staffModal(onDone) {
  modal({
    title: 'حساب مشرف جديد',
    render: () => `
      <form id="staff-form">
        <div class="field"><label>الاسم</label><input name="name" required></div>
        <div class="field">
          <label>رقم الجوال (للدخول)</label>
          <input name="phone" inputmode="tel" dir="ltr" placeholder="05xxxxxxxx" required>
        </div>
        <div class="field"><label>الصلاحية</label>
          <select name="role"><option value="supervisor">مشرف</option><option value="admin">مدير المنصة</option></select>
        </div>
        <span class="hint">يدخل المشرف برقم جواله والرمز المؤقت، ثم يختار رمزه الخاص.</span>
        <button class="btn btn--block mt" type="submit">إضافة</button>
      </form>`,
    onMount: (root, close) => {
      root.querySelector('#staff-form').onsubmit = async (event) => {
        event.preventDefault();
        try {
          const result = await api.post('/api/settings/staff', formValues(event.target));
          close();
          ok(`تم إنشاء الحساب — الرمز المؤقت ${result.code}`);
          if (onDone) onDone();
        } catch (error) { fail(error.message); }
      };
    }
  });
}

/** تغيير رمز الدخول للمستخدم الحالي */
export function changeMyCodeModal(onDone) {
  modal({
    title: 'تغيير رمز الدخول',
    render: () => `
      <form id="code-form">
        <div class="field"><label>الرمز الحالي</label>
          <input name="current" inputmode="numeric" dir="ltr" class="code-input" maxlength="6" required></div>
        <div class="field"><label>الرمز الجديد</label>
          <input name="next" inputmode="numeric" dir="ltr" class="code-input" maxlength="6" minlength="4" required></div>
        <div class="field"><label>تأكيد الرمز الجديد</label>
          <input name="confirm" inputmode="numeric" dir="ltr" class="code-input" maxlength="6" minlength="4" required></div>
        <button class="btn btn--block" type="submit">حفظ الرمز</button>
      </form>`,
    onMount: (root, close) => {
      root.querySelector('#code-form').onsubmit = async (event) => {
        event.preventDefault();
        try {
          await api.post('/api/auth/code', formValues(event.target));
          ok('تم تغيير رمز الدخول');
          close();
          if (onDone) onDone();
        } catch (error) { fail(error.message); }
      };
    }
  });
}
