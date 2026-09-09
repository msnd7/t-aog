/**
 * شاشة المسح: يقرأ الجهاز باركود بطاقة الطالب فتُضاف النقاط،
 * وإن قُرئ باركود شيك فارغ انتظرت الشاشة بطاقة الطالب لتصرف قيمة الشيك له.
 */
import { api } from '../api.js';
import { esc, num, nb, avatar, ok, fail, icon, emptyState, pointsPick, bindPointsPick } from '../ui.js';

const feed = [];
let pendingVoucher = null;

const isVoucher = (code) => /^RQC\d+$/i.test(String(code || '').trim());

export async function render({ state }) {
  const points = Number(state.settings.scan_points || 25);
  const total = feed.reduce((sum, row) => sum + row.points, 0);

  return {
    title: 'مسح الباركود',
    subtitle: 'بطاقة الطالب تُضيف النقاط · باركود الشيك يُصرف على الطالب التالي',
    actions: '',
    html: `
      <div class="grid cols-2" style="grid-template-columns:minmax(320px,1.15fr) minmax(280px,1fr)">
        <div class="scan-hero">
          <h2>${icon('scan', { size: 22 })} وجّه القارئ إلى الباركود</h2>
          <p>يعمل قارئ الباركود كلوحة مفاتيح، ويُرسل تلقائياً عند نهاية القراءة</p>

          <div class="scan-frame">
            <span class="scan-frame__beam"></span>
            <input class="scan-input" data-code inputmode="latin" autocomplete="off" autofocus
                   placeholder="RQ00001" aria-label="باركود الطالب أو الشيك">
            <div class="scan-hint">
              <span class="scan-live"><i></i> الحقل جاهز لاستقبال القراءة</span>
            </div>
          </div>

          <div class="row" style="justify-content:center;margin-top:.9rem">
            <button class="btn btn--green" data-submit>${icon('check', { size: 18 })} إضافة النقاط</button>
            <button class="btn btn--ghost" data-focus>${icon('scan', { size: 18 })} تفعيل الحقل</button>
          </div>
        </div>

        <div>
          <div class="card">
            <div class="card__head"><div><h2>${icon('points')} إعدادات المسح</h2>
              <p>عدد النقاط الممنوحة لكل مسحة بطاقة</p></div></div>
            <div class="row" style="align-items:flex-start">
              ${pointsPick({ label: 'نقاط كل مسحة', value: points, allowMinus: false })}
            </div>
            <div class="field" hidden>
              <label>عدد النقاط (قيمة أخرى)</label>
              <input name="points_custom" type="number" step="5" value="${points}">
            </div>
            <p class="muted small">${icon('info', { size: 16 })} باركود الشيك الفارغ يبدأ بـ <b dir="ltr">RQC</b>
              ولا يُضيف نقاطاً إلا بعد مسح بطاقة الطالب بعده مباشرة.</p>
          </div>

          <div class="grid mt" style="grid-template-columns:1fr 1fr">
            <div class="stat stat--blue">
              <span class="stat__label">${icon('scan', { size: 16 })} عمليات الجلسة</span>
              <span class="stat__value" data-count>${num(feed.length)}</span>
            </div>
            <div class="stat stat--green">
              <span class="stat__label">${icon('points', { size: 16 })} مجموع النقاط</span>
              <span class="stat__value" data-sum>${num(total)}</span>
            </div>
          </div>
        </div>
      </div>

      <div data-pending class="mt"></div>
      <div id="scan-result" class="mt"></div>

      <div class="card mt">
        <div class="card__head"><div><h2>${icon('list')} سجل المسح في هذه الجلسة</h2>
          <p>آخر العمليات التي تمت من هذا الجهاز</p></div></div>
        <div class="scan-feed" data-feed></div>
      </div>`
  };
}

