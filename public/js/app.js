/** نواة التطبيق: تسجيل الدخول، القوائم، والتوجيه بين الشاشات */
import { api } from './api.js';
import { esc, fail, ok, spinner, icon, menu, menuItem, menuSep } from './ui.js';

import * as dashboard from './views/dashboard.js';
import * as students from './views/students.js';
import * as studentProfile from './views/student-profile.js';
import * as halaqat from './views/halaqat.js';
import * as cheques from './views/cheques.js';
import * as scan from './views/scan.js';
import * as store from './views/store.js';
import * as leaderboard from './views/leaderboard.js';
import * as settingsView from './views/settings.js';
import * as myPage from './views/my-page.js';
import * as myOrders from './views/my-orders.js';
import * as platform from './views/platform.js';
import * as platformSettings from './views/platform-settings.js';

/** mosque: المسجد الذي تعمل عليه الواجهة الآن (null لمدير المنصة في لوحة المنصة) */
export const state = { user: null, mosque: null, settings: {}, catalog: {} };

/**
 * عناصر التنقل. dock: يظهر في الشريط السفلي للجوال، fab: الزر البارز في منتصفه،
 * والبقية تُجمع في لوحة «المزيد».
 */
const STAFF_NAV = [
  { path: '/', icon: 'home', label: 'الرئيسية', dock: true },
  { path: '/scan', icon: 'scan', label: 'المسح', fab: true },
  { path: '/cheques', icon: 'cheque', label: 'الشيكات', dock: true },
  { path: '/students', icon: 'students', label: 'الأفراد', dock: true },
  { path: '/halaqat', icon: 'groups', label: 'المجموعات' },
  { path: '/store', icon: 'gift', label: 'المتجر' },
  { path: '/leaderboard', icon: 'trophy', label: 'الصدارة' },
  { path: '/settings', icon: 'settings', label: 'الإعدادات', adminOnly: true }
];

/** لوحة مدير المنصة قبل دخول أي مسجد */
const PLATFORM_NAV = [
  { path: '/', icon: 'home', label: 'لوحة المنصة', dock: true },
  { path: '/accounts', icon: 'settings', label: 'الحسابات والإعدادات', dock: true }
];

const STUDENT_NAV = [
  { path: '/', icon: 'home', label: 'صفحتي', dock: true },
  { path: '/leaderboard', icon: 'trophy', label: 'الصدارة', dock: true },
  { path: '/store', icon: 'gift', label: 'المتجر', dock: true },
  { path: '/orders', icon: 'box', label: 'طلباتي', dock: true }
];

const ROUTES = [
  { pattern: /^\/$/, view: (ctx) => (ctx.isStaff ? dashboard : myPage) },
  { pattern: /^\/students$/, view: () => students, staff: true },
  { pattern: /^\/students\/(\d+)$/, view: () => studentProfile, staff: true },
  { pattern: /^\/halaqat$/, view: () => halaqat, staff: true },
  { pattern: /^\/halaqat\/(\d+)$/, view: () => halaqat, staff: true },
  { pattern: /^\/cheques$/, view: () => cheques, staff: true },
  { pattern: /^\/scan$/, view: () => scan, staff: true },
  { pattern: /^\/store$/, view: () => store },
  { pattern: /^\/leaderboard$/, view: () => leaderboard },
  { pattern: /^\/orders$/, view: () => myOrders },
  { pattern: /^\/settings$/, view: () => settingsView, admin: true }
];

const PLATFORM_ROUTES = [
  { pattern: /^\/$/, view: () => platform },
  { pattern: /^\/accounts$/, view: () => platformSettings }
];

export const isStaff = () => !!state.user && (state.user.role === 'admin' || state.user.role === 'supervisor');
export const isAdmin = () => !!state.user && state.user.role === 'admin';
/** مدير المنصة في لوحة المنصة (لم يدخل مسجداً بعد) */
export const isPlatform = () => isAdmin() && !state.mosque;
export const screenUrl = () => (state.mosque ? `/screen.html?mosque=${state.mosque.id}` : '/screen.html');

