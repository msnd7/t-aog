/** شاشة الصدارة داخل التطبيق: ترتيب الطلاب أو الحلقات */
import { api } from '../api.js';
import { esc, num, nb, avatar, rankBadge, emptyState, periodPick, pick, icon } from '../ui.js';

const view = { scope: 'students', period: 'week' };

export async function render() {
  const data = await api.get(`/api/screen/leaderboard?scope=${view.scope}&period=${view.period}&limit=100`);
  const top = data.rows.slice(0, 3);
  const rest = data.rows.slice(3);

  return {
    title: 'الصدارة',
    subtitle: `${view.scope === 'students' ? 'ترتيب الطلاب' : 'ترتيب الحلقات'} · ${esc(data.period_label)}`,
    actions: `<a class="btn btn--sm btn--ghost" href="/screen.html" target="_blank" rel="noopener">${icon('screen', { size: 16 })} شاشة العرض</a>`,
    html: `
      <div class="toolbar">
        ${pick({
    label: 'الترتيب حسب',
    attrs: 'data-scope-select',
    value: view.scope,
    options: [{ value: 'students', label: 'ترتيب الطلاب' }, { value: 'halaqat', label: 'ترتيب الحلقات' }]
  })}
        ${periodPick(view.period)}
      </div>

      ${top.length ? `
        <div class="grid cols-3">
          ${top.map((row) => `
            <div class="card center" style="border-top:5px solid ${row.rank === 1 ? 'var(--sun-500)' : row.rank === 2 ? '#b9cbd0' : 'var(--sage-500)'}">
              <div style="display:flex;justify-content:center;margin-bottom:.4rem">
                ${view.scope === 'students' ? avatar(row, 'avatar--lg') : `<span class="avatar avatar--lg">${row.rank}</span>`}
              </div>
              <strong style="font-size:1.1rem">${esc(row.name)}</strong>
              <p class="muted small">${esc(view.scope === 'students' ? (row.halaqa_name || 'بدون حلقة') : (row.teacher_name || ''))}</p>
              <span class="points-pill">${nb(row.points)} نقطة</span>
            </div>`).join('')}
        </div>` : ''}

      <div class="card mt">
        ${data.rows.length ? `
          <div class="table-wrap">
            <table>
              <thead><tr><th style="width:44px">#</th><th>${view.scope === 'students' ? 'الطالب' : 'الحلقة'}</th>
                <th>${view.scope === 'students' ? 'الحلقة' : 'المعلم'}</th><th class="num">النقاط</th>${view.scope === 'halaqat' ? '<th class="num">المعدل</th>' : ''}</tr></thead>
              <tbody>
                ${(rest.length ? rest : data.rows).map((row) => `
                  <tr>
                    <td>${rankBadge(row.rank)}</td>
                    <td>${view.scope === 'students'
                      ? `<a class="person" href="#/students/${row.id}" style="text-decoration:none;color:inherit">${avatar(row)}<span><strong>${esc(row.name)}</strong></span></a>`
                      : `<strong>${esc(row.name)}</strong>`}</td>
                    <td>${esc(view.scope === 'students' ? (row.halaqa_name || '—') : (row.teacher_name || '—'))}</td>
                    <td class="num"><span class="points-pill">${num(row.points)}</span></td>
                    ${view.scope === 'halaqat' ? `<td class="num">${num(row.average)}</td>` : ''}
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : emptyState('لا توجد نقاط في هذه الفترة', 'trophy')}
      </div>`
  };
}

export function mount({ content, refresh }) {
  const scopeSelect = content.querySelector('[data-scope-select]');
  scopeSelect.onchange = () => { view.scope = scopeSelect.value; refresh(); };
  const periodSelect = content.querySelector('[data-period-select]');
  periodSelect.onchange = () => { view.period = periodSelect.value; refresh(); };
}
