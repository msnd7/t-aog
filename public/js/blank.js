/**
 * صفحة طباعة الشيكات الفارغة: تجلب دفعة الشيكات وترسمها خمسة في كل صفحة A4،
 * الاسم والتوقيع فارغان ليكتبهما المعلم، وفيها الباركود وقيمة الشيك بالنقاط.
 */
import { drawBarcode } from './barcode.js';

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (value) => Number(value || 0).toLocaleString('en-US');
const nb = (value) => `<bdi>${num(value)}</bdi>`;
const pad = (value) => String(value).padStart(2, '0');

const gregorianDate = (value) => {
  const date = new Date(value);
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
};

const params = new URLSearchParams(location.search);
const sheet = document.getElementById('sheet');
const info = document.getElementById('info');
const perPageSelect = document.getElementById('per-page');
const halaqaSelect = document.getElementById('show-halaqa');

let vouchers = [];
let settings = {};

function chequeMarkup(voucher, showHalaqa) {
  const logo = settings.logo || '/img/logo.jpg';
  return `
    <article class="bcheque bcheque--${esc(voucher.type)}">
      <div class="bcheque__main">
        <header class="bcheque__head">
          <img src="${esc(logo)}" alt="">
          <div class="bcheque__academy">
            <strong>${esc(settings.academy_name || 'مجمع رياض القرآن التعليمي')}</strong>
            <span>${esc(settings.academy_subtitle || '')}</span>
          </div>
          <span class="bcheque__title">${esc(voucher.book_title)} — ${esc(voucher.item_label)}</span>
        </header>

        <div class="bcheque__lines">
          <div class="bline">
            <span class="label">يُصرف للطالب /</span>
            <span class="blank"></span>
          </div>
          <div class="bline">
            ${showHalaqa ? '<span class="label">الحلقة /</span><span class="blank blank--sm"></span>' : ''}
            <span class="label">التاريخ /</span>
            <span class="blank blank--sm"></span>
          </div>
        </div>

        <footer class="bcheque__foot">
          <div class="bcheque__note">
            ${esc(voucher.note || voucher.amount_words || '')}
          </div>
          <div class="bcheque__sign">
            <div class="line"></div>
            <span>توقيع المعلم</span>
          </div>
        </footer>
      </div>

      <aside class="bcheque__side">
        <div class="bcheque__amount">
          <b>${num(voucher.points)}</b>
          <span>${esc(voucher.currency || 'ريال')}</span>
        </div>
        <div class="bcheque__barcode">
          <svg data-barcode="${esc(voucher.code)}"></svg>
          <div class="bcheque__code">${esc(voucher.code)}</div>
        </div>
        <div class="bcheque__hint">يُمسح الباركود ثم بطاقة الطالب</div>
      </aside>
    </article>`;
}

function draw() {
  const perPage = Number(perPageSelect.value) || 5;
  const showHalaqa = halaqaSelect.value === '1';
  const pages = [];
  for (let i = 0; i < vouchers.length; i += perPage) pages.push(vouchers.slice(i, i + perPage));

  sheet.innerHTML = pages.map((page) => `
    <section class="page page--${perPage}">
      ${page.map((voucher) => chequeMarkup(voucher, showHalaqa)).join('')}
    </section>`).join('');

  sheet.querySelectorAll('svg[data-barcode]').forEach((svg) => {
    drawBarcode(svg, svg.dataset.barcode, {
      height: perPage >= 6 ? 34 : 42, width: 1.7, displayValue: false, margin: 0, lineColor: '#0b2d3c'
    });
  });

  const first = vouchers[0];
  info.innerHTML = `${nb(vouchers.length)} شيك فارغ · ${esc(first.book_title)} — ${esc(first.item_label)}
    <span>قيمة الشيك ${nb(first.points)} ${esc(first.currency || 'ريال')} · ${nb(pages.length)} صفحة
      · دفعة <bdi>${esc(first.batch)}</bdi> · <bdi>${gregorianDate(first.created_at)}</bdi></span>`;
}

async function load() {
  const query = params.get('batch')
    ? `batch=${encodeURIComponent(params.get('batch'))}`
    : `ids=${encodeURIComponent(params.get('ids') || '')}`;
  if (!params.get('batch') && !params.get('ids')) {
    sheet.innerHTML = '<div class="empty">لم تُحدَّد شيكات للطباعة</div>';
    return;
  }
  try {
    const response = await fetch(`/api/cheques/vouchers/print?${query}`, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('تعذر تحميل الشيكات — تأكد من تسجيل الدخول');
    const payload = await response.json();
    vouchers = payload.vouchers;
    settings = payload.settings || {};
  } catch (error) {
    sheet.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    return;
  }
  if (!vouchers.length) {
    sheet.innerHTML = '<div class="empty">لا توجد شيكات في هذه الدفعة</div>';
    return;
  }

  draw();
  perPageSelect.onchange = draw;
  halaqaSelect.onchange = draw;

  document.getElementById('print').onclick = async () => {
    if (document.getElementById('mark-printed').checked) {
      try {
        await fetch('/api/cheques/vouchers/printed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(params.get('batch')
            ? { batch: params.get('batch') }
            : { ids: vouchers.map((v) => v.id) })
        });
      } catch { /* الطباعة تتم حتى لو تعذّر التعليم */ }
    }
    window.print();
  };
  setTimeout(() => window.print(), 800);
}

load();
