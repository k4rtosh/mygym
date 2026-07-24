const CACHE_NAME = 'mygym-v1.0.1';
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
      .then(cache => {
        console.log('Service Worker: кэширование файлов');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.error('Service Worker: ошибка кэширования:', err);
      })
  );
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
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Пропускаем запросы к расширениям браузера и другим не-http(s) запросам
  const url = new URL(event.request.url);
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Пропускаем запросы к chrome-extension
  if (url.protocol === 'chrome-extension:') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        
        // Клонируем запрос, так как его можно использовать только один раз
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest)
          .then(response => {
            // Проверяем, что ответ валидный
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Клонируем ответ, так как его можно использовать только один раз
            const responseToCache = response.clone();
            
            // Кэшируем только если это наш сайт
            if (url.hostname === window.location.hostname || url.hostname === 'cdn.jsdelivr.net') {
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                })
                .catch(err => {
                  // Игнорируем ошибки кэширования
                });
            }
            
            return response;
          })
          .catch(error => {
            console.error('Fetch error:', error);
            // Возвращаем fallback страницу
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