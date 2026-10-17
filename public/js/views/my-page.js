/** الصفحة الشخصية للطالب: نقاطه وباركوده وشارة مركزه */
import { api } from '../api.js';
import { esc, num, avatar, dateAr, emptyState, icon } from '../ui.js';
import { studentCardMarkup, mountStudentCards, openScanMode } from '../student-card.js';
import { changeMyCodeModal } from './settings.js';

let mine = null;

export async function render({ state }) {
  const data = await api.get(`/api/students/${state.user.id}`);
  mine = data;
  const { student, wallet, rank, entries } = data;

  return {
    title: `أهلاً ${student.name}`,
    subtitle: `${student.halaqa_name || 'بدون حلقة'} · ${student.barcode}`,
    actions: `<button class="btn btn--sm btn--ghost" data-change-code>${icon('key', { size: 16 })} تغيير رمز الدخول</button>`,
    html: `
      <div class="grid cols-2">
        <div class="card">
          <div class="card__head"><div><h2>${icon('barcode')} بطاقتي</h2><p>اعرضها للمشرف ليمسح الباركود ويضيف نقاطك</p></div></div>
          ${studentCardMarkup(student, {
    logo: state.settings.logo || '/img/logo.jpg',
    academy: state.settings.mosque_name || state.settings.academy_name || 'رياض القرآن',
    points: wallet.balance
  })}
          <button class="btn btn--block mt" data-scan-mode>${icon('eye', { size: 18 })} عرض البطاقة للمسح</button>
        </div>

        <div class="card center">
          <div style="display:flex;justify-content:center">${avatar(student, 'avatar--xl', { rank: rank.rank })}</div>
          <h2 class="mt" style="margin-bottom:0">${esc(student.name)}</h2>
          <p class="muted small">${esc(student.halaqa_name || 'بدون حلقة')}</p>
          <div class="grid cols-3 mt">
            <div class="stat stat--green"><span class="stat__label">${icon('wallet', { size: 16 })} رصيدي</span><span class="stat__value">${num(wallet.balance)}</span></div>
            <div class="stat stat--blue"><span class="stat__label">${icon('points', { size: 16 })} هذا الأسبوع</span><span class="stat__value">${num(data.week_points)}</span></div>
            <div class="stat stat--gold"><span class="stat__label">${icon('trophy', { size: 16 })} ترتيبي</span><span class="stat__value">${rank.rank || '—'}</span></div>
          </div>
        </div>
      </div>

      <div class="card mt">
        <div class="card__head"><div><h2>${icon('list')} سجل نقاطي</h2><p>آخر الحركات</p></div>
          <a class="btn btn--sm btn--ghost" href="#/store">${icon('gift', { size: 16 })} المتجر</a></div>
        ${entries.length ? `
          <div class="list">
            ${entries.slice(0, 25).map((entry) => `
              <div class="list__item">
                <div style="flex:1"><strong>${esc(entry.note || entry.category)}</strong>
                  <span class="muted small">${dateAr(entry.created_at, true)}</span></div>
                <span class="points-pill ${entry.points < 0 ? 'points-pill--minus' : ''}">${entry.points > 0 ? '+' : ''}${num(entry.points)}</span>
              </div>`).join('')}
          </div>` : emptyState('لم تُرصد لك نقاط بعد', 'list')}
      </div>`
  };
}

export function mount({ content }) {
  mountStudentCards(content);
  const student = mine.student;

  content.querySelector('[data-scan-mode]').onclick = () => openScanMode(student);

  document.querySelector('[data-change-code]').onclick = () => changeMyCodeModal();
}
