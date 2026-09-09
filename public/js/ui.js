/** أدوات مشتركة لبناء الواجهة */
import { icon } from './icons.js';

export const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const num = (value) => Number(value || 0).toLocaleString('en-US');

/** رقم معزول اتجاهياً حتى لا تختلط الأرقام بالنص العربي حوله */
export const nb = (value) => `<bdi>${num(value)}</bdi>`;

export { icon };

export function dateAr(value, withTime = false) {
  if (!value) return '—';
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  if (withTime) { options.hour = '2-digit'; options.minute = '2-digit'; }
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', options).format(new Date(value));
}

export function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');
}

/** صورة الطالب أو الأحرف الأولى من اسمه */
export function avatar(person, size = '') {
  const cls = `avatar ${size}`.trim();
  if (person && person.photo) {
    return `<img class="${cls}" src="${esc(person.photo)}" alt="${esc(person.name)}" loading="lazy">`;
  }
  return `<span class="${cls}">${esc(initials(person && person.name))}</span>`;
}

export function rankBadge(rank) {
  return `<span class="rank-badge rank-${rank <= 3 ? rank : 'n'}">${rank}</span>`;
}

export function toast(message, type = '') {
  const host = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type ? `toast--${type}` : ''}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
  setTimeout(() => el.remove(), 3000);
}

export const ok = (message) => toast(message, 'ok');
export const fail = (message) => toast(message, 'err');

// ---------------------------------------------------------------------------
// القوائم المنسدلة للإجراءات
// ---------------------------------------------------------------------------

/**
 * عنصر داخل قائمة منسدلة. `attrs` نص سمات تُربط لاحقاً بالأحداث
 * (مثال: `data-print="12"`)، و`href` يجعله رابطاً.
 */
export function menuItem({ label, name = '', attrs = '', href = '', danger = false, target = '' }) {
  const inner = `${name ? icon(name, { size: 18 }) : ''}<span>${esc(label)}</span>`;
  const cls = danger ? 'danger' : '';
  return href
    ? `<a class="${cls}" href="${esc(href)}" ${target ? `target="${target}" rel="noopener"` : ''} ${attrs}>${inner}</a>`
    : `<button type="button" class="${cls}" ${attrs}>${inner}</button>`;
}

export const menuSep = () => '<span class="menu__sep"></span>';

/**
 * قائمة منسدلة: زر يفتح لوحة بالإجراءات. تُغلق تلقائياً عند اختيار إجراء
 * أو عند النقر خارجها (يُدار بمستمع واحد على مستوى الصفحة).
 */
export function menu({
  label = '', name = 'more', items = [], className = 'btn btn--sm btn--ghost', align = 'end', caret = null
} = {}) {
  const body = Array.isArray(items) ? items.join('') : items;
  const showCaret = caret === null ? Boolean(label) : caret;
  return `
    <div class="menu">
      <button type="button" class="${className}" data-menu-toggle aria-haspopup="true" aria-expanded="false"
              ${label ? '' : 'aria-label="خيارات"'}>
        ${name ? icon(name, { size: 18 }) : ''}${label ? `<span>${esc(label)}</span>` : ''}
        ${showCaret ? icon('chevron', { size: 14 }) : ''}
      </button>
      <div class="menu__panel ${align === 'start' ? 'menu__panel--start' : ''}" hidden>${body}</div>
    </div>`;
}

function closeMenus(except = null) {
  document.querySelectorAll('.menu__panel').forEach((panel) => {
    if (panel === except) return;
    panel.hidden = true;
    const toggle = panel.parentElement.querySelector('[data-menu-toggle]');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  });
}

document.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-menu-toggle]');
  if (toggle) {
    const panel = toggle.parentElement.querySelector('.menu__panel');
    const willOpen = panel.hidden;
    closeMenus(panel);
    panel.hidden = !willOpen;
    toggle.setAttribute('aria-expanded', String(willOpen));
    return;
  }
  // النقر على عنصر داخل القائمة يُغلقها بعد تنفيذ الإجراء
  closeMenus();
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenus(); });

// ---------------------------------------------------------------------------
// النوافذ المنبثقة
// ---------------------------------------------------------------------------

/**
 * نافذة منبثقة بسيطة. `render` يعيد HTML، و`onMount` يستقبل عنصر النافذة
 * ودالة الإغلاق لربط الأحداث.
 */
