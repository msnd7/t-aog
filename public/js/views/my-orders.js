/** طلبات الطالب من المتجر */
import { api } from '../api.js';
import { esc, num, nb, dateAr, emptyState, icon } from '../ui.js';

const LABELS = { pending: 'قيد المعالجة', delivered: 'تم التسليم', rejected: 'مرفوض ومسترجع' };

export async function render() {
  const [{ redemptions }, rewardsRes] = await Promise.all([
    api.get('/api/store/redemptions'),
    api.get('/api/store/rewards')
  ]);
  const wallet = rewardsRes.wallet || { balance: 0, earned: 0, spent: 0 };

  return {
    title: 'طلباتي',
    subtitle: `رصيدك الحالي ${num(wallet.balance)} نقطة`,
    html: `
      <div class="grid cols-3">
        <div class="stat stat--green"><span class="stat__label">${icon('wallet', { size: 16 })} الرصيد المتاح</span><span class="stat__value">${num(wallet.balance)}</span></div>
        <div class="stat stat--blue"><span class="stat__label">${icon('points', { size: 16 })} إجمالي المكتسب</span><span class="stat__value">${num(wallet.earned)}</span></div>
        <div class="stat stat--orange"><span class="stat__label">${icon('gift', { size: 16 })} المستبدل</span><span class="stat__value">${num(wallet.spent)}</span></div>
      </div>
      <div class="card mt">
        <div class="card__head"><div><h2>${icon('box')} سجل الطلبات</h2></div>
          <a class="btn btn--sm btn--ghost" href="#/store">${icon('gift', { size: 16 })} تسوّق الجوائز</a></div>
        ${redemptions.length ? `
          <div class="list">
            ${redemptions.map((row) => `
              <div class="list__item">
                ${row.reward_image ? `<img class="avatar" src="${esc(row.reward_image)}" alt="">` : `<span class="avatar">${icon('gift', { size: 22 })}</span>`}
                <div style="flex:1"><strong>${esc(row.reward_name)}</strong>
                  <span class="muted small">${dateAr(row.created_at, true)}</span></div>
                <span class="chip ${row.status === 'delivered' ? 'chip--green' : row.status === 'rejected' ? 'chip--danger' : 'chip--orange'}">${LABELS[row.status]}</span>
                <span class="points-pill points-pill--minus">${num(row.price)}</span>
              </div>`).join('')}
          </div>` : emptyState('لم تطلب أي جائزة بعد', 'box')}
      </div>`
  };
}

export function mount() {}
