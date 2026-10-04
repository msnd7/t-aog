/** المتجر: يعرض الجوائز للطالب، ويديرها المشرف (الإضافة والحذف والصور وفتح الشراء وإقفاله) */
import { api } from '../api.js';
import { esc, num, nb, dateAr, emptyState, modal, ok, fail, confirmDialog, icon, menu, menuItem, menuSep } from '../ui.js';

let data = { rewards: [], wallet: null, redemptions: [], storeOpen: true };

export async function render({ ctx }) {
  const staff = ctx.isStaff;
  const [rewardsRes, redemptionsRes] = await Promise.all([
    api.get(`/api/store/rewards${staff ? '?all=1' : ''}`),
    api.get('/api/store/redemptions')
  ]);
  data = {
    rewards: rewardsRes.rewards,
    wallet: rewardsRes.wallet,
    redemptions: redemptionsRes.redemptions,
    storeOpen: rewardsRes.store_open !== false
  };
  const pending = data.redemptions.filter((r) => r.status === 'pending');
  const lockedCount = data.rewards.filter((r) => !r.purchasable).length;

  return {
    title: 'المتجر',
    subtitle: staff ? 'إدارة الجوائز وطلبات الطلاب' : `رصيدك ${num(data.wallet ? data.wallet.balance : 0)} نقطة`,
    actions: staff ? `<button class="btn btn--sm" data-add-reward>${icon('plus', { size: 16 })} جائزة جديدة</button>` : '',
    html: `
      ${staff ? `
        <div class="store-bar ${data.storeOpen ? '' : 'store-bar--closed'}">
          <span class="store-bar__icon">${icon(data.storeOpen ? 'gift' : 'lock', { size: 24 })}</span>
          <div class="store-bar__text">
            <strong>${data.storeOpen ? 'الشراء مفتوح للطلاب' : 'الشراء مقفل حالياً'}</strong>
            <span>${data.storeOpen
    ? (lockedCount ? `${nb(lockedCount)} جائزة شراؤها مقفل منفرداً — افتحها من قائمة كل جائزة` : 'يستطيع الطلاب استبدال نقاطهم بكل الجوائز الظاهرة')
    : 'تبقى الجوائز ظاهرة للطلاب، ولا يمكنهم الشراء حتى تفتحه'}</span>
          </div>
          <button class="btn btn--sm" data-store-toggle="${data.storeOpen ? '0' : '1'}">
            ${icon(data.storeOpen ? 'lock' : 'check', { size: 16 })} ${data.storeOpen ? 'إقفال الشراء' : 'فتح الشراء'}</button>
        </div>` : ''}

      ${!staff && !data.storeOpen ? `
        <div class="store-bar store-bar--closed">
          <span class="store-bar__icon">${icon('lock', { size: 24 })}</span>
          <div class="store-bar__text"><strong>الشراء مقفل حالياً</strong>
            <span>تصفّح الجوائز واجمع نقاطك، وسيُفتح الشراء قريباً بإذن الله</span></div>
        </div>` : ''}

      ${staff && pending.length ? `
        <div class="card">
          <div class="card__head"><div><h2>${icon('box')} طلبات بانتظار التسليم</h2><p><bdi>${pending.length}</bdi> طلب</p></div></div>
          <div class="list">
            ${pending.map((row) => `
              <div class="list__item">
                <div style="flex:1">
                  <strong>${esc(row.student_name)}</strong>
                  <span class="muted small">${esc(row.reward_name)} · ${esc(row.halaqa_name || '')} · ${dateAr(row.created_at)}</span>
                </div>
                <span class="chip chip--orange">${num(row.price)}</span>
                <button class="btn btn--sm btn--green" data-deliver="${row.id}">${icon('check', { size: 16 })} تم التسليم</button>
                <button class="btn btn--sm btn--ghost" data-reject="${row.id}">${icon('close', { size: 16 })} رفض وإرجاع</button>
              </div>`).join('')}
          </div>
        </div>` : ''}

      ${!staff && data.wallet ? `
        <div class="grid cols-3">
          <div class="stat stat--green"><span class="stat__label">${icon('wallet', { size: 16 })} الرصيد المتاح</span><span class="stat__value">${num(data.wallet.balance)}</span></div>
          <div class="stat stat--blue"><span class="stat__label">${icon('points', { size: 16 })} إجمالي المكتسب</span><span class="stat__value">${num(data.wallet.earned)}</span></div>
          <div class="stat stat--orange"><span class="stat__label">${icon('gift', { size: 16 })} المستبدل</span><span class="stat__value">${num(data.wallet.spent)}</span></div>
        </div>` : ''}

      <div class="card mt">
        <div class="card__head">
          <div><h2>${icon('gift')} الجوائز</h2><p>${nb(data.rewards.length)} جائزة</p></div>
          ${staff ? `<button class="btn btn--sm btn--ghost" data-add-reward>${icon('plus', { size: 16 })} إضافة جائزة</button>` : ''}
        </div>
        ${data.rewards.length ? `
          <div class="grid cols-4">
            ${data.rewards.map((reward) => rewardCard(reward, staff)).join('')}
          </div>` : emptyState(staff ? 'أضف أول جائزة للمتجر' : 'لا توجد جوائز حالياً', 'gift')}
      </div>

      ${!staff ? `
        <div class="card mt">
          <div class="card__head"><div><h2>${icon('box')} طلباتي</h2></div></div>
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
            </div>` : emptyState('لم تطلب أي جائزة بعد', 'box')}
        </div>` : ''}`
  };
}

function statusLabel(status) {
  return status === 'delivered' ? 'تم التسليم' : status === 'rejected' ? 'مرفوض' : 'قيد المعالجة';
}

/** زر الشراء للطالب حسب حالة المتجر والجائزة والرصيد */
function buyButton(reward) {
  const wallet = data.wallet;
  if (!data.storeOpen || !reward.purchasable) {
    return `<button class="btn btn--sm btn--block btn--ghost" disabled>${icon('lock', { size: 16 })} الشراء مقفل</button>`;
  }
  if (reward.stock === 0) return '<button class="btn btn--sm btn--block btn--ghost" disabled>نفدت الكمية</button>';
  const affordable = wallet ? wallet.balance >= reward.price : true;
  return `<button class="btn btn--sm btn--block ${affordable ? '' : 'btn--ghost'}" data-redeem="${reward.id}" ${affordable ? '' : 'disabled'}>
    ${affordable ? `${icon('gift', { size: 16 })} استبدال النقاط` : 'الرصيد لا يكفي'}</button>`;
}

function rewardCard(reward, staff) {
  const locked = !reward.purchasable || !data.storeOpen;
  const flags = [
    !reward.active ? `<span class="chip chip--gray">${icon('eye', { size: 14 })} مخفية</span>` : '',
    !reward.purchasable ? `<span class="chip chip--orange">${icon('lock', { size: 14 })} الشراء مقفل</span>` : '',
    reward.stock === 0 ? '<span class="chip chip--danger">نفدت</span>' : ''
  ].join('');
  return `
    <div class="reward ${locked ? 'reward--locked' : ''} ${reward.active ? '' : 'reward--hidden'}">
      <div class="reward__img ${reward.image ? 'reward__img--photo' : ''}">
        ${reward.image ? `<img src="${esc(reward.image)}" alt="${esc(reward.name)}" loading="lazy">` : icon('gift', { size: 48, stroke: 1.3 })}
        ${flags ? `<div class="reward__flags">${flags}</div>` : ''}
        <span class="reward__price-tag">${icon('star', { size: 14 })} ${nb(reward.price)} نقطة</span>
      </div>
      <div class="reward__body">
        <strong>${esc(reward.name)}</strong>
        ${reward.description ? `<span class="muted small">${esc(reward.description)}</span>` : ''}
        ${reward.stock > 0 ? `<span class="muted small">المتبقي: ${nb(reward.stock)}</span>` : ''}
        <div class="reward__actions">
          ${staff ? `
            <button class="btn btn--sm ${reward.purchasable ? 'btn--ghost' : 'btn--green'}" data-purchasable="${reward.id}" data-value="${reward.purchasable ? '0' : '1'}">
              ${icon(reward.purchasable ? 'lock' : 'check', { size: 16 })} ${reward.purchasable ? 'إقفال' : 'فتح'}<span class="hide-sm"> الشراء</span></button>
            ${menu({
    label: '', name: 'more', className: 'btn btn--sm btn--ghost btn--icon',
    items: [
      menuItem({ label: 'تعديل الجائزة', name: 'edit', attrs: `data-edit-reward="${reward.id}"` }),
      menuItem({ label: reward.image ? 'تغيير الصورة' : 'إضافة صورة', name: 'image', attrs: `data-image-reward="${reward.id}"` }),
      menuItem({
        label: reward.active ? 'إخفاء من المتجر' : 'إظهار في المتجر',
        name: 'eye',
        attrs: `data-active-reward="${reward.id}" data-value="${reward.active ? '0' : '1'}"`
      }),
      menuSep(),
      menuItem({ label: 'حذف الجائزة', name: 'trash', danger: true, attrs: `data-delete-reward="${reward.id}"` })
    ]
  })}` : buyButton(reward)}
        </div>
      </div>
    </div>`;
}

const findReward = (id) => data.rewards.find((r) => r.id === Number(id));

/** تعديل حقل واحد للجائزة دون فتح النافذة */
async function patchReward(id, values, message, refresh) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  try {
    await api.upload(`/api/store/rewards/${id}`, form, 'PATCH');
    ok(message);
    refresh();
  } catch (error) { fail(error.message); }
}

export function mount({ content, refresh }) {
  document.querySelectorAll('[data-add-reward]').forEach((button) => {
    button.onclick = () => rewardModal(null, refresh);
  });

  const storeToggle = content.querySelector('[data-store-toggle]');
  if (storeToggle) {
    storeToggle.onclick = async () => {
      const open = storeToggle.dataset.storeToggle === '1';
      if (!open && !await confirmDialog('إقفال الشراء من المتجر؟ ستبقى الجوائز ظاهرة للطلاب دون إمكانية الشراء.',
        { confirmText: 'إقفال الشراء' })) return;
      try {
        await api.post('/api/store/status', { open });
        ok(open ? 'تم فتح الشراء للطلاب' : 'تم إقفال الشراء');
        refresh();
      } catch (error) { fail(error.message); }
    };
  }

  content.querySelectorAll('[data-purchasable]').forEach((button) => {
    button.onclick = () => patchReward(button.dataset.purchasable, { purchasable: button.dataset.value },
      button.dataset.value === '1' ? 'تم فتح شراء الجائزة' : 'تم إقفال شراء الجائزة', refresh);
  });
  content.querySelectorAll('[data-active-reward]').forEach((button) => {
    button.onclick = () => patchReward(button.dataset.activeReward, { active: button.dataset.value },
      button.dataset.value === '1' ? 'الجائزة ظاهرة في المتجر' : 'تم إخفاء الجائزة', refresh);
  });
  content.querySelectorAll('[data-edit-reward]').forEach((button) => {
    button.onclick = () => rewardModal(findReward(button.dataset.editReward), refresh);
  });
  content.querySelectorAll('[data-image-reward]').forEach((button) => {
    button.onclick = () => rewardModal(findReward(button.dataset.imageReward), refresh, { pickImage: true });
  });
  content.querySelectorAll('[data-delete-reward]').forEach((button) => {
    button.onclick = async () => {
      const reward = findReward(button.dataset.deleteReward);
      if (!await confirmDialog(`حذف «${reward.name}» من المتجر نهائياً؟ تبقى طلبات الطلاب السابقة عليها في السجل.`,
        { confirmText: 'حذف الجائزة' })) return;
      try { await api.del(`/api/store/rewards/${reward.id}`); ok('تم حذف الجائزة'); refresh(); }
      catch (error) { fail(error.message); }
    };
  });
  content.querySelectorAll('[data-redeem]').forEach((button) => {
    button.onclick = async () => {
      const reward = findReward(button.dataset.redeem);
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
}

const toggleField = (name, title, hint, checked) => `
  <label class="toggle">
    <span class="toggle__text"><strong>${esc(title)}</strong><span>${esc(hint)}</span></span>
    <input type="checkbox" name="${name}" ${checked ? 'checked' : ''}>
  </label>`;

/** نافذة إضافة جائزة أو تعديلها: الاسم والسعر والكمية والصورة وحالة الظهور والشراء */
function rewardModal(reward, onDone, { pickImage = false } = {}) {
  let removeImage = false;
  modal({
    title: reward ? 'تعديل الجائزة' : 'جائزة جديدة',
    render: () => `
      <form id="reward-form">
        <div class="field">
          <label>صورة الجائزة</label>
          <div class="image-drop">
            <div class="image-drop__preview" data-preview>
              ${reward && reward.image ? `<img src="${esc(reward.image)}" alt="">` : icon('image', { size: 30, stroke: 1.4 })}
            </div>
            <div class="image-drop__actions">
              <div class="row">
                <button type="button" class="btn btn--sm" data-choose>${icon('upload', { size: 16 })} ${reward && reward.image ? 'تغيير الصورة' : 'اختيار صورة'}</button>
                <button type="button" class="btn btn--sm btn--ghost" data-remove-image ${reward && reward.image ? '' : 'hidden'}>${icon('trash', { size: 16 })} إزالة</button>
              </div>
              <span class="hint">JPG أو PNG أو WEBP حتى ٦ ميغابايت</span>
            </div>
            <input type="file" name="image" accept="image/*">
          </div>
        </div>
        <div class="field"><label>اسم الجائزة</label><input name="name" value="${esc(reward?.name || '')}" required></div>
        <div class="field"><label>الوصف</label><input name="description" value="${esc(reward?.description || '')}" placeholder="اختياري"></div>
        <div class="inline-fields">
          <div class="field"><label>السعر بالنقاط</label><input name="price" type="number" min="1" step="25" value="${reward?.price || 100}" required></div>
          <div class="field"><label>الكمية</label><input name="stock" type="number" min="-1" value="${reward ? reward.stock : -1}">
            <span class="hint">‎-1 يعني غير محدودة</span></div>
        </div>
        ${toggleField('active', 'ظاهرة في المتجر', 'يراها الطلاب في قائمة الجوائز', reward ? reward.active : true)}
        ${toggleField('purchasable', 'الشراء مفتوح', 'أقفله لتعرض الجائزة الآن وتفتح شراءها متى شئت', reward ? reward.purchasable : true)}
        <button class="btn btn--block mt" type="submit">${icon('save', { size: 18 })} حفظ الجائزة</button>
      </form>`,
    onMount: (root, close) => {
      const form = root.querySelector('#reward-form');
      const fileInput = form.querySelector('input[type=file]');
      const preview = root.querySelector('[data-preview]');
      const removeButton = root.querySelector('[data-remove-image]');
      root.querySelector('[data-choose]').onclick = () => fileInput.click();
      fileInput.onchange = () => {
        const file = fileInput.files[0];
        if (!file) return;
        removeImage = false;
        preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="">`;
        removeButton.hidden = false;
      };
      removeButton.onclick = () => {
        fileInput.value = '';
        removeImage = Boolean(reward && reward.image);
        preview.innerHTML = icon('image', { size: 30, stroke: 1.4 });
        removeButton.hidden = true;
      };
      if (pickImage) fileInput.click();

      form.onsubmit = async (event) => {
        event.preventDefault();
        const body = new FormData(form);
        body.set('active', form.active.checked ? '1' : '0');
        body.set('purchasable', form.purchasable.checked ? '1' : '0');
        if (!body.get('image') || !body.get('image').size) body.delete('image');
        if (removeImage) body.set('remove_image', '1');
        const button = form.querySelector('button[type=submit]');
        button.disabled = true;
        try {
          if (reward) await api.upload(`/api/store/rewards/${reward.id}`, body, 'PATCH');
          else await api.upload('/api/store/rewards', body);
          ok('تم حفظ الجائزة');
          close();
          if (onDone) onDone();
        } catch (error) {
          fail(error.message);
          button.disabled = false;
        }
      };
    }
  });
}