/**
 * الانتقال إلى الشاشة الرئيسية برسم واحد: يُضبط الرابط على #/ دون إطلاق hashchange
 * حتى لا تُرسم الصفحة مرتين متزامنتين فتبقى إحداهما فارغة.
 */
function goHome() {
  if (window.location.hash !== '#/') history.replaceState(null, '', '#/');
  renderApp();
}

/** آخر مسجد دخله مدير المنصة على هذا الجهاز، ليعود إلى لوحته مباشرة بعد الدخول */
const LAST_MOSQUE_KEY = 'rq_last_mosque';
function rememberMosque(id) {
  try { if (id) localStorage.setItem(LAST_MOSQUE_KEY, String(id)); } catch { /* التخزين غير متاح */ }
}

/** دخول مدير المنصة إلى واجهة مسجد، أو العودة إلى لوحة المنصة بتمرير null */
export async function enterMosque(id) {
  try {
    const data = await api.post('/api/mosques/enter', { id: id || 0 });
    state.mosque = data.mosque;
    if (data.mosque) rememberMosque(data.mosque.id);
    await loadSettings();
    goHome();
    if (data.mosque) ok(`أنت الآن في واجهة ${data.mosque.name}`);
  } catch (error) { fail(error.message); }
}

/**
 * بعد تسجيل الدخول (أو تغيير الرمز المؤقت): تُفتح لوحة التحكم مباشرة. المشرف والطالب
 * في مسجدهما أصلاً، ومدير المنصة يدخل لوحة آخر مسجد عمل عليه، وإلا أول مسجد مفعَّل،
 * ولوحة المنصة تبقى على بُعد نقرة من زر «المنصة».
 */
async function landAfterLogin() {
  if (isAdmin() && !state.mosque) {
    try {
      const { mosques = [] } = await api.get('/api/mosques/public');
      let target = null;
      try { target = Number(localStorage.getItem(LAST_MOSQUE_KEY)) || null; } catch { /* لا شيء */ }
      if (!mosques.some((m) => m.id === target)) target = mosques.length ? mosques[0].id : null;
      if (target) {
        const data = await api.post('/api/mosques/enter', { id: target });
        state.mosque = data.mosque;
        rememberMosque(target);
        await loadSettings();
      }
    } catch { /* يبقى في لوحة المنصة */ }
  }
  goHome();
}
export const navigate = (path) => { window.location.hash = `#${path}`; };

