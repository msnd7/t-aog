/** صفحة طباعة الشيكات: تجلب الشيكات المطلوبة وترسمها بصيغة قابلة للطباعة */
import { drawBarcode } from './barcode.js';

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (value) => Number(value || 0).toLocaleString('en-US');
const pad = (value) => String(value).padStart(2, '0');

/** تواريخ الشيك تُبنى يدوياً لتبقى بأرقام لاتينية ومرتبة داخل النص العربي */
const gregorianDate = (value) => {
  const date = new Date(value);
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
};

const hijriDate = (value) => {
  const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura',
    { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = (type) => (parts.find((item) => item.type === type) || {}).value || '';
  return `${part('year')}/${pad(part('month'))}/${pad(part('day'))}`;
};

const TYPE_TITLES = {
  attendance: 'شيك الحضور',
  recitation: 'شيك تسميع الورد اليومي',
  discipline: 'شيك الانضباط والأخلاق'
};

function chequeMarkup(cheque, settings) {
  const logo = settings.logo || '/img/logo.jpg';
  return `
    <article class="cheque cheque--${esc(cheque.type)}">
      <div class="watermark">${esc(settings.currency || 'ريال')}</div>
      <header class="cheque__head">
        <div class="cheque__brand">
          <img src="${esc(logo)}" alt="شعار المجمع">
          <div>
            <h1>${esc(settings.academy_name || 'مجمع رياض القرآن التعليمي')}</h1>
            <p>${esc(settings.academy_subtitle || '')}</p>
          </div>
        </div>
        <div class="cheque__type">
          <strong>${esc(TYPE_TITLES[cheque.type] || 'شيك تحفيزي')}</strong>
          <span>شيك تحفيزي لطلاب الحلقات</span>
        </div>
        <div class="cheque__serial">
          رقم الشيك: <b dir="ltr">${esc(cheque.serial)}</b><br>
          التاريخ: <b dir="ltr">${gregorianDate(cheque.issued_at)}</b> م<br>
          الموافق: <b dir="ltr">${hijriDate(cheque.issued_at)}</b> هـ
        </div>
      </header>

      <div class="cheque__body">
        <div class="cheque__main">
          <div class="pay-line">
            <span class="label">يُصرف للطالب /</span>
            <span class="value">${esc(cheque.student_name)}</span>
          </div>
          <div class="pay-line">
            <span class="label">الحلقة /</span>
            <span class="value sm">${esc(cheque.halaqa_name || '—')}</span>
            <span class="label">المعلم /</span>
            <span class="value sm">${esc(cheque.teacher_name || '—')}</span>
          </div>
          <div class="amount-row">
            <div class="amount-box"><bdi>${num(cheque.total)}</bdi> ${esc(cheque.currency || 'ريال')}</div>
            <div class="amount-words">فقط: ${esc(cheque.amount_words)}</div>
          </div>
          <div class="items">
            ${cheque.items.map((item) => `<span class="item-chip"><b>${esc(item.label)}</b> — <bdi>${num(item.points)}</bdi></span>`).join('')}
          </div>
        </div>
        <div class="cheque__side">
          ${cheque.student_photo ? `<img class="cheque__photo" src="${esc(cheque.student_photo)}" alt="">` : ''}
          <svg data-barcode="${esc(cheque.student_barcode || '')}"></svg>
          <div class="code">${esc(cheque.student_barcode || '')}</div>
        </div>
      </div>

      <footer class="cheque__foot">
        <div class="cheque__note">${esc(cheque.note || '')}</div>
        <div class="sign"><div class="line"></div><span>توقيع المعلم</span></div>
        <div class="sign"><div class="line"></div><span>توقيع المشرف</span></div>
      </footer>
    </article>`;
}

async function load() {
  const ids = new URLSearchParams(location.search).get('ids') || '';
  const sheet = document.getElementById('sheet');
  const info = document.getElementById('info');
  if (!ids) {
    sheet.innerHTML = '<div class="empty">لم تُحدَّد شيكات للطباعة</div>';
    return;
  }
  let payload;
  try {
    const response = await fetch(`/api/cheques/print?ids=${encodeURIComponent(ids)}`, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('تعذر تحميل الشيكات — تأكد من تسجيل الدخول');
    payload = await response.json();
  } catch (error) {
    sheet.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    return;
  }
  const { cheques, settings } = payload;
  if (!cheques.length) {
    sheet.innerHTML = '<div class="empty">لا توجد شيكات</div>';
    return;
  }
  sheet.innerHTML = cheques.map((cheque) => chequeMarkup(cheque, settings)).join('');
  sheet.querySelectorAll('svg[data-barcode]').forEach((svg) => {
    if (svg.dataset.barcode) drawBarcode(svg, svg.dataset.barcode, { height: 40, width: 1.5, fontSize: 0, displayValue: false, margin: 0 });
  });
  info.textContent = `عدد الشيكات: ${cheques.length} — القيمة الإجمالية: ${num(cheques.reduce((sum, c) => sum + c.total, 0))}`;

  document.getElementById('print').onclick = async () => {
    if (document.getElementById('mark-printed').checked) {
      try {
        await fetch('/api/cheques/printed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ ids: cheques.map((c) => c.id) })
        });
      } catch { /* الطباعة تتم حتى لو تعذّر التعليم */ }
    }
    window.print();
  };
  setTimeout(() => window.print(), 700);
}

load();
