const CACHE_NAME = 'mygym-v1.0.3';
const urlsToCache = [
  '/mygym/',
  '/mygym/index.html',
  '/mygym/app.js',
  '/mygym/css/style.css',
  '/mygym/js/auth.js',
  '/mygym/js/db.js',
  '/mygym/js/sync.js',
  '/mygym/js/router.js',
  '/mygym/js/templates.js',
  '/mygym/js/workout.js',
  '/mygym/js/history.js',
  '/mygym/js/exercises.js',
  '/mygym/js/utils.js',
  '/mygym/data/users.json',
  '/mygym/data/exercises.json',
  '/mygym/pages/home.html',
  '/mygym/pages/templates.html',
  '/mygym/pages/template-edit.html',
  '/mygym/pages/workout.html',
  '/mygym/pages/history.html',
  '/mygym/pages/exercises.html',
  '/mygym/pages/profile.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: кэширование файлов', CACHE_NAME);
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.error('Service Worker: ошибка кэширования:', err);
      })
  );
  // Принудительно активируем новый SW сразу
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: удаление старого кэша', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Захватываем контроль над всеми вкладками
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Пропускаем запросы не по HTTP(S)
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest)
          .then(response => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            const responseToCache = response.clone();
            const hostname = url.hostname;
            
            // Кэшируем только наши файлы и CDN
            if (hostname === 'k4rtosh.github.io' || 
                hostname === 'cdn.jsdelivr.net' ||
                hostname === 'fonts.googleapis.com' ||
                hostname === 'fonts.gstatic.com') {
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                })
                .catch(() => {});
            }
            
            return response;
          })
          .catch(() => {
            if (url.pathname.includes('html')) {
              return caches.match('/mygym/pages/home.html');
            }
            return new Response('Офлайн режим', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});