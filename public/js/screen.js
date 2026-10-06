/**
 * شاشة العرض: تتنقل تلقائياً بين فارس الأسبوع وحلقة الأسبوع، ثم فارس الفترة
 * ومنصة التتويج والصدارة بنقاط الفترة منذ بدايتها.
 */
import { icon } from './icons.js';

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (value) => Number(value || 0).toLocaleString('en-US');
const nb = (value) => `<bdi>${num(value)}</bdi>`;
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('');

const stage = document.getElementById('stage');
const dots = document.getElementById('dots');
const progress = document.querySelector('.progress-line span');

let data = null;

/**
 * المسجد المعروض: من الرابط (?mosque=2)، وإلا آخر مسجد اختير على هذا الجهاز،
 * وإلا مسجد المشرف المسجِّل دخوله (يحدده الخادم)، وإلا تظهر قائمة اختيار المسجد.
 */
const STORE_KEY = 'rq_screen_mosque';
const fromUrl = new URLSearchParams(location.search).get('mosque');
let mosqueId = fromUrl;
if (!mosqueId) {
  try { mosqueId = localStorage.getItem(STORE_KEY); } catch { /* التخزين غير متاح */ }
}
function remember(id) {
  try { if (id) localStorage.setItem(STORE_KEY, String(id)); else localStorage.removeItem(STORE_KEY); } catch { /* لا شيء */ }
}
let slides = [];
let index = 0;
let timer = null;
let rotateSeconds = 14;

function photo(person, cls = '') {
  return person && person.photo
    ? `<img class="${cls}" src="${esc(person.photo)}" alt="${esc(person.name)}">`
    : `<span class="${cls} ph">${esc(initials(person && person.name))}</span>`;
}

const title = (name, text) => `<h2 class="slide__title">${icon(name, { size: 44, stroke: 1.6 })}<span class="ttl">${esc(text)}</span></h2>`;

/** عناوين الجائزتين حسب الفترة المختارة في إعدادات الشاشة (أسبوع، شهر، من تاريخ، كل الأيام) */
const titles = () => data.titles || { knight: 'فارس الأسبوع', halaqa: 'حلقة الأسبوع' };

/**
 * شريحة الفارس: صورته ونقاطه، مع الوصيفين إن مُرّروا،
 * وسطر إضافي (extra) لنقاطه منذ بداية فترة الشاشة في شريحة فارس الأسبوع.
 */
function knightSlide(knight, { heading, sub, runners = [], extra = '' }) {
  if (!knight) return null;
  return () => `
    <div class="slide">
      ${title('medal', heading)}
      <p class="slide__sub">${esc(sub)}</p>
      <div class="knight">
        <div class="knight__frame">
          ${knight.photo
    ? `<img class="knight__photo" src="${esc(knight.photo)}" alt="${esc(knight.name)}">`
    : `<div class="knight__photo">${esc(initials(knight.name))}</div>`}
        </div>
        <div>
          <div class="knight__name">${esc(knight.name)}</div>
          <div class="knight__meta">${esc(knight.halaqa_name || '')}</div>
          <div class="knight__points">${icon('star', { size: 26 })} ${nb(knight.points)} نقطة</div>
          ${extra}
          ${runners.length ? `
            <div class="runners">
              ${runners.map((student) => `
                <div class="runner">
                  ${photo(student)}
                  <div><b>${esc(student.name)}</b><span>${nb(student.points)} نقطة</span></div>
                </div>`).join('')}
            </div>` : ''}
        </div>
      </div>
    </div>`;
}

/** فارس الفترة المختارة مع الوصيفين */
function periodKnightSlide() {
  const knight = data.knight;
  if (!knight) return null;
  const runners = (data.students || []).filter((student) => student.id !== knight.id).slice(0, 2);
  return knightSlide(knight, { heading: titles().knight, sub: data.period_label, runners });
}

