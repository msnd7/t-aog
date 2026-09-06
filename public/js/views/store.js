/** المتجر: يعرض الجوائز للطالب، ويديرها المشرف */
import { api } from '../api.js';
import { esc, num, nb, dateAr, emptyState, modal, ok, fail, confirmDialog } from '../ui.js';

let data = { rewards: [], wallet: null, redemptions: [] };

export async function render({ ctx }) {
  const staff = ctx.isStaff;
  const [rewardsRes, redemptionsRes] = await Promise.all([
    api.get(`/api/store/rewards${staff ? '?all=1' : ''}`),
    api.get('/api/store/redemptions')
  ]);
  data = { rewards: rewardsRes.rewards, wallet: rewardsRes.wallet, redemptions: redemptionsRes.redemptions };
  const pending = data.redemptions.filter((r) => r.status === 'pending');

  return {
    title: 'المتجر',
    subtitle: staff ? 'إدارة الجوائز وطلبات الطلاب' : `رصيدك ${num(data.wallet ? data.wallet.balance : 0)} نقطة`,
    actions: staff ? `<button class="btn btn--sm" data-add-reward>➕ جائزة جديدة</button>` : '',
    html: `
      ${staff && pending.length ? `
        <div class="card">
          <div class="card__head"><div><h2>طلبات بانتظار التسليم</h2><p><bdi>${pending.length}</bdi> طلب</p></div></div>
          <div class="list">
            ${pending.map((row) => `
              <div class="list__item">
                <div style="flex:1">
                  <strong>${esc(row.student_name)}</strong>
                  <span class="muted small">${esc(row.reward_name)} · ${esc(row.halaqa_name || '')} · ${dateAr(row.created_at)}</span>
                </div>
                <span class="chip chip--orange">${num(row.price)}</span>
                <button class="btn btn--sm btn--green" data-deliver="${row.id}">تم التسليم</button>
                <button class="btn btn--sm btn--ghost" data-reject="${row.id}">رفض وإرجاع النقاط</button>
              </div>`).join('')}
          </div>
        </div>` : ''}

      ${!staff && data.wallet ? `
        <div class="grid cols-3">
          <div class="stat stat--green"><span class="stat__label">الرصيد المتاح</span><span class="stat__value">${num(data.wallet.balance)}</span></div>
          <div class="stat stat--blue"><span class="stat__label">إجمالي المكتسب</span><span class="stat__value">${num(data.wallet.earned)}</span></div>
          <div class="stat stat--orange"><span class="stat__label">المستبدل</span><span class="stat__value">${num(data.wallet.spent)}</span></div>
        </div>` : ''}

      <div class="card mt">
        <div class="card__head"><div><h2>الجوائز</h2><p>${nb(data.rewards.length)} جائزة</p></div></div>
        ${data.rewards.length ? `
          <div class="grid cols-4">
            ${data.rewards.map((reward) => rewardCard(reward, staff, data.wallet)).join('')}
          </div>` : emptyState(staff ? 'أضف أول جائزة للمتجر' : 'لا توجد جوائز حالياً', '🎁')}
      </div>

      ${!staff ? `
        <div class="card mt">
          <div class="card__head"><div><h2>طلباتي</h2></div></div>
          ${data.redemptions.length ? `
            <div class="list">
              ${data.redemptions.map((row) => `
                <div class="list__item">
                  <div style="flex:1"><strong>${esc(row.reward_name)}</strong>
                    <span class="muted small">${dateAr(row.created_at)}</span></div>
                  <span class="chip ${row.status === 'delivered' ? 'chip--green' : row.status === 'rejected' ? 'chip--danger' : 'chip--orange'}">
                    ${statusLabel(row.status)}</span>
                  <span class="points-pill points-pill--minus">${num(row.price)}</span>
                </div>`).join('')}
            </div>` : emptyState('لم تطلب أي جائزة بعد', '📦')}
        </div>` : ''}`
  };
}

function statusLabel(status) {
  return status === 'delivered' ? 'تم التسليم' : status === 'rejected' ? 'مرفوض' : 'قيد المعالجة';
}