function currentPath() {
  const hash = window.location.hash.replace(/^#/, '');
  return hash || '/';
}

// ---- login ---------------------------------------------------------------

// الرمز الذي استُخدم في آخر دخول، حتى لا يُطلب من المستخدم إعادة كتابته
// في شاشة تغيير الرمز الإجبارية.
let lastUsedCode = null;

function loginScreen() {
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="login">
      <div class="login__card">
        <img src="${esc(state.settings.logo || '/img/logo.jpg')}" alt="شعار المجمع">
        <h1 style="font-size:1.25rem">${esc(state.settings.academy_name || 'مجمع رياض القرآن التعليمي')}</h1>
        <p class="muted small">${esc(state.settings.academy_subtitle || '')}</p>

        <form id="phone-form" class="mt">
          <div class="field">
            <label for="phone">رقم الجوال</label>
            <input id="phone" name="phone" inputmode="tel" autocomplete="tel" dir="ltr"
                   class="code-input" placeholder="05xxxxxxxx" required>
            <span class="hint">سجّل الدخول برقم جوالك المسجَّل لدى المشرف.</span>
          </div>
          <button class="btn btn--block" type="submit">التالي</button>
        </form>

        <form id="code-form" class="mt" hidden>
          <p class="muted small" id="welcome"></p>
          <div class="field">
            <label for="code">رمز الدخول</label>
            <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" dir="ltr"
                   class="code-input" maxlength="6" placeholder="••••" required>
            <span class="hint">الرمز المؤقت لأول دخول هو <b dir="ltr">${esc(state.settings.default_code || '1234')}</b> ثم تُطلب منك شاشة تغييره.</span>
          </div>
          <button class="btn btn--block" type="submit">دخول</button>
          <button class="btn btn--ghost btn--block mt" type="button" id="back">تغيير رقم الجوال</button>
        </form>

        <div class="divider"></div>
        <a class="btn btn--ghost btn--block" href="/screen.html">${icon('screen', { size: 18 })} فتح شاشة العرض</a>
      </div>
    </div>`;

  const phoneForm = root.querySelector('#phone-form');
  const codeForm = root.querySelector('#code-form');
  const phoneInput = root.querySelector('#phone');
  const codeInput = root.querySelector('#code');
  phoneInput.focus();

  phoneForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = phoneForm.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const data = await api.post('/api/auth/check-phone', { phone: phoneInput.value });
      phoneInput.value = data.phone;
      root.querySelector('#welcome').textContent = `أهلاً ${data.name} — أدخل رمز الدخول`;
      phoneForm.hidden = true;
      codeForm.hidden = false;
      codeInput.focus();
    } catch (error) {
      fail(error.message);
    } finally {
      button.disabled = false;
    }
  });

  root.querySelector('#back').addEventListener('click', () => {
    codeForm.hidden = true;
    phoneForm.hidden = false;
    codeInput.value = '';
    phoneInput.focus();
  });

  codeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = codeForm.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const data = await api.post('/api/auth/login', { phone: phoneInput.value, code: codeInput.value });
      state.user = data.user;
      lastUsedCode = codeInput.value.trim();
      await loadMe();
      await loadSettings();
      if (state.user && state.user.must_change_code) return goHome();
      ok(`أهلاً ${data.user.name}`);
      await landAfterLogin();
    } catch (error) {
      fail(error.message);
      codeInput.value = '';
      codeInput.focus();
    } finally {
      button.disabled = false;
    }
  });
}

/** شاشة إجبارية بعد أول دخول: استبدال الرمز المؤقت برمز خاص بالمستخدم */
function changeCodeScreen() {
  const root = document.getElementById('root');
  const knownCode = lastUsedCode;
  root.innerHTML = `
    <div class="login">
      <div class="login__card">
        <img src="${esc(state.settings.logo || '/img/logo.jpg')}" alt="شعار المجمع">
        <h1 style="font-size:1.2rem">اختر رمز الدخول الخاص بك</h1>
        <p class="muted small">أهلاً ${esc(state.user.name)} — لحماية حسابك استبدل الرمز المؤقت برمز تختاره أنت.</p>
        <form id="change-form" class="mt">
          ${knownCode ? '' : `
            <div class="field">
              <label for="current">الرمز الحالي</label>
              <input id="current" name="current" inputmode="numeric" dir="ltr" class="code-input" maxlength="6" required>
            </div>`}
          <div class="field">
            <label for="next">الرمز الجديد</label>
            <input id="next" name="next" inputmode="numeric" dir="ltr" class="code-input" maxlength="6"
                   minlength="4" pattern="\\d{4,6}" required autocomplete="new-password">
            <span class="hint">من ٤ إلى ٦ أرقام، ويجب أن يختلف عن الرمز المؤقت <b dir="ltr">${esc(state.settings.default_code || '1234')}</b>.</span>
          </div>
          <div class="field">
            <label for="confirm">تأكيد الرمز الجديد</label>
            <input id="confirm" name="confirm" inputmode="numeric" dir="ltr" class="code-input" maxlength="6"
                   minlength="4" pattern="\\d{4,6}" required autocomplete="new-password">
          </div>
          <button class="btn btn--block" type="submit">حفظ الرمز والمتابعة</button>
        </form>
        <button class="btn btn--ghost btn--block mt" id="logout-change">تسجيل الخروج</button>
      </div>
    </div>`;

  const form = root.querySelector('#change-form');
  form.next.focus();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const data = await api.post('/api/auth/code', {
        current: knownCode || form.current.value,
        next: form.next.value,
        confirm: form.confirm.value
      });
      state.user = data.user;
      lastUsedCode = null;
      ok('تم حفظ رمزك الجديد');
      await loadMe();
      await landAfterLogin();
    } catch (error) {
      fail(error.message);
      button.disabled = false;
    }
  });
  root.querySelector('#logout-change').addEventListener('click', async () => {
    await api.logout();
    state.user = null;
    lastUsedCode = null;
    renderApp();
  });
}

// ---- layout --------------------------------------------------------------

function navItems() {
  if (isPlatform()) return PLATFORM_NAV;
  const items = isStaff() ? STAFF_NAV : STUDENT_NAV;
  return items.filter((item) => !item.adminOnly || isAdmin());
}

/** روابط التنقل الأفقية في الشريط العلوي (الحاسب والآيباد العريض) */
function topNavMarkup(path) {
  return navItems().map((item) => `
    <a class="${item.path === path ? 'active' : ''}" href="#${item.path}">
      ${icon(item.icon, { size: 18 })}<span>${esc(item.label)}</span>
    </a>`).join('');
}

/** الشريط السفلي العائم للجوال: أهم الشاشات وزر المسح البارز وزر «المزيد» */
function dockMarkup(path) {
  const items = navItems();
  const link = (item) => `
    <a class="${item.path === path ? 'active' : ''}" href="#${item.path}">
      ${icon(item.icon, { size: 22 })}<span>${esc(item.label)}</span>
    </a>`;
  const docked = items.filter((item) => item.dock);
  const fab = items.find((item) => item.fab);
  const rest = items.filter((item) => !item.dock && !item.fab);
  const cells = docked.map(link);
  if (fab) {
    cells.splice(Math.min(1, cells.length), 0, `
      <a class="dock__fab ${fab.path === path ? 'active' : ''}" href="#${fab.path}" aria-label="${esc(fab.label)}">
        <i>${icon(fab.icon, { size: 26, stroke: 2 })}</i><span>${esc(fab.label)}</span>
      </a>`);
  }
  if (rest.length || state.mosque) {
    const inMore = rest.some((item) => item.path === path);
    cells.push(`<button type="button" class="${inMore ? 'active' : ''}" data-open-sheet>
      ${icon('more', { size: 22 })}<span>المزيد</span></button>`);
  }
  return cells.join('');
}

/** لوحة «المزيد» على الجوال: بقية الشاشات والأدوات وحساب المستخدم */
function openMoreSheet(path) {
  const rest = navItems().filter((item) => !item.dock && !item.fab);
  const tile = ({ href = '', label, name, attrs = '', active = false, danger = false, target = '' }) => {
    const inner = `<i>${icon(name, { size: 22 })}</i><span>${esc(label)}</span>`;
    const cls = `${active ? 'active' : ''} ${danger ? 'danger' : ''}`;
    return href
      ? `<a class="${cls}" href="${esc(href)}" ${target ? `target="${target}" rel="noopener"` : ''} ${attrs}>${inner}</a>`
      : `<button type="button" class="${cls}" ${attrs}>${inner}</button>`;
  };
  const host = document.getElementById('modal-host');
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="المزيد">
      <div class="sheet__grip"></div>
      <div class="sheet__user">
        <span class="userbtn__avatar">${esc((state.user.name || '?')[0])}</span>
        <div><strong>${esc(state.user.name)}</strong>
          <span>${roleLabel(state.user.role)}${state.mosque ? ` · ${esc(state.mosque.name)}` : ''}</span></div>
      </div>
      ${rest.length ? `
        <div class="sheet__title">الشاشات</div>
        <div class="sheet__grid">
          ${rest.map((item) => tile({ href: `#${item.path}`, label: item.label, name: item.icon, active: item.path === path })).join('')}
        </div>` : ''}
      <div class="sheet__title">أدوات</div>
      <div class="sheet__grid">
        ${state.mosque ? tile({ href: screenUrl(), label: 'شاشة العرض', name: 'screen', target: '_blank' }) : ''}
        ${state.mosque && isStaff() ? tile({ label: 'فترة الشاشة', name: 'calendar', attrs: 'data-sheet-screen' }) : ''}
        ${tile({ label: 'تغيير الرمز', name: 'key', attrs: 'data-sheet-code' })}
        ${isAdmin() && state.mosque ? tile({ label: 'لوحة المنصة', name: 'home', attrs: 'data-sheet-platform' }) : ''}
        ${tile({ label: 'تسجيل الخروج', name: 'logout', danger: true, attrs: 'data-sheet-logout' })}
      </div>
    </div>`;
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop || event.target.closest('a')) close();
  });
  const on = (selector, fn) => {
    const el = backdrop.querySelector(selector);
    if (el) el.addEventListener('click', () => { close(); fn(); });
  };
  on('[data-sheet-code]', () => settingsView.changeMyCodeModal());
  on('[data-sheet-screen]', () => settingsView.screenSettingsModal());
  on('[data-sheet-platform]', () => enterMosque(null));
  on('[data-sheet-logout]', () => logout());
  host.appendChild(backdrop);
}

