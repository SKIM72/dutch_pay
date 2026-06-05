const CACHE_NAME = 'settle-up-cache-v114'; // 코드가 변경될 때마다 버전 번호를 올려주세요!
const urlsToCache = [
  './',
  './index.html',
  './login.html',
  './chat.html',
  './style.css',
  './main.js',
  './chat.js',
  './auth.js',
  './locales.js',
  './config.js',
  './icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const networkFirstTargets = ['document', 'script', 'style', 'worker'];
  const useNetworkFirst = event.request.mode === 'navigate' || networkFirstTargets.includes(event.request.destination);

  if (useNetworkFirst) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          return response;
        })
        .catch(() => caches.match(event.request).then(response => response || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request).then(networkResponse => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        return networkResponse;
      });
    })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 🚀 [핵심 추가] 메인 파일(main.js)에서 업데이트 알림 수락 시 기존 캐시를 무시하고 즉시 새 버전을 활성화하도록 명령 수신
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
