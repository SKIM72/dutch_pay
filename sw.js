const CACHE_NAME = 'settle-up-cache-v121';
const PRECACHE_URLS = [
  './',
  './index.html',
  './login.html',
  './chat.html',
  './manifest.json',
  './style.css',
  './main.js',
  './chat.js',
  './auth.js',
  './locales.js',
  './config.js',
  './icon.png',
  './logo.png'
];

const STATIC_DESTINATIONS = new Set(['image', 'font', 'manifest']);
const FRESH_DESTINATIONS = new Set(['document', 'script', 'style', 'worker']);

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

function shouldBypassCache(request, requestUrl) {
  if (request.method !== 'GET') return true;
  if (request.headers.has('range')) return true;
  if (request.cache === 'no-store') return true;

  const pathname = requestUrl.pathname;
  return pathname.startsWith('/api/')
    || pathname.startsWith('/rest/')
    || pathname.startsWith('/auth/')
    || pathname.startsWith('/functions/');
}

function canCache(response) {
  return response
    && response.ok
    && (response.type === 'basic' || response.type === 'default');
}

function canonicalDocumentRequest(request) {
  const requestUrl = new URL(request.url);
  const pathname = requestUrl.pathname.endsWith('/') ? '/index.html' : requestUrl.pathname;
  return new Request(new URL(pathname, self.location.origin).toString(), {
    method: 'GET',
    headers: { accept: 'text/html' }
  });
}

async function putInCache(request, response) {
  if (!canCache(response)) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

async function matchCached(request) {
  return caches.match(request, { ignoreSearch: true });
}

async function networkFirst(request, fallbackRequest = request) {
  try {
    const response = await fetch(request);
    await putInCache(fallbackRequest, response);
    return response;
  } catch (error) {
    const cached = await matchCached(fallbackRequest);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await matchCached(request);
  if (cached) return cached;

  const response = await fetch(request);
  await putInCache(request, response);
  return response;
}

async function staleWhileRevalidate(request) {
  const cached = await matchCached(request);
  const refresh = fetch(request)
    .then(response => {
      putInCache(request, response);
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const response = await refresh;
  if (response) return response;
  throw new Error('NETWORK_UNAVAILABLE');
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(PRECACHE_URLS.map(url => cache.add(url))))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(cacheName => cacheName !== CACHE_NAME)
          .map(cacheName => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  if (!isSameOrigin(requestUrl) || shouldBypassCache(request, requestUrl)) return;

  if (request.mode === 'navigate' || request.destination === 'document') {
    const fallbackRequest = canonicalDocumentRequest(request);
    event.respondWith(
      networkFirst(request, fallbackRequest)
        .catch(() => matchCached('./index.html'))
    );
    return;
  }

  if (FRESH_DESTINATIONS.has(request.destination)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (STATIC_DESTINATIONS.has(request.destination)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
