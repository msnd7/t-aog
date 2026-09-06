/* عامل الخدمة: يتيح تثبيت المنصة كتطبيق وتشغيل الواجهة دون اتصال */
const CACHE = 'riyad-shell-v1';
const SHELL = [
  '/', '/index.html', '/screen.html', '/print.html', '/cards.html', '/offline.html',
  '/css/app.css', '/css/screen.css', '/css/print.css', '/css/cards.css',
  '/js/app.js', '/js/api.js', '/js/ui.js', '/js/barcode.js', '/js/screen.js', '/js/print.js', '/js/cards.js',
  '/js/views/shared.js', '/js/views/dashboard.js', '/js/views/students.js', '/js/views/student-profile.js',
  '/js/views/halaqat.js', '/js/views/cheques.js', '/js/views/scan.js', '/js/views/store.js',
  '/js/views/leaderboard.js', '/js/views/settings.js', '/js/views/my-page.js', '/js/views/my-orders.js',
  '/vendor/JsBarcode.code128.min.js',
  '/manifest.webmanifest', '/img/logo.jpg', '/img/favicon.png', '/img/icon-192.png', '/img/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // طلبات البيانات: الشبكة أولاً حتى تبقى النقاط محدّثة
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => caches.match(request)
      .then((cached) => cached || new Response(JSON.stringify({ error: 'لا يوجد اتصال بالإنترنت' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }))));
    return;
  }

  // الصور المرفوعة: الكاش أولاً
  if (url.pathname.startsWith('/uploads/')) {
    event.respondWith(caches.match(request).then((cached) => cached
      || fetch(request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
        return response;
      }).catch(() => cached)));
    return;
  }

  // هيكل التطبيق: الكاش أولاً مع تحديث في الخلفية
  event.respondWith(caches.match(request).then((cached) => {
    const network = fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => cached || caches.match('/offline.html'));
    return cached || network;
  }));
});
