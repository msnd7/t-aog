/** الشاشة الرئيسية للمشرف */
import { api } from '../api.js';
import { esc, num, nb, avatar, rankBadge, dateAr, emptyState } from '../ui.js';

let cache = null;

export async function render() {
  const [screen, redemptions, entries, students] = await Promise.all([
    api.get('/api/screen?period=week'),
    api.get('/api/store/redemptions?status=pending'),
    api.get('/api/points?limit=12'),
    api.get('/api/students?period=week')
  ]);
  cache = { screen, redemptions, entries, students };

  const totalWeek = screen.halaqat.reduce((sum, h) => sum + h.points, 0);

  const knight = screen.knight;
  const halaqa = screen.halaqa_of_week;

  return {
    title: 'لوحة المشرف',
    subtitle: `${screen.period_label} · ${esc(screen.academy.name)}`,
    actions: `
      <a class="btn btn--sm" href="#/scan">📷 مسح الباركود</a>
      <a class="btn btn--sm btn--ghost" href="#/cheques">🧾 إصدار شيك</a>`,
    html: `
      <div class="grid cols-4">
        <div class="stat stat--blue">
          <span class="stat__label">عدد الطلاب</span>
          <span class="stat__value">${num(students.students.length)}</span>
          <span class="stat__hint">في ${nb(screen.halaqat.length)} حلقات</span>
        </div>
        <div class="stat stat--green">
          <span class="stat__label">نقاط ${screen.period_label}</span>
          <span class="stat__value">${num(totalWeek)}</span>
          <span class="stat__hint">مجموع نقاط الحلقات</span>
        </div>
        <div class="stat stat--orange">
          <span class="stat__label">طلبات المتجر</span>
          <span class="stat__value">${num(redemptions.redemptions.length)}</span>
          <span class="stat__hint">بانتظار التسليم</span>
        </div>
        <div class="stat stat--gold">
          <span class="stat__label">فارس الأسبوع</span>
          <span class="stat__value" style="font-size:1.25rem">${esc(knight ? knight.name : '—')}</span>
          <span class="stat__hint">${knight ? `${nb(knight.points)} نقطة` : 'لا توجد نقاط بعد'}</span>
        </div>
      </div>

      <div class="grid cols-2 mt">
        <div class="hero hero--gold">
          <h2>🏅 فارس الأسبوع</h2>
          ${knight ? `
            <div class="hero__body">
              ${avatar(knight, 'avatar--lg')}
              <div>
                <div class="name">${esc(knight.name)}</div>
                <div class="meta">${esc(knight.halaqa_name || 'بدون حلقة')}</div>
                <div class="meta" style="font-weight:700">${nb(knight.points)} نقطة هذا الأسبوع</div>
              </div>
            </div>` : `<p class="meta">لم تُرصد نقاط لهذا الأسبوع بعد</p>`}
        </div>
        <div class="hero hero--green">
          <h2>🕌 حلقة الأسبوع</h2>
          ${halaqa ? `
            <div class="hero__body">
              <div>
                <div class="name">${esc(halaqa.name)}</div>
                <div class="meta">${esc(halaqa.teacher_name || '')}</div>
                <div class="meta" style="font-weight:700">${nb(halaqa.points)} نقطة · ${nb(halaqa.students_count)} طلاب</div>
              </div>
            </div>` : `<p class="meta">لم تُرصد نقاط لهذا الأسبوع بعد</p>`}
        </div>
      </div>

      <div class="grid cols-2 mt">
        <div class="card">
          <div class="card__head">
            <div><h2>الأكثر نقاطاً هذا الأسبوع</h2><p>أعلى ١٠ طلاب</p></div>
            <a class="btn btn--ghost btn--sm" href="#/leaderboard">كل الصدارة</a>
          </div>
          ${screen.students.length ? `
            <div class="list">
              ${screen.students.slice(0, 10).map((student) => `
                <a class="list__item" href="#/students/${student.id}" style="text-decoration:none;color:inherit">
                  ${rankBadge(student.rank)}
                  ${avatar(student)}
                  <div style="flex:1">
                    <strong>${esc(student.name)}</strong>
                    <span class="muted small">${esc(student.halaqa_name || 'بدون حلقة')}</span>
                  </div>
                  <span class="points-pill">${num(student.points)}</span>
                </a>`).join('')}
            </div>` : emptyState('لا توجد نقاط مرصودة بعد', '🏆')}
        </div>

        <div class="card">
          <div class="card__head">
            <div><h2>آخر الحركات</h2><p>أحدث النقاط المرصودة</p></div>
          </div>
          ${entries.entries.length ? `
            <div class="list">
              ${entries.entries.map((entry) => `
                <div class="list__item">
                  <div style="flex:1">
                    <strong>${esc(entry.student_name || entry.halaqa_name || 'نقاط')}</strong>
                    <span class="muted small">${esc(entry.category_label)}${entry.note ? ` · ${esc(entry.note)}` : ''} · ${dateAr(entry.created_at, true)}</span>
                  </div>
                  <span class="points-pill ${entry.points < 0 ? 'points-pill--minus' : ''}">${entry.points > 0 ? '+' : ''}${num(entry.points)}</span>
                </div>`).join('')}
            </div>` : emptyState('لم تُرصد أي نقاط بعد', '📋')}
        </div>
      </div>

      ${redemptions.redemptions.length ? `
        <div class="card mt">
          <div class="card__head">
            <div><h2>طلبات بانتظار التسليم</h2><p>من المتجر</p></div>
            <a class="btn btn--ghost btn--sm" href="#/store">إدارة المتجر</a>
          </div>
          <div class="list">
            ${redemptions.redemptions.slice(0, 6).map((row) => `
              <div class="list__item">
                <div style="flex:1">
                  <strong>${esc(row.student_name)}</strong>
                  <span class="muted small">${esc(row.reward_name)} · ${dateAr(row.created_at)}</span>
                </div>
                <span class="chip chip--orange">${nb(row.price)} نقطة</span>
              </div>`).join('')}
          </div>
        </div>` : ''}`
  };
}

export function mount() { /* لا حاجة لأحداث إضافية */ }
export const getCache = () => cache;
