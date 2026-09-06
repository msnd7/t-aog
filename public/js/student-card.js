/** بطاقة الطالب: تصميم موحّد للباركود في التطبيق وفي الطباعة */
import { drawBarcode } from './barcode.js';

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');

/** RQ00026 ← يُعرض كـ RQ 000 26 ليسهل نطقه وقراءته */
export function prettyCode(code) {
  const value = String(code || '');
  const match = value.match(/^([A-Za-z]+)(\d+)$/);
  if (!match) return value;
  return `${match[1]} ${match[2].replace(/(\d{3})(?=\d)/g, '$1 ')}`;
}

/**
 * بطاقة الطالب بتصميم بطاقة العضوية: شعار المجمع، صورة الطالب واسمه،
 * ولوحة بيضاء يظهر فيها الباركود بمساحة هدوء كافية للقارئ.
 */
export function studentCardMarkup(student, { logo = '/img/logo.jpg', academy = 'رياض القرآن', points = null, compact = false } = {}) {
  const code = student.barcode || '';
  return `
    <article class="id-card ${compact ? 'id-card--compact' : ''}" data-student-card="${esc(code)}">
      <header class="id-card__head">
        <div class="id-card__brand">
          <img src="${esc(logo)}" alt="">
          <span>${esc(academy)}</span>
        </div>
        <span class="id-card__tag">بطاقة الطالب</span>
      </header>

      <div class="id-card__body">
        ${student.photo
      ? `<img class="id-card__photo" src="${esc(student.photo)}" alt="">`
      : `<span class="id-card__photo">${esc(initials(student.name))}</span>`}
        <div class="id-card__id">
          <div class="id-card__name">${esc(student.name)}</div>
          <div class="id-card__meta">${esc(student.halaqa_name || 'بدون حلقة')}</div>
        </div>
        ${points === null ? '' : `
          <div class="id-card__points">
            <strong>${Number(points || 0).toLocaleString('en-US')}</strong>
            <span>نقطة</span>
          </div>`}
      </div>

      <div class="id-card__scan">
        <svg data-card-barcode="${esc(code)}" role="img" aria-label="باركود الطالب ${esc(code)}"></svg>
        <div class="id-card__code">${esc(prettyCode(code))}</div>
      </div>
    </article>`;
}

/** يرسم الباركود داخل كل بطاقة موجودة في الصفحة */
export function mountStudentCards(root = document, options = {}) {
  root.querySelectorAll('svg[data-card-barcode]').forEach((svg) => {
    const code = svg.dataset.cardBarcode;
    if (!code) return;
    drawBarcode(svg, code, {
      height: options.height || 58,
      width: options.width || 2,
      displayValue: false,
      margin: 0,
      background: '#ffffff',
      lineColor: '#0b2f56'
    });
  });
}

/**
 * وضع العرض للمسح: خلفية بيضاء وباركود كبير مع إبقاء الشاشة مضاءة،
 * وهو الوضع الذي يفتحه الطالب أمام قارئ المشرف.
 */
export function openScanMode(student) {
  const host = document.getElementById('modal-host');
  const layer = document.createElement('div');
  layer.className = 'scan-mode';
  layer.innerHTML = `
    <button class="scan-mode__close" type="button" aria-label="إغلاق">✕</button>
    <div class="scan-mode__inner">
      <div class="scan-mode__name">${esc(student.name)}</div>
      <div class="scan-mode__halaqa">${esc(student.halaqa_name || '')}</div>
      <div class="scan-mode__panel"><svg id="scan-mode-barcode"></svg></div>
      <div class="scan-mode__code">${esc(prettyCode(student.barcode))}</div>
      <p class="scan-mode__hint">قرّب البطاقة من قارئ المشرف · ارفع إضاءة الشاشة لأفضل قراءة</p>
    </div>`;
  host.appendChild(layer);

  const svg = layer.querySelector('#scan-mode-barcode');
  const draw = () => {
    const width = Math.min(layer.clientWidth - 48, 560);
    drawBarcode(svg, student.barcode, {
      height: Math.round(Math.min(window.innerHeight * 0.32, 220)),
      width: Math.max(2, Math.min(4.2, width / 130)),
      displayValue: false,
      margin: 0
    });
  };
  draw();
  window.addEventListener('resize', draw);

  // إبقاء الشاشة مضاءة أثناء المسح إن كان المتصفح يدعم ذلك
  let wakeLock = null;
  if (navigator.wakeLock) navigator.wakeLock.request('screen').then((lock) => { wakeLock = lock; }).catch(() => {});

  const close = () => {
    window.removeEventListener('resize', draw);
    if (wakeLock) wakeLock.release().catch(() => {});
    layer.remove();
  };
  layer.querySelector('.scan-mode__close').onclick = close;
  layer.addEventListener('click', (event) => { if (event.target === layer) close(); });
  document.addEventListener('keydown', function onKey(event) {
    if (event.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });
  return close;
}
