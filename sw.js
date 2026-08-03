const CACHE_NAME = 'mygym-v0.5.1';

function detectSwBasePath() {
  try {
    const path = new URL(self.registration.scope).pathname.replace(/\/$/, '') || '';
    if (path === '/mygym' || path.startsWith('/mygym')) return '/mygym';
  } catch (_) { /* ignore */ }
  const scriptPath = self.location.pathname || '';
  if (scriptPath.startsWith('/mygym/')) return '/mygym';
  return '';
}

const BASE = detectSwBasePath();
const shell = (p) => (BASE ? `${BASE}${p}` : p);

const APP_SHELL = [
  shell('/'),
  shell('/index.html'),
  shell('/app.js'),
  shell('/css/style.css'),
  shell('/js/config.js'),
  shell('/js/supabaseClient.js'),
  shell('/js/utils.js'),
  shell('/js/db.js'),
  shell('/js/demoMode.js'),
  shell('/js/api.js'),
  shell('/js/auth.js'),
  shell('/js/sync.js'),
  shell('/js/router.js'),
  shell('/js/templates.js'),
  shell('/js/workout.js'),
  shell('/js/history.js'),
  shell('/js/exercises.js'),
  shell('/js/calendar.js'),
  shell('/js/progress.js'),
  shell('/js/demoData.js'),
  shell('/js/updateCheck.js'),
  shell('/pages/home.html'),
  shell('/pages/login.html'),
  shell('/pages/profile.html'),
  shell('/manifest.json'),
  shell('/icons/icon-192x192.png'),
  shell('/icons/favicon.svg')
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
  if (url.pathname.endsWith('version.json')) return true;
  if (url.pathname.endsWith('/sw.js')) return true;
  return false;
}

function isAppShellAsset(url) {
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  return path.endsWith('.js')
    || path.endsWith('.css')
    || path.endsWith('.html')
    || path.endsWith('/')
    || path.includes('/pages/');
}

function networkFirst(request) {
  return fetch(request, { cache: 'no-store' })
    .then((response) => {
      if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => {});
      }
      return response;
    })
    .catch(() => caches.match(request));
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) return;
  if (event.request.method !== 'GET') return;

  if (isNetworkFirst(url) || isAppShellAsset(url)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

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
