const CACHE_NAME = 'mygym-v2.3.1';
const APP_SHELL = [
  '/mygym/',
  '/mygym/index.html',
  '/mygym/app.js',
  '/mygym/css/style.css',
  '/mygym/js/config.js',
  '/mygym/js/supabaseClient.js',
  '/mygym/js/utils.js',
  '/mygym/js/db.js',
  '/mygym/js/api.js',
  '/mygym/js/auth.js',
  '/mygym/js/sync.js',
  '/mygym/js/router.js',
  '/mygym/js/templates.js',
  '/mygym/js/workout.js',
  '/mygym/js/history.js',
  '/mygym/js/exercises.js',
  '/mygym/js/calendar.js',
  '/mygym/js/progress.js',
  '/mygym/js/demoData.js',
  '/mygym/pages/home.html',
  '/mygym/pages/login.html',
  '/mygym/pages/profile.html',
  '/mygym/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((err) => console.error('SW cache error', err))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.map((name) => (name !== CACHE_NAME ? caches.delete(name) : null))
      )
    ).then(() => self.clients.claim())
  );
});

function isNetworkFirst(url) {
  const host = url.hostname;
  if (host.includes('supabase.co')) return true;
  if (host.includes('jsdelivr.net')) return true;
  if (url.pathname.includes('/data/')) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) return;

  if (event.request.method !== 'GET') return;

  if (isNetworkFirst(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // App shell: stale-while-revalidate / cache-first with network update
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          }
          return response;
        })
        .catch(() => cached || new Response('Офлайн', { status: 503 }));

      return cached || networkFetch;
    })
  );
});
