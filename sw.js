const CACHE_NAME = 'mygym-v1.0.1';  // Обнови версию
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
  '/mygym/pages/exercises.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then(response => {
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            return response;
          })
          .catch(() => {
            return caches.match('/mygym/pages/home.html');
          });
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});