const CACHE_NAME = 'weeinvest-v2';
const STATIC_CACHE = 'static-v2';
const DYNAMIC_CACHE = 'dynamic-v2';

// Base du déploiement (ex: '/weeinvest/'), déduite de l'URL du service worker
const BASE = new URL('.', self.location.href).pathname;

const STATIC_ASSETS = [
  BASE,
  `${BASE}index.html`,
  `${BASE}manifest.json`,
  `${BASE}favicon.ico`,
  `${BASE}icon-192x192.png`,
  `${BASE}icon-512x512.png`,
  `${BASE}logo.svg`
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
      caches.open(DYNAMIC_CACHE)
    ])
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (![STATIC_CACHE, DYNAMIC_CACHE].includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip cross-origin requests
  if (!request.url.startsWith(self.location.origin)) return;

  // Pages (navigation) : réseau d'abord, cache en secours.
  // Évite de servir un index.html obsolète après un nouveau déploiement.
  const accept = request.headers.get('accept') || '';
  if (request.mode === 'navigate' || accept.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseToCache = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match(BASE))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((response) => {
      if (response) {
        // Return cached response and update cache in background
        if (request.method === 'GET') {
          fetch(request).then((freshResponse) => {
            if (freshResponse) {
              caches.open(DYNAMIC_CACHE).then((cache) => {
                cache.put(request, freshResponse.clone());
              });
            }
          }).catch(() => {
            // Requête de rafraîchissement échouée (hors ligne) : on garde la version en cache
          });
        }
        return response;
      }

      // If not in cache, fetch and cache
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => {
          cache.put(request, responseToCache);
        });

        return response;
      });
    })
  );
});

// Handle push notifications (optional for future use)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    self.registration.showNotification(data.title, {
      body: data.message,
      icon: `${BASE}icon-192x192.png`
    });
  }
});