export function modal({ title, render, onMount, wide = false }) {
  const host = document.getElementById('modal-host');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="${wide ? 'width:min(880px,100%)' : ''}" role="dialog" aria-modal="true">
      <div class="modal__head">
        <h3>${esc(title)}</h3>
        <button class="modal__close" type="button" aria-label="إغلاق">${icon('close', { size: 18 })}</button>
      </div>
      <div class="modal__body">${typeof render === 'function' ? render() : render || ''}</div>
    </div>`;
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
  backdrop.querySelector('.modal__close').addEventListener('click', close);
  document.addEventListener('keydown', function onKey(event) {
    if (event.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });
  host.appendChild(backdrop);
  if (onMount) onMount(backdrop.querySelector('.modal'), close);
  return close;
}

export function confirmDialog(message, { confirmText = 'تأكيد', danger = true } = {}) {
  return new Promise((resolve) => {
    let decided = false;
    const close = modal({
      title: 'تأكيد',
      render: () => `
        <p>${esc(message)}</p>
        <div class="row" style="justify-content:flex-end">
          <button class="btn btn--ghost" data-no>إلغاء</button>
          <button class="btn ${danger ? 'btn--danger' : ''}" data-yes>${esc(confirmText)}</button>
        </div>`,
      onMount: (root, dismiss) => {
        root.querySelector('[data-no]').onclick = () => { decided = true; dismiss(); resolve(false); };
        root.querySelector('[data-yes]').onclick = () => { decided = true; dismiss(); resolve(true); };
      }
    });
    const observer = new MutationObserver(() => {
      if (!document.body.contains(document.querySelector('.modal-backdrop')) && !decided) {
        observer.disconnect(); resolve(false);
      }
    });
    observer.observe(document.getElementById('modal-host'), { childList: true });
    void close;
  });
}

export function emptyState(message, name = 'empty') {
  return `<div class="empty">${icon(name, { size: 40, stroke: 1.3 })}${esc(message)}</div>`;
}

export function spinner(message = 'جارِ التحميل…') {
  return `<div class="empty">${esc(message)}</div>`;
}

/** يحوّل نموذجاً إلى كائن بسيط */
export function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// ---------------------------------------------------------------------------
// الحقول والقوائم المنسدلة الجاهزة
// ---------------------------------------------------------------------------

/** قائمة منسدلة داخل شريط الأدوات: عنوان صغير فوق الحقل */
export function pick({ label, attrs = '', options = [], value = '', grow = false }) {
  return `
    <label class="pick ${grow ? 'pick--grow' : ''}">
      <span>${esc(label)}</span>
      <select ${attrs}>
        ${options.map((option) => `
          <option value="${esc(option.value)}" ${String(option.value) === String(value) ? 'selected' : ''}>
            ${esc(option.label)}
          </option>`).join('')}
      </select>
    </label>`;
}

/** حقل بحث بعنوان صغير */
export function searchPick({ label = 'بحث', attrs = '', value = '', placeholder = '' }) {
  return `
    <label class="pick pick--grow">
      <span>${esc(label)}</span>
      <input type="search" ${attrs} value="${esc(value)}" placeholder="${esc(placeholder)}">
    </label>`;
}

export const PERIODS = [
  { key: 'week', label: 'هذا الأسبوع' },
  { key: 'month', label: 'هذا الشهر' },
  { key: 'day', label: 'اليوم' },
  { key: 'all', label: 'منذ البداية' }
];

/** اختيار الفترة من قائمة منسدلة */
export function periodPick(active, attrs = 'data-period-select') {
  return pick({
    label: 'الفترة',
    attrs,
    value: active,
    options: PERIODS.map((p) => ({ value: p.key, label: p.label }))
  });
}

/** خيارات النقاط الجاهزة في القوائم المنسدلة (من فئة ٢٥) */
export const POINT_CHOICES = [25, 50, 75, 100, 125, 150, 200, 250];

/**
 * قائمة منسدلة لاختيار عدد النقاط، مع خيار «قيمة أخرى» يُظهر حقلاً رقمياً.
 * تُستعمل في منح النقاط وفي شاشة المسح.
 */
export function pointsPick({ label = 'عدد النقاط', name = 'points', value = 25, allowMinus = true, attrs = '' } = {}) {
  const choices = [...POINT_CHOICES];
  if (!choices.includes(Number(value))) choices.unshift(Number(value));
  const minus = allowMinus ? [-25, -50, -100] : [];
  return `
    <label class="pick pick--grow">
      <span>${esc(label)}</span>
      <select name="${esc(name)}" ${attrs}>
        ${choices.map((p) => `<option value="${p}" ${Number(p) === Number(value) ? 'selected' : ''}>${p} نقطة</option>`).join('')}
        ${minus.map((p) => `<option value="${p}">خصم ${Math.abs(p)} نقطة</option>`).join('')}
        <option value="custom">قيمة أخرى…</option>
      </select>
    </label>`;
}

/**
 * يربط قائمة النقاط بحقل «قيمة أخرى»: عند اختيار custom يظهر حقل رقمي
 * ويعيد `read()` القيمة النهائية.
 */
export function bindPointsPick(root, { selectName = 'points', customName = 'points_custom' } = {}) {
  const select = root.querySelector(`select[name="${selectName}"]`);
  const custom = root.querySelector(`[name="${customName}"]`);
  const sync = () => {
    const isCustom = select.value === 'custom';
    if (custom) custom.closest('.field, .pick').hidden = !isCustom;
    if (isCustom && custom) custom.focus();
  };
  select.addEventListener('change', sync);
  sync();
  return () => (select.value === 'custom' ? Number(custom && custom.value) : Number(select.value));
}