function rewardCard(reward, staff, wallet) {
  const affordable = wallet ? wallet.balance >= reward.price : true;
  return `
    <div class="reward">
      <div class="reward__img">
        ${reward.image ? `<img src="${esc(reward.image)}" alt="${esc(reward.name)}" loading="lazy">` : '🎁'}
      </div>
      <div class="reward__body">
        <strong>${esc(reward.name)}</strong>
        ${reward.description ? `<span class="muted small">${esc(reward.description)}</span>` : ''}
        <span class="reward__price">${nb(reward.price)} نقطة</span>
        ${reward.stock >= 0 ? `<span class="muted small">المتبقي: ${nb(reward.stock)}</span>` : ''}
        ${!reward.active ? '<span class="chip chip--gray">مخفية</span>' : ''}
        <div class="row" style="margin-top:auto">
          ${staff ? `
            <button class="btn btn--sm btn--ghost" data-edit-reward="${reward.id}">تعديل</button>
            <button class="btn btn--sm btn--ghost" data-delete-reward="${reward.id}">حذف</button>`
    : `<button class="btn btn--sm btn--block ${affordable ? '' : 'btn--ghost'}" data-redeem="${reward.id}" ${affordable ? '' : 'disabled'}>
                 ${affordable ? 'استبدال النقاط' : 'الرصيد لا يكفي'}</button>`}
        </div>
      </div>
    </div>`;
}

export function mount({ content, refresh, ctx }) {
  const addButton = document.querySelector('[data-add-reward]');
  if (addButton) addButton.onclick = () => rewardModal(null, refresh);

  content.querySelectorAll('[data-edit-reward]').forEach((button) => {
    button.onclick = () => rewardModal(data.rewards.find((r) => r.id === Number(button.dataset.editReward)), refresh);
  });
  content.querySelectorAll('[data-delete-reward]').forEach((button) => {
    button.onclick = async () => {
      if (!await confirmDialog('حذف هذه الجائزة من المتجر؟')) return;
      try { await api.del(`/api/store/rewards/${button.dataset.deleteReward}`); ok('تم الحذف'); refresh(); }
      catch (error) { fail(error.message); }
    };
  });
  content.querySelectorAll('[data-redeem]').forEach((button) => {
    button.onclick = async () => {
      const reward = data.rewards.find((r) => r.id === Number(button.dataset.redeem));
      if (!await confirmDialog(`استبدال ${reward.price} نقطة مقابل «${reward.name}»؟`, { confirmText: 'استبدال', danger: false })) return;
      try {
        await api.post(`/api/store/rewards/${reward.id}/redeem`, {});
        ok('تم إرسال طلبك للمشرف');
        refresh();
      } catch (error) { fail(error.message); }
    };
  });
  content.querySelectorAll('[data-deliver]').forEach((button) => {
    button.onclick = async () => {
      try { await api.post(`/api/store/redemptions/${button.dataset.deliver}/status`, { status: 'delivered' }); ok('تم تسليم الجائزة'); refresh(); }
      catch (error) { fail(error.message); }
    };
  });
  content.querySelectorAll('[data-reject]').forEach((button) => {
    button.onclick = async () => {
      if (!await confirmDialog('رفض الطلب وإرجاع النقاط للطالب؟')) return;
      try { await api.post(`/api/store/redemptions/${button.dataset.reject}/status`, { status: 'rejected' }); ok('تم الرفض وإرجاع النقاط'); refresh(); }
      catch (error) { fail(error.message); }
    };
  });
  void ctx;
}

function rewardModal(reward, onDone) {
  modal({
    title: reward ? 'تعديل الجائزة' : 'جائزة جديدة',
    render: () => `
      <form id="reward-form">
        <div class="field"><label>اسم الجائزة</label><input name="name" value="${esc(reward?.name || '')}" required></div>
        <div class="field"><label>الوصف</label><input name="description" value="${esc(reward?.description || '')}"></div>
        <div class="inline-fields">
          <div class="field"><label>السعر بالنقاط</label><input name="price" type="number" min="1" step="25" value="${reward?.price || 100}" required></div>
          <div class="field"><label>الكمية</label><input name="stock" type="number" value="${reward ? reward.stock : -1}">
            <span class="hint">‎-1 يعني غير محدودة</span></div>
        </div>
        <div class="field"><label>صورة الجائزة</label><input type="file" name="image" accept="image/*"></div>
        ${reward ? `<div class="field"><label class="switch"><input type="checkbox" name="active" value="1" ${reward.active ? 'checked' : ''}> ظاهرة في المتجر</label></div>` : ''}
        <button class="btn btn--block" type="submit">حفظ</button>
      </form>`,
    onMount: (root, close) => {
      root.querySelector('#reward-form').onsubmit = async (event) => {
        event.preventDefault();
        const form = new FormData(event.target);
        if (reward) form.set('active', event.target.active && event.target.active.checked ? '1' : '0');
        if (!form.get('image') || !form.get('image').size) form.delete('image');
        try {
          if (reward) await api.upload(`/api/store/rewards/${reward.id}`, form, 'PATCH');
          else await api.upload('/api/store/rewards', form);
          ok('تم الحفظ');
          close();
          if (onDone) onDone();
        } catch (error) { fail(error.message); }
      };
    }
  });
}
