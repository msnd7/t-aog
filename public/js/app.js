/** نواة التطبيق: تسجيل الدخول، القوائم، والتوجيه بين الشاشات */
import { api } from './api.js';
import { esc, fail, ok, spinner } from './ui.js';

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
  { path: '/', icon: '🏠', label: 'الرئيسية' },
  { path: '/students', icon: '🎓', label: 'الأفراد' },
  { path: '/halaqat', icon: '👥', label: 'المجموعات' },
  { path: '/cheques', icon: '🧾', label: 'الشيكات' },
  { path: '/scan', icon: '📷', label: 'المسح' },
  { path: '/store', icon: '🎁', label: 'المتجر' },
  { path: '/leaderboard', icon: '🏆', label: 'الصدارة' },
  { path: '/settings', icon: '⚙️', label: 'الإعدادات', adminOnly: true }
];

const STUDENT_NAV = [
  { path: '/', icon: '🏠', label: 'صفحتي' },
  { path: '/leaderboard', icon: '🏆', label: 'الصدارة' },
  { path: '/store', icon: '🎁', label: 'المتجر' },
  { path: '/orders', icon: '📦', label: 'طلباتي' }
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

function loginScreen() {
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="login">
      <div class="login__card">
        <img src="${esc(state.settings.logo || '/img/logo.jpg')}" alt="شعار المجمع">
        <h1 style="font-size:1.25rem">${esc(state.settings.academy_name || 'مجمع رياض القرآن التعليمي')}</h1>
        <p class="muted small">${esc(state.settings.academy_subtitle || '')}</p>
        <form id="login-form">
          <div class="field">
            <label for="username">اسم المستخدم</label>
            <input id="username" name="username" autocomplete="username" required inputmode="latin" placeholder="مثال: RQ00012">
          </div>
          <div class="field">
            <label for="password">كلمة المرور</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required>
          </div>
          <button class="btn btn--block" type="submit">دخول</button>
        </form>
        <div class="divider"></div>
        <a class="btn btn--ghost btn--block" href="/screen.html">📺 فتح شاشة العرض</a>
      </div>
    </div>`;
  const form = root.querySelector('#login-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const data = await api.login(form.username.value.trim(), form.password.value);
      state.user = data.user;
      await loadSettings();
      ok(`أهلاً ${data.user.name}`);
      window.location.hash = '#/';
      renderApp();
    } catch (error) {
      fail(error.message);
      button.disabled = false;
    }
  });
}

// ---- layout --------------------------------------------------------------

function navItems() {
  const items = isStaff() ? STAFF_NAV : STUDENT_NAV;
  return items.filter((item) => !item.adminOnly || isAdmin());
}

function navMarkup(path, className) {
  return navItems().map((item) => `
    <a class="${item.path === path ? 'active' : ''}" href="#${item.path}">
      <span class="ic">${item.icon}</span><span>${esc(item.label)}</span>
    </a>`).join('') + (className === 'nav'
      ? `<a href="/screen.html" target="_blank" rel="noopener"><span class="ic">📺</span><span>شاشة العرض</span></a>` : '');
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
            <span class="avatar" style="background:#fff">${esc((state.user.name || '?')[0])}</span>
            <div>
              <strong>${esc(state.user.name)}</strong><br>
              <span style="opacity:.75">${roleLabel(state.user.role)}</span>
            </div>
          </div>
          <button class="btn btn--ghost btn--sm btn--block" id="logout">تسجيل الخروج</button>
        </div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div class="topbar__title"><h1 id="page-title">…</h1><p id="page-subtitle"></p></div>
          <div class="topbar__actions" id="page-actions"></div>
        </header>
        <div class="content" id="content">${spinner()}</div>
      </main>
      <nav class="mobile-nav">${navMarkup(path, 'mobile')}</nav>
    </div>`;
  root.querySelector('#logout').addEventListener('click', async () => {
    await api.logout();
    state.user = null;
    window.location.hash = '';
    renderApp();
  });
}

function roleLabel(role) {
  return role === 'admin' ? 'مدير المنصة' : role === 'supervisor' ? 'مشرف' : 'طالب';
}

// ---- routing -------------------------------------------------------------

let currentRender = 0;

async function renderRoute() {
  const path = currentPath();
  layout(path.replace(/\/\d+$/, (m) => (path.startsWith('/students/') ? '/students' : m)));
  const content = document.getElementById('content');
  const ctx = { isStaff: isStaff(), isAdmin: isAdmin(), state };

  const match = ROUTES.find((route) => route.pattern.test(path));
  if (!match) {
    content.innerHTML = `<div class="card"><div class="empty"><span class="ic">🧭</span>الصفحة غير موجودة</div></div>`;
    return;
  }
  if ((match.staff && !ctx.isStaff) || (match.admin && !ctx.isAdmin)) {
    content.innerHTML = `<div class="card"><div class="empty"><span class="ic">🔒</span>لا تملك صلاحية الدخول لهذه الصفحة</div></div>`;
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
    content.innerHTML = `<div class="card"><div class="empty"><span class="ic">⚠️</span>${esc(error.message)}</div></div>`;
  }
}

export function renderApp() {
  document.getElementById('boot').hidden = true;
  document.getElementById('root').hidden = false;
  if (!state.user) return loginScreen();
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
  window.addEventListener('hashchange', () => { if (state.user) renderRoute(); });
  renderApp();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

boot();
