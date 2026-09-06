/** أدوات مشتركة لبناء الواجهة */
export const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const num = (value) => Number(value || 0).toLocaleString('en-US');

/** رقم معزول اتجاهياً حتى لا تختلط الأرقام بالنص العربي حوله */
export const nb = (value) => `<bdi>${num(value)}</bdi>`;

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
        <button class="modal__close" type="button" aria-label="إغلاق">✕</button>
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

export function emptyState(message, icon = '📭') {
  return `<div class="empty"><span class="ic">${icon}</span>${esc(message)}</div>`;
}

export function spinner(message = 'جارِ التحميل…') {
  return `<div class="empty">${esc(message)}</div>`;
}

/** يحوّل نموذجاً إلى كائن بسيط */
export function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export const PERIODS = [
  { key: 'week', label: 'الأسبوع' },
  { key: 'month', label: 'الشهر' },
  { key: 'day', label: 'اليوم' },
  { key: 'all', label: 'الكل' }
];

export function periodTabs(active) {
  return `<div class="tabs" data-periods>${PERIODS.map((p) =>
    `<button type="button" data-period="${p.key}" class="${p.key === active ? 'active' : ''}">${p.label}</button>`
  ).join('')}</div>`;
}