async function logout() {
  await api.logout();
  state.user = null;
  state.mosque = null;
  window.location.hash = '';
  await loadSettings();
  renderApp();
}

function layout(path) {
  const root = document.getElementById('root');
  const academy = state.settings.academy_name || 'رياض القرآن';
  const where = isPlatform() ? 'لوحة المنصة — كل المساجد' : state.mosque ? state.mosque.name : 'منصة التحفيز';
  root.innerHTML = `
    <div class="shell">
      <header class="appbar">
        <div class="appbar__row">
          <a class="brand" href="#/">
            <img src="${esc(state.settings.logo || '/img/logo.jpg')}" alt="الشعار">
            <div>
              <strong>${esc(academy)}</strong>
              <span>${icon(isPlatform() ? 'home' : 'mosque', { size: 12 })}${esc(where)}</span>
            </div>
          </a>
          <div class="appbar__tools">
            ${state.mosque && isAdmin() ? `<button class="mosque-chip" type="button" data-leave-mosque title="العودة للوحة المنصة">${icon('back', { size: 14 })}<span>المنصة</span></button>` : ''}
            ${state.mosque ? `<a class="appbar__icon appbar__screen" href="${screenUrl()}" target="_blank" rel="noopener" title="شاشة العرض">${icon('screen', { size: 19 })}</a>` : ''}
            ${menu({
    name: '',
    label: '',
    caret: false,
    className: 'userbtn',
    items: [
      menuItem({ label: `${state.user.name} · ${roleLabel(state.user.role)}`, name: 'user', attrs: 'disabled style="opacity:.75"' }),
      menuSep(),
      menuItem({ label: 'تغيير رمز الدخول', name: 'key', attrs: 'data-menu-code' }),
      ...(state.mosque ? [menuItem({ label: 'شاشة العرض', name: 'screen', href: screenUrl(), target: '_blank' })] : []),
      ...(state.mosque && isStaff() ? [menuItem({ label: 'فترة شاشة العرض', name: 'calendar', attrs: 'data-menu-screen' })] : []),
      ...(isAdmin() && state.mosque ? [menuItem({ label: 'العودة للوحة المنصة', name: 'home', attrs: 'data-leave-mosque' })] : []),
      menuSep(),
      menuItem({ label: 'تسجيل الخروج', name: 'logout', danger: true, attrs: 'data-menu-logout' })
    ]
  })}
          </div>
        </div>
      </header>
      <div class="navbar"><nav class="topnav" aria-label="التنقل الرئيسي">${topNavMarkup(path)}</nav></div>
      <section class="pagehead">
        <div class="pagehead__inner">
          <div>
            <span class="pagehead__eyebrow">${icon(isPlatform() ? 'home' : 'mosque', { size: 14 })} ${esc(where)}</span>
            <h1 id="page-title">…</h1><p id="page-subtitle"></p>
          </div>
          <div class="pagehead__actions" id="page-actions"></div>
        </div>
      </section>
      <main class="content" id="content">${spinner()}</main>
      <nav class="dock" aria-label="التنقل السريع">${dockMarkup(path)}</nav>
    </div>`;

  // زر المستخدم: الحرف الأول من الاسم مع الاسم والصلاحية
  const userButton = root.querySelector('.userbtn');
  userButton.innerHTML = `
    <span class="userbtn__avatar">${esc((state.user.name || '?')[0])}</span>
    <span class="userbtn__meta">${esc(state.user.name)}<small>${roleLabel(state.user.role)}</small></span>
    ${icon('chevron', { size: 14 })}`;
  userButton.setAttribute('aria-label', 'حسابي');

  root.querySelector('[data-menu-logout]').addEventListener('click', logout);
  root.querySelector('[data-menu-code]').addEventListener('click', () => settingsView.changeMyCodeModal());
  const screenItem = root.querySelector('[data-menu-screen]');
  if (screenItem) screenItem.addEventListener('click', () => settingsView.screenSettingsModal());
  const sheetButton = root.querySelector('[data-open-sheet]');
  if (sheetButton) sheetButton.addEventListener('click', () => openMoreSheet(path));
  root.querySelectorAll('[data-leave-mosque]').forEach((button) => {
    button.addEventListener('click', () => enterMosque(null));
  });
}

