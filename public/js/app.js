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

export const state = { user: null, settings: {}, catalog: {} };

const STAFF_NAV = [
  { path: '/', icon: 'home', label: 'الرئيسية', group: 'المتابعة' },
  { path: '/scan', icon: 'scan', label: 'المسح', group: 'الرصد' },
  { path: '/cheques', icon: 'cheque', label: 'الشيكات' },
  { path: '/students', icon: 'students', label: 'الأفراد', group: 'الإدارة' },
  { path: '/halaqat', icon: 'groups', label: 'المجموعات' },
  { path: '/store', icon: 'gift', label: 'المتجر' },
  { path: '/leaderboard', icon: 'trophy', label: 'الصدارة' },
  { path: '/settings', icon: 'settings', label: 'الإعدادات', adminOnly: true }
];

const STUDENT_NAV = [
  { path: '/', icon: 'home', label: 'صفحتي' },
  { path: '/leaderboard', icon: 'trophy', label: 'الصدارة' },
  { path: '/store', icon: 'gift', label: 'المتجر' },
  { path: '/orders', icon: 'box', label: 'طلباتي' }
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

export const isStaff = () => !!state.user && (state.user.role === 'admin' || state.user.role === 'supervisor');
export const isAdmin = () => !!state.user && state.user.role === 'admin';
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
      await loadSettings();
      window.location.hash = '#/';
      if (!data.user.must_change_code) ok(`أهلاً ${data.user.name}`);
      renderApp();
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
      window.location.hash = '#/';
      renderApp();
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
  const items = isStaff() ? STAFF_NAV : STUDENT_NAV;
  return items.filter((item) => !item.adminOnly || isAdmin());
}

function navMarkup(path, className) {
  const isSidebar = className === 'nav';
  const links = navItems().map((item) => `
    ${isSidebar && item.group ? `<span class="nav__label">${esc(item.group)}</span>` : ''}
    <a class="${item.path === path ? 'active' : ''}" href="#${item.path}">
      ${icon(item.icon)}<span>${esc(item.label)}</span>
    </a>`).join('');
  return links + (isSidebar
    ? `<span class="nav__label">أدوات</span>
       <a href="/screen.html" target="_blank" rel="noopener">${icon('screen')}<span>شاشة العرض</span></a>` : '');
}

function layout(path) {
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar__brand">
          <img src="${esc(state.settings.logo || '/img/logo.jpg')}" alt="الشعار">
          <div>
            <strong>${esc(state.settings.academy_name || 'رياض القرآن')}</strong>
            <span>منصة التحفيز</span>
          </div>
        </div>
        <nav class="nav">${navMarkup(path, 'nav')}</nav>
        <div class="sidebar__foot">
          <div class="sidebar__user">
            <span class="avatar">${esc((state.user.name || '?')[0])}</span>
            <div>
              <strong>${esc(state.user.name)}</strong><br>
              <span style="opacity:.75">${roleLabel(state.user.role)}</span>
            </div>
          </div>
          <button class="btn btn--ghost btn--sm btn--block" id="logout">${icon('logout', { size: 16 })} تسجيل الخروج</button>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="topbar__title"><h1 id="page-title">…</h1><p id="page-subtitle"></p></div>
          <div class="topbar__actions">
            <span id="page-actions" class="row" style="gap:.45rem"></span>
            ${menu({
    name: 'user',
    label: '',
    className: 'btn btn--sm btn--ghost',
    items: [
      menuItem({ label: esc(state.user.name), name: 'user', attrs: 'disabled style="opacity:.7"' }),
      menuSep(),
      menuItem({ label: 'تغيير رمز الدخول', name: 'key', attrs: 'data-menu-code' }),
      menuItem({ label: 'شاشة العرض', name: 'screen', href: '/screen.html', target: '_blank' }),
      menuSep(),
      menuItem({ label: 'تسجيل الخروج', name: 'logout', danger: true, attrs: 'data-menu-logout' })
    ]
  })}
          </div>
        </header>
        <div class="content" id="content">${spinner()}</div>
      </main>
      <nav class="mobile-nav">${navMarkup(path, 'mobile')}</nav>
    </div>`;
  const logout = async () => {
    await api.logout();
    state.user = null;
    window.location.hash = '';
    renderApp();
  };
  root.querySelector('#logout').addEventListener('click', logout);
  root.querySelector('[data-menu-logout]').addEventListener('click', logout);
  root.querySelector('[data-menu-code]').addEventListener('click', () => settingsView.changeMyCodeModal());
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

  const match = ROUTES.find((route) => route.pattern.test(path));
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

async function boot() {
  await loadSettings();
  try {
    const data = await api.me();
    state.user = data.user;
  } catch { state.user = null; }
  window.addEventListener('hashchange', () => { if (state.user) renderApp(); });
  renderApp();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

boot();