export function mount({ content }) {
  const input = content.querySelector('[data-code]');
  const result = content.querySelector('#scan-result');
  const feedBox = content.querySelector('[data-feed]');
  const counter = content.querySelector('[data-count]');
  const sumBox = content.querySelector('[data-sum]');
  const pendingBox = content.querySelector('[data-pending]');
  const readPoints = bindPointsPick(content);
  const focus = () => input.focus();

  const drawFeed = () => {
    counter.textContent = num(feed.length);
    sumBox.textContent = num(feed.reduce((sum, row) => sum + row.points, 0));
    feedBox.innerHTML = feed.length ? feed.slice(0, 30).map((row) => `
      <div class="scan-feed__row">
        ${avatar(row.student)}
        <div style="flex:1"><strong>${esc(row.student.name)}</strong>
          <span class="muted small">${esc(row.student.halaqa_name || '')} · ${row.time}${row.voucher ? ` · شيك ${esc(row.voucher)}` : ''}</span></div>
        <span class="points-pill">+${num(row.points)}</span>
      </div>`).join('') : emptyState('لم تُسجَّل أي عملية بعد', 'scan');
  };

  const drawPending = () => {
    pendingBox.innerHTML = pendingVoucher ? `
      <div class="pending-voucher">
        ${icon('cheque', { size: 22 })}
        <div style="flex:1">
          شيك ${esc(pendingVoucher.item_label)} بقيمة ${nb(pendingVoucher.points)} نقطة —
          امسح الآن بطاقة الطالب لصرفه
          <span class="muted small" dir="ltr" style="display:block">${esc(pendingVoucher.code)}</span>
        </div>
        <button class="btn btn--sm btn--ghost" data-clear-voucher>${icon('close', { size: 16 })} إلغاء</button>
      </div>` : '';
    const clear = pendingBox.querySelector('[data-clear-voucher]');
    if (clear) clear.onclick = () => { pendingVoucher = null; drawPending(); focus(); };
  };

  const showError = (message) => {
    result.innerHTML = `<div class="scan-card scan-card--err center"><strong>${esc(message)}</strong></div>`;
  };

  const showStudent = (payload, { warn = false, voucher = null } = {}) => {
    const student = payload.student;
    result.innerHTML = `
      <div class="scan-card ${warn ? 'scan-card--warn' : ''}">
        <div class="scan-result">
          ${avatar(student, 'avatar--lg')}
          <div>
            <h2 style="margin:0">${esc(student.name)}</h2>
            <p class="muted" style="margin:0">${esc(student.halaqa_name || 'بدون حلقة')}</p>
            ${warn
    ? `<strong style="color:#94540a">${esc(payload.error)}</strong>`
    : `<div class="scan-card__points">+${num(payload.points)} نقطة</div>
                 ${voucher ? `<span class="chip chip--orange">صرف شيك ${esc(voucher.item_label)}</span>` : ''}`}
            <p class="muted small" style="margin:0">الرصيد: ${nb(payload.wallet.balance)} · الإجمالي: ${nb(payload.wallet.earned)}</p>
          </div>
        </div>
      </div>`;
  };

  const pushFeed = (student, points, voucherCode = null) => {
    feed.unshift({
      student,
      points,
      voucher: voucherCode,
      time: new Date().toLocaleTimeString('ar-SA-u-ca-gregory', { hour: '2-digit', minute: '2-digit' })
    });
    drawFeed();
  };

  /** صرف الشيك المعلّق على الطالب الذي قُرئت بطاقته */
  const redeemVoucher = async (studentCode) => {
    const voucher = pendingVoucher;
    try {
      const payload = await api.post('/api/cheques/vouchers/redeem', {
        code: voucher.code, student_code: studentCode
      });
      pendingVoucher = null;
      drawPending();
      showStudent(payload, { voucher });
      pushFeed(payload.student, payload.points, voucher.code);
      ok(`${payload.student.name} +${payload.points} (شيك ${voucher.item_label})`);
    } catch (error) {
      const payload = error.payload || { error: error.message };
      showError(payload.error || error.message);
      fail(payload.error || error.message);
    }
  };

  const submit = async () => {
    const code = input.value.trim();
    if (!code) return;
    input.value = '';

    if (pendingVoucher && !isVoucher(code)) {
      await redeemVoucher(code);
      return focus();
    }

    try {
      const payload = await api.post('/api/points/scan', { code, points: readPoints() });
      if (payload.kind === 'voucher') {
        pendingVoucher = payload.voucher;
        drawPending();
        result.innerHTML = '';
        ok(`شيك ${payload.voucher.item_label} — امسح بطاقة الطالب`);
      } else {
        showStudent(payload);
        pushFeed(payload.student, payload.points);
        ok(`${payload.student.name} +${payload.points}`);
      }
    } catch (error) {
      const payload = error.payload || { error: error.message };
      if (payload.student) showStudent(payload, { warn: true });
      else showError(payload.error || error.message);
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
  drawPending();
  focus();
  // يعيد التركيز للحقل عند النقر في أي مكان فارغ من الصفحة
  content.addEventListener('click', (event) => {
    if (event.target.closest('button, a, input, select, label')) return;
    focus();
  });
}