/** فارس الأسبوع حين تكون فترة الشاشة أطول من أسبوع، مع نقاطه منذ بداية الفترة */
function weekKnightSlide() {
  const week = data.week;
  if (!week || !week.knight) return null;
  const knight = week.knight;
  const extra = `
    <div class="knight__total">${icon('calendar', { size: 22 })}
      <span>${esc(data.period_label)}: <b>${nb(knight.period_points)}</b> نقطة${knight.period_rank ? ` · المركز <b>${nb(knight.period_rank)}</b>` : ''}</span>
    </div>`;
  return knightSlide(knight, { heading: 'فارس الأسبوع', sub: week.label, extra });
}

function halaqaSlide(halaqa, { heading, sub }) {
  if (!halaqa) return null;
  return () => `
    <div class="slide halaqa-card">
      ${title('mosque', heading)}
      <p class="slide__sub">${esc(sub)}</p>
      <div class="name">${esc(halaqa.name)}</div>
      <div class="teacher">${esc(halaqa.teacher_name || '')}</div>
      <div class="knight__points">${icon('groups', { size: 26 })} ${nb(halaqa.points)} نقطة · ${nb(halaqa.students_count)} طلاب</div>
      <div class="members">
        ${(halaqa.members || []).map((member) => `
          <div class="member"><strong>${esc(member.name)}</strong><span>${nb(member.points)} نقطة</span></div>`).join('')}
      </div>
    </div>`;
}

/** منصة التتويج: الثلاثة الأوائل */
function podiumSlide() {
  const top = (data.students || []).slice(0, 3);
  if (top.length < 3) return null;
  const order = [top[1], top[0], top[2]];
  return () => `
    <div class="slide">
      ${title('trophy', 'منصة المتصدرين')}
      <p class="slide__sub">${esc(data.period_label)}</p>
      <div class="podium">
        ${order.map((student) => `
          <div class="podium__col podium__col--${student.rank}">
            ${photo(student, 'podium__photo')}
            <div class="podium__name">${esc(student.name)}</div>
            <div class="podium__meta">${esc(student.halaqa_name || '')}</div>
            <div class="podium__bar">
              ${num(student.points)}
              <span class="podium__rank">المركز ${student.rank}</span>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function boardSlide() {
  return () => `
    <div class="slide">
      ${title('list', `لوحة الصدارة — ${data.period_label}`)}
      <div class="board">
        <div class="board__col">
          <h3>${icon('students', { size: 26 })} ترتيب الطلاب</h3>
          ${data.students.slice(0, 8).map((student) => `
            <div class="row">
              <span class="rank r${student.rank <= 3 ? student.rank : ''}">${student.rank}</span>
              <span class="who">${photo(student)}<b>${esc(student.name)}</b>
                <span class="sub">${esc(student.halaqa_name || '')}</span></span>
              <span class="pts">${num(student.points)}</span>
            </div>`).join('') || '<div class="empty-slide">لا توجد نقاط بعد</div>'}
        </div>
        <div class="board__col">
          <h3>${icon('groups', { size: 26 })} ترتيب الحلقات</h3>
          ${data.halaqat.slice(0, 8).map((halaqa) => `
            <div class="row">
              <span class="rank r${halaqa.rank <= 3 ? halaqa.rank : ''}">${halaqa.rank}</span>
              <span class="who"><b>${esc(halaqa.name)}</b><span class="sub">${esc(halaqa.teacher_name || '')}</span></span>
              <span class="pts">${num(halaqa.points)}</span>
            </div>`).join('') || '<div class="empty-slide">لا توجد نقاط بعد</div>'}
        </div>
      </div>
    </div>`;
}

function buildSlides() {
  // شرائح الأسبوع أولاً (إن كانت فترة الشاشة أطول)، ثم شرائح الفترة منذ بدايتها
  const week = data.week;
  slides = [
    weekKnightSlide(),
    week ? halaqaSlide(week.halaqa, { heading: 'حلقة الأسبوع', sub: week.label }) : null,
    periodKnightSlide(),
    halaqaSlide(data.halaqa_of_week, { heading: titles().halaqa, sub: data.period_label }),
    podiumSlide(),
    boardSlide()
  ].filter(Boolean);
  if (!slides.length) slides = [() => '<div class="empty-slide">لم تُرصد نقاط بعد — ابدأ برصد نقاط الطلاب</div>'];
  if (index >= slides.length) index = 0;
  dots.innerHTML = slides.map((_, i) => `<span class="dot ${i === index ? 'active' : ''}"></span>`).join('');
}

function show(next = index) {
  index = (next + slides.length) % slides.length;
  stage.innerHTML = slides[index]();
  dots.querySelectorAll('.dot').forEach((dot, i) => dot.classList.toggle('active', i === index));
  restartProgress();
}

/** شريط رفيع أسفل الشاشة يوضّح الوقت المتبقي للشريحة التالية */
function restartProgress() {
  if (!progress) return;
  progress.style.transition = 'none';
  progress.style.width = '0%';
  requestAnimationFrame(() => {
    progress.style.transition = `width ${rotateSeconds}s linear`;
    progress.style.width = '100%';
  });
}

function schedule(seconds) {
  rotateSeconds = Math.max(5, seconds);
  clearInterval(timer);
  timer = setInterval(() => show(index + 1), rotateSeconds * 1000);
  restartProgress();
}

/** اختيار المسجد عند فتح الشاشة أول مرة على جهاز العرض */
async function chooseMosque() {
  clearInterval(timer);
  let mosques = [];
  try {
    mosques = (await (await fetch('/api/mosques/public')).json()).mosques || [];
  } catch { /* لا شيء */ }
  document.getElementById('subtitle').textContent = 'اختر المسجد لعرض شاشته';
  stage.innerHTML = `
    <div class="slide mosque-picker">
      ${title('mosque', 'اختر المسجد')}
      <div class="mosque-picker__list">
        ${mosques.map((m) => `<button type="button" data-mosque="${m.id}">${icon('mosque', { size: 30 })}<span>${esc(m.name)}</span></button>`).join('')
          || '<div class="empty-slide">لا توجد مساجد</div>'}
      </div>
      <p class="mosque-picker__hint">يُحفظ الاختيار على هذا الجهاز، ويمكن تغييره لاحقاً بالمفتاح M</p>
    </div>`;
  dots.innerHTML = '';
  stage.querySelectorAll('[data-mosque]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      mosqueId = button.dataset.mosque;
      remember(mosqueId);
      history.replaceState(null, '', `?mosque=${mosqueId}`);
      load();
    });
  });
}