function roleLabel(role) {
  return role === 'admin' ? 'مدير المنصة' : role === 'supervisor' ? 'مشرف' : 'طالب';
}

// ---- routing -------------------------------------------------------------

let currentRender = 0;

async function renderRoute() {
  const path = currentPath();
  // أي نافذة منبثقة مفتوحة تُغلق عند الانتقال لشاشة أخرى
  document.getElementById('modal-host').innerHTML = '';
  layout(path.replace(/\/\d+$/, (m) => (path.startsWith('/students/') ? '/students' : m)));
  const content = document.getElementById('content');
  const ctx = { isStaff: isStaff(), isAdmin: isAdmin(), state };

  const match = (isPlatform() ? PLATFORM_ROUTES : ROUTES).find((route) => route.pattern.test(path));
  if (!match) {
    content.innerHTML = `<div class="card"><div class="empty">${icon('compass', { size: 40, stroke: 1.3 })}الصفحة غير موجودة</div></div>`;
    return;
  }
  if ((match.staff && !ctx.isStaff) || (match.admin && !ctx.isAdmin)) {
    content.innerHTML = `<div class="card"><div class="empty">${icon('lock', { size: 40, stroke: 1.3 })}لا تملك صلاحية الدخول لهذه الصفحة</div></div>`;
    return;
  }

  const params = path.match(match.pattern).slice(1);
  const view = match.view(ctx);
  const token = ++currentRender;
  try {
    const result = await view.render({ params, ctx, state });
    if (token !== currentRender) return;
    document.getElementById('page-title').textContent = result.title || '';
    document.getElementById('page-subtitle').textContent = result.subtitle || '';
    document.getElementById('page-actions').innerHTML = result.actions || '';
    content.innerHTML = result.html;
    if (view.mount) view.mount({ content, root: document.getElementById('root'), params, refresh: renderRoute, result });
  } catch (error) {
    console.error(error);
    if (error.status === 401) { state.user = null; return renderApp(); }
    if (error.payload && error.payload.code_change_required) {
      state.user = { ...state.user, must_change_code: true };
      return renderApp();
    }
    // انتهى اختيار المسجد (أو عُطِّل): العودة إلى لوحة المنصة
    if (error.payload && error.payload.mosque_required && isAdmin() && state.mosque) {
      state.mosque = null;
      return goHome();
    }
    content.innerHTML = `<div class="card"><div class="empty">${icon('warning', { size: 40, stroke: 1.3 })}${esc(error.message)}</div></div>`;
  }
}

export function renderApp() {
  document.getElementById('boot').hidden = true;
  document.getElementById('root').hidden = false;
  if (!state.user) return loginScreen();
  if (state.user.must_change_code) return changeCodeScreen();
  return renderRoute();
}

async function loadSettings() {
  try {
    const data = await api.get('/api/settings');
    state.settings = data.settings || {};
    state.catalog = data.catalog || {};
  } catch { /* الإعدادات العامة اختيارية */ }
}

async function loadMe() {
  try {
    const data = await api.me();
    state.user = data.user;
    state.mosque = data.mosque || null;
  } catch { state.user = null; state.mosque = null; }
}

async function boot() {
  await loadMe();
  await loadSettings();
  window.addEventListener('hashchange', () => { if (state.user) renderApp(); });
  renderApp();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

boot();
