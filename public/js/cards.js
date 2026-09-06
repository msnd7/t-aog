/** صفحة طباعة بطاقات الطلاب (بمقاس البطاقة البنكية) */
import { drawBarcode } from './barcode.js';
import { prettyCode } from './student-card.js';

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');

function cardMarkup(student, settings) {
  const logo = settings.logo || '/img/logo.jpg';
  return `
    <div class="card">
      <div class="card__head">
        <div class="card__brand">
          <img src="${esc(logo)}" alt="">
          <strong>${esc(settings.academy_name || 'مجمع رياض القرآن التعليمي')}</strong>
        </div>
        <span class="card__tag">بطاقة الطالب</span>
      </div>
      <div class="card__body">
        ${student.photo
      ? `<img class="card__photo" src="${esc(student.photo)}" alt="">`
      : `<span class="card__photo">${esc(initials(student.name))}</span>`}
        <div>
          <div class="card__name">${esc(student.name)}</div>
          <div class="card__halaqa">${esc(student.halaqa_name || 'بدون حلقة')}</div>
        </div>
      </div>
      <div class="card__scan">
        <svg data-barcode="${esc(student.barcode)}"></svg>
        <div class="card__code">${esc(prettyCode(student.barcode))}</div>
      </div>
    </div>`;
}

async function load() {
  const params = new URLSearchParams(location.search);
  const halaqa = params.get('halaqa');
  const ids = (params.get('ids') || '').split(',').map(Number).filter(Boolean);
  const box = document.getElementById('cards');
  const info = document.getElementById('info');

  let students = [];
  let settings = {};
  try {
    const [studentsRes, settingsRes] = await Promise.all([
      fetch(`/api/students?period=week${halaqa ? `&halaqa=${halaqa}` : ''}`, { credentials: 'same-origin' })
        .then((response) => {
          if (!response.ok) throw new Error('تعذر تحميل الطلاب — تأكد من تسجيل الدخول');
          return response.json();
        }),
      fetch('/api/settings', { credentials: 'same-origin' }).then((response) => response.json())
    ]);
    students = studentsRes.students;
    settings = settingsRes.settings || {};
  } catch (error) {
    box.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    return;
  }
  if (ids.length) students = students.filter((student) => ids.includes(student.id));
  students = students.filter((student) => student.barcode).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  if (!students.length) {
    box.innerHTML = '<div class="empty">لا توجد بطاقات للطباعة</div>';
    return;
  }

  box.innerHTML = students.map((student) => cardMarkup(student, settings)).join('');
  box.querySelectorAll('svg[data-barcode]').forEach((svg) => {
    drawBarcode(svg, svg.dataset.barcode, {
      height: 38, width: 1.6, displayValue: false, margin: 0, lineColor: '#0b2f56'
    });
  });
  info.textContent = `${students.length} بطاقة جاهزة للطباعة`;

  document.getElementById('guides').onchange = (event) => {
    box.classList.toggle('cut-guides', event.target.checked);
  };
  document.getElementById('print').onclick = () => window.print();
}

load();
