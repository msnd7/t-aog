/** الصفحة الشخصية للطالب: نقاطه، باركوده، وصورته */
import { api } from '../api.js';
import { esc, num, nb, avatar, dateAr, emptyState, modal, ok, fail } from '../ui.js';
import { renderBarcodes, drawBarcode } from '../barcode.js';

let mine = null;

export async function render({ state }) {
  const data = await api.get(`/api/students/${state.user.id}`);
  mine = data;
  const { student, wallet, rank, entries } = data;

  return {
    title: `أهلاً ${student.name}`,
    subtitle: `${student.halaqa_name || 'بدون حلقة'} · ${student.barcode}`,
    actions: `<button class="btn btn--sm btn--ghost" data-change-password>🔑 كلمة المرور</button>`,
    html: `
      <div class="grid cols-2">
        <div class="card center">
          <div style="display:flex;justify-content:center">${avatar(student, 'avatar--xl')}</div>
          <h2 class="mt" style="margin-bottom:0">${esc(student.name)}</h2>
          <p class="muted small">${esc(student.halaqa_name || 'بدون حلقة')}</p>
          <button class="btn btn--sm btn--ghost" data-photo>🖼️ تغيير صورتي</button>
          <div class="grid cols-3 mt">
            <div class="stat stat--green"><span class="stat__label">رصيدي</span><span class="stat__value">${num(wallet.balance)}</span></div>
            <div class="stat stat--blue"><span class="stat__label">هذا الأسبوع</span><span class="stat__value">${num(data.week_points)}</span></div>
            <div class="stat stat--gold"><span class="stat__label">ترتيبي</span><span class="stat__value">${rank.rank || '—'}</span></div>
          </div>
        </div>

        <div class="card">
          <div class="card__head"><div><h2>باركودي</h2><p>اعرضه للمشرف ليمسحه ويضيف نقاطك</p></div></div>
          <div class="barcode-box"><svg data-barcode="${esc(student.barcode || '')}" data-height="100"></svg></div>
          <button class="btn btn--block mt" data-fullscreen>🔍 عرض بالحجم الكامل</button>
        </div>
      </div>

      <div class="card mt">
        <div class="card__head"><div><h2>سجل نقاطي</h2><p>آخر الحركات</p></div>
          <a class="btn btn--sm btn--ghost" href="#/store">🎁 المتجر</a></div>
        ${entries.length ? `
          <div class="list">
            ${entries.slice(0, 25).map((entry) => `
              <div class="list__item">
                <div style="flex:1"><strong>${esc(entry.note || entry.category)}</strong>
                  <span class="muted small">${dateAr(entry.created_at, true)}</span></div>
                <span class="points-pill ${entry.points < 0 ? 'points-pill--minus' : ''}">${entry.points > 0 ? '+' : ''}${num(entry.points)}</span>
              </div>`).join('')}
          </div>` : emptyState('لم تُرصد لك نقاط بعد', '📋')}
      </div>`
  };
}

export function mount({ content, refresh }) {
  renderBarcodes(content);
  const student = mine.student;

  content.querySelector('[data-fullscreen]').onclick = () => {
    modal({
      title: 'باركود الطالب',
      render: () => `
        <div class="center">
          <h2>${esc(student.name)}</h2>
          <div class="barcode-box"><svg id="big-barcode"></svg></div>
          <p class="muted small">${esc(student.barcode)}</p>
        </div>`,
      onMount: (root) => drawBarcode(root.querySelector('#big-barcode'), student.barcode, { height: 140, width: 3 })
    });
  };

  content.querySelector('[data-photo]').onclick = () => {
    modal({
      title: 'تغيير صورتي',
      render: () => `
        <form id="photo-form">
          <div class="field"><label>اختر صورة من جهازك</label><input type="file" name="photo" accept="image/*" capture="user" required></div>
          <span class="hint">ستظهر صورتك في شاشة فارس الأسبوع وفي الصدارة.</span>
          <button class="btn btn--block mt" type="submit">رفع الصورة</button>
        </form>`,
      onMount: (root, close) => {
        root.querySelector('#photo-form').onsubmit = async (event) => {
          event.preventDefault();
          try {
            await api.upload(`/api/students/${student.id}/photo`, new FormData(event.target));
            ok('تم تحديث صورتك');
            close();
            refresh();
          } catch (error) { fail(error.message); }
        };
      }
    });
  };

  document.querySelector('[data-change-password]').onclick = () => {
    modal({
      title: 'تغيير كلمة المرور',
      render: () => `
        <form id="pass-form">
          <div class="field"><label>كلمة المرور الحالية</label><input type="password" name="current" required></div>
          <div class="field"><label>كلمة المرور الجديدة</label><input type="password" name="next" required minlength="4"></div>
          <button class="btn btn--block" type="submit">حفظ</button>
        </form>`,
      onMount: (root, close) => {
        root.querySelector('#pass-form').onsubmit = async (event) => {
          event.preventDefault();
          const form = event.target;
          try {
            await api.post('/api/auth/password', { current: form.current.value, next: form.next.value });
            ok('تم تغيير كلمة المرور');
            close();
          } catch (error) { fail(error.message); }
        };
      }
    });
  };
}