async function load() {
  try {
    // الفترة من إعدادات الشاشة، ويمكن تجاوزها من الرابط: ?period=month أو ?period=since&from=2025-09-01
    const params = new URLSearchParams();
    if (mosqueId) params.set('mosque', mosqueId);
    const urlParams = new URLSearchParams(location.search);
    for (const key of ['period', 'from']) if (urlParams.get(key)) params.set(key, urlParams.get(key));
    const response = await fetch(`/api/screen?${params}`, { credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    if (payload.mosque_required || (response.status === 400 && mosqueId)) {
      mosqueId = null;
      remember(null);
      return chooseMosque();
    }
    if (!response.ok) throw new Error(payload.error || 'تعذر تحميل بيانات الشاشة');
    data = payload;
  } catch (error) {
    stage.innerHTML = `<div class="empty-slide">${esc(error.message)}</div>`;
    return;
  }
  if (fromUrl || mosqueId) remember(data.mosque.id);
  document.title = `شاشة العرض — ${data.mosque.name}`;
  document.getElementById('academy').textContent = data.mosque.name;
  document.getElementById('subtitle').textContent = data.academy.name || '';
  document.getElementById('period').textContent = data.period_label;
  if (data.academy.logo) document.getElementById('logo').src = data.academy.logo;
  buildSlides();
  show(index);
  schedule(data.academy.rotate_seconds || 14);
}

function tickClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { hour: '2-digit', minute: '2-digit' }).format(now);
  document.getElementById('today').textContent =
    `${new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(now)} هـ`;
}

document.addEventListener('keydown', (event) => {
  if (event.key === ' ' || event.key === 'ArrowLeft') { event.preventDefault(); show(index + 1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); show(index - 1); }
  if (event.key === 'f') document.documentElement.requestFullscreen?.();
  if (event.key === 'm') { mosqueId = null; remember(null); chooseMosque(); }
});
stage.addEventListener('click', () => { if (data && slides.length) show(index + 1); });

tickClock();
setInterval(tickClock, 20000);
load();
setInterval(load, 60000);
