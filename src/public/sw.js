const CACHE_NAME = 'bella-chic-v3';

// Arquivos essenciais para funcionar offline (shell do app)
const STATIC_ASSETS = ['/', '/manifest.json'];

// ─── Install — pré-cacheia assets essenciais ─────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ─── Activate — limpa caches antigos ─────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── Fetch — network first, fallback para cache ───────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  const origin = self.location.origin;

  // ── Regra: só intercepta recursos estáticos do próprio domínio ──────────────
  // Qualquer coisa externa (Google, Firebase, APIs) passa diretamente pela rede.
  // Isso evita o auth/internal-error causado pelo SW interceptando Firebase Auth.
  const isExternal = !url.startsWith(origin);
  const isExcluded =
    url.includes('/api/') ||
    url.includes('googleapis.com') ||
    url.includes('gstatic.com') ||
    url.includes('firebaseapp.com') ||
    url.includes('firebaseio.com') ||
    url.includes('firebase') ||
    url.includes('google') ||
    url.includes('cloudinary') ||
    url.includes('asaas') ||
    url.includes('groq') ||
    url.includes('viacep');

  if (isExternal || isExcluded || event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cacheia páginas e assets estáticos
        if (response.ok && (
          event.request.destination === 'document' ||
          event.request.destination === 'script' ||
          event.request.destination === 'style'
        )) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ─── Push Notifications ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Bella & Chic', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Bella & Chic', {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      data: { url: data.url || '/' },
      vibrate: [100, 50, 100],
      requireInteraction: data.requireInteraction || false,
      tag: data.tag || 'bella-chic',   // evita empilhar notificações iguais
    })
  );
});

// ─── Notificationclick — abre o app na tela certa ────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Se já tem uma janela aberta, foca ela e navega
      for (const client of list) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(url);
          return;
        }
      }
      // Senão abre uma nova janela
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
