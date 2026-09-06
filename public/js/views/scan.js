/** شاشة مسح الباركود: كل مسحة تضيف نقاط للطالب */
import { api } from '../api.js';
import { esc, num, nb, avatar, ok, fail } from '../ui.js';

const feed = [];

export async function render({ state }) {
  const points = Number(state.settings.scan_points || 25);
  return {
    title: 'مسح الباركود',
    subtitle: `كل مسحة باركود تضيف ${points} نقطة للطالب`,
    actions: '',
    html: `
      <div class="card">
        <div class="scan-stage">
          <h2 style="margin-bottom:.4rem">وجّه قارئ الباركود إلى بطاقة الطالب</h2>
          <p class="muted small">أبقِ المؤشر داخل الحقل. يعمل القارئ كلوحة مفاتيح وينتهي بمفتاح Enter.</p>
          <input class="field scan-input" data-code inputmode="latin" autocomplete="off" autofocus
                 placeholder="RQ00001" style="width:min(360px,100%);margin:.6rem auto 0;display:block">
          <div class="row" style="justify-content:center;margin-top:.6rem">
            <button class="btn btn--green" data-submit>إضافة النقاط</button>
            <button class="btn btn--ghost" data-focus>تفعيل الحقل</button>
          </div>
        </div>
        <div id="scan-result" class="mt"></div>
      </div>

      <div class="card mt">
        <div class="card__head"><div><h2>سجل المسح في هذه الجلسة</h2><p data-count><bdi>${feed.length}</bdi> عملية</p></div></div>
        <div class="scan-feed" data-feed></div>
      </div>`
  };
}

export function mount({ content }) {
  const input = content.querySelector('[data-code]');
  const result = content.querySelector('#scan-result');
  const feedBox = content.querySelector('[data-feed]');
  const counter = content.querySelector('[data-count]');
  const focus = () => input.focus();

  const drawFeed = () => {
    counter.textContent = `${feed.length} عملية`;
    feedBox.innerHTML = feed.slice(0, 30).map((row) => `
      <div class="scan-feed__row">
        ${avatar(row.student)}
        <div style="flex:1"><strong>${esc(row.student.name)}</strong>
          <span class="muted small">${esc(row.student.halaqa_name || '')} · ${row.time}</span></div>
        <span class="points-pill">+${num(row.points)}</span>
      </div>`).join('');
  };

  const showResult = (payload, isError = false) => {
    if (isError && !payload.student) {
      result.innerHTML = `<div class="card" style="border-color:var(--danger);background:var(--danger-soft)">
        <div class="center"><strong>${esc(payload.error)}</strong></div></div>`;
      return;
    }
    const student = payload.student;
    result.innerHTML = `
      <div class="card" style="border-color:${isError ? 'var(--orange)' : 'var(--green)'};background:${isError ? 'var(--orange-soft)' : 'var(--green-soft)'}">
        <div class="scan-result">
          ${avatar(student, 'avatar--lg')}
          <div>
            <h2 style="margin:0">${esc(student.name)}</h2>
            <p class="muted" style="margin:0">${esc(student.halaqa_name || 'بدون حلقة')}</p>
            ${isError
              ? `<strong style="color:#a35f00">${esc(payload.error)}</strong>`
              : `<strong style="color:var(--green-dark);font-size:1.4rem">+${num(payload.points)} نقطة</strong>`}
            <p class="muted small" style="margin:0">الرصيد: ${nb(payload.wallet.balance)} · الإجمالي: ${nb(payload.wallet.earned)}</p>
          </div>
        </div>
      </div>`;
  };

  const submit = async () => {
    const code = input.value.trim();
    if (!code) return;
    input.value = '';
    try {
      const payload = await api.post('/api/points/scan', { code });
      showResult(payload);
      feed.unshift({
        student: payload.student,
        points: payload.points,
        time: new Date().toLocaleTimeString('ar-SA-u-ca-gregory', { hour: '2-digit', minute: '2-digit' })
      });
      drawFeed();
      ok(`${payload.student.name} +${payload.points}`);
    } catch (error) {
      const payload = error.payload || { error: error.message };
      showResult(payload, true);
      fail(payload.error || error.message);
    }
    focus();
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); submit(); }
  });
  content.querySelector('[data-submit]').onclick = submit;
  content.querySelector('[data-focus]').onclick = focus;
  drawFeed();
  focus();
  // يعيد التركيز للحقل عند النقر في أي مكان فارغ من الصفحة
  content.addEventListener('click', (event) => {
    if (event.target.closest('button, a, input')) return;
    focus();
  });
}
