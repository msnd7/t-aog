/**
 * صفحة طباعة باركودات الطلاب.
 * ثلاث كثافات تُختار من قائمة منسدلة: ملصق متوسط (٢٤ في الصفحة)،
 * ملصق مصغّر (٤٠ في الصفحة)، وبطاقة كاملة بالصورة (١٠ في الصفحة).
 */
import { drawBarcode } from './barcode.js';
import { prettyCode } from './student-card.js';

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nb = (value) => `<bdi>${Number(value || 0).toLocaleString('en-US')}</bdi>`;
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');

const LAYOUTS = {
  card: { perPage: 10, barcode: { height: 38, width: 1.6 } },
  label: { perPage: 24, barcode: { height: 46, width: 1.6 } },
  mini: { perPage: 40, barcode: { height: 34, width: 1.2 } }
};

const box = document.getElementById('cards');
const info = document.getElementById('info');
const layoutSelect = document.getElementById('layout');
const guides = document.getElementById('guides');

let students = [];
let settings = {};

function fullCard(student) {
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

function labelCard(student) {
  return `
    <div class="label">
      <div class="label__top">
        <span class="label__name">${esc(student.name)}</span>
        <span class="label__halaqa">${esc(student.halaqa_name || '')}</span>
      </div>
      <div class="label__scan">
        <svg data-barcode="${esc(student.barcode)}"></svg>
        <div class="label__code">${esc(student.barcode)}</div>
      </div>
    </div>`;
}

function draw() {
  const layout = LAYOUTS[layoutSelect.value] ? layoutSelect.value : 'label';
  const config = LAYOUTS[layout];
  box.className = `grid grid--${layout} ${guides.checked ? 'cut-guides' : ''}`;
  box.innerHTML = students.map((student) => (layout === 'card' ? fullCard(student) : labelCard(student))).join('');
  box.querySelectorAll('svg[data-barcode]').forEach((svg) => {
    drawBarcode(svg, svg.dataset.barcode, {
      ...config.barcode, displayValue: false, margin: 0, lineColor: '#0b2d3c'
    });
  });
  const pages = Math.ceil(students.length / config.perPage);
  info.innerHTML = `${nb(students.length)} باركود · ${nb(config.perPage)} في الصفحة · ${nb(pages)} صفحة للطباعة`;
}

async function load() {
  const params = new URLSearchParams(location.search);
  const halaqa = params.get('halaqa');
  const ids = (params.get('ids') || '').split(',').map(Number).filter(Boolean);
  if (params.get('layout') && LAYOUTS[params.get('layout')]) layoutSelect.value = params.get('layout');

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

  draw();
  layoutSelect.onchange = draw;
  guides.onchange = draw;
  document.getElementById('print').onclick = () => window.print();
}

load();
