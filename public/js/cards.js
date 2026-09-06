/** طباعة بطاقات الباركود للطلاب (حلقة كاملة أو طلاب محددين) */
import { drawBarcode } from './barcode.js';

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
        .then((response) => { if (!response.ok) throw new Error('تعذر تحميل الطلاب — تأكد من تسجيل الدخول'); return response.json(); }),
      fetch('/api/settings', { credentials: 'same-origin' }).then((response) => response.json())
    ]);
    students = studentsRes.students;
    settings = settingsRes.settings || {};
  } catch (error) {
    box.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
    return;
  }
  if (ids.length) students = students.filter((student) => ids.includes(student.id));
  students = students.filter((student) => student.barcode);
  if (!students.length) {
    box.innerHTML = '<div class="empty">لا توجد بطاقات للطباعة</div>';
    return;
  }

  const logo = settings.logo || '/img/logo.jpg';
  box.innerHTML = students.map((student) => `
    <div class="card">
      <img class="logo" src="${esc(logo)}" alt="">
      <div>
        <div class="name">${esc(student.name)}</div>
        <div class="halaqa">${esc(student.halaqa_name || 'بدون حلقة')}</div>
      </div>
      <svg data-barcode="${esc(student.barcode)}"></svg>
      <div class="code">${esc(student.barcode)}</div>
    </div>`).join('');
  box.querySelectorAll('svg[data-barcode]').forEach((svg) => {
    drawBarcode(svg, svg.dataset.barcode, { height: 45, width: 1.7, displayValue: false, margin: 0 });
  });
  info.textContent = `${students.length} بطاقة جاهزة للطباعة`;
  document.getElementById('print').onclick = () => window.print();
}

load();
