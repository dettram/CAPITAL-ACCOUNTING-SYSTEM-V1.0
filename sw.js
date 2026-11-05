// Service Worker для Capital-Architect PRO
const CACHE_NAME = 'capital-architect-v4';
const STATIC_CACHE = 'capital-architect-static-v4';
const OFFLINE_URL = './offline.html';

// Статические ассеты для кэширования при установке
const STATIC_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './style.css',
  './app.js',
  './manifest.json',
  './neo-kannep-mark.svg',
  './byn-sign.svg',
  './byn-icon.svg'
];

// Установка: кэшируем статические ассеты
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Активация: удаляем старые кэши и забираем контроль над клиентами
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => {
        return Promise.all(
          keys.filter((key) => key !== STATIC_CACHE && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        );
      }),
      self.clients.claim()
    ])
  );
  // Сообщаем клиентам, что доступна новая версия SW
  event.waitUntil(
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
      });
    })
  );
});

// Fetch: стратегия "Cache First" для статических ассетов, "Network First" с fallback для остального
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Пропускаем не-HTTP(S) запросы
  if (!url.protocol.startsWith('http')) return;

  // Стратегия 1: Cache First для статических файлов
  if (request.method === 'GET' && (
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('.png') ||
    url.pathname === '/'
  )) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return fetch(request)
            .then((networkResponse) => {
              if (networkResponse.ok) {
                const clone = networkResponse.clone();
                caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
              }
              return networkResponse;
            })
            .catch(() => {
              if (request.mode === 'navigate' || url.pathname.endsWith('.html')) {
                return caches.match(OFFLINE_URL);
              }
              return new Response('Офлайн: ресурс недоступен', { status: 503, statusText: 'Offline' });
            });
        })
    );
    return;
  }

  // Стратегия 2: Network First для остальных запросов
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse.ok) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(request)
          .then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            if (request.mode === 'navigate') {
              return caches.match(OFFLINE_URL);
            }
            return new Response('Офлайн: ресурс недоступен', { status: 503, statusText: 'Offline' });
          });
      })
  );
});

// Слушаем сообщения от клиента
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
