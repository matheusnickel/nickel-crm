const CACHE = 'nickel-crm-v178';
const ASSETS = [
  '/nickel-crm/',
  '/nickel-crm/index.html',
  '/nickel-crm/dashboard-agente.html',
  '/nickel-crm/dashboard-gestor.html',
  '/nickel-crm/app.js',
  '/nickel-crm/firebase.js',
  '/nickel-crm/style.css',
  '/nickel-crm/manifest.json',
  '/nickel-crm/icon.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Firebase/CDN: sem cache, direto na rede
  if (e.request.url.includes('firebase') || e.request.url.includes('googleapis') || e.request.url.includes('gstatic') || e.request.url.includes('jsdelivr')) {
    return;
  }
  // JS e HTML: sempre rede primeiro (garante código atualizado); cai no cache só offline
  const url = e.request.url;
  if (url.endsWith('.js') || url.endsWith('.html') || url.endsWith('/nickel-crm/') || url.endsWith('/nickel-crm')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // Demais assets (css, imagens): cache-first com fallback rede
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
