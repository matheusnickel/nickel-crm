const CACHE = 'nickel-crm-v155';
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
  // Rede com timeout de 4s; cai no cache se lenta ou offline
  e.respondWith(
    Promise.race([
      fetch(e.request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
    ]).catch(() => caches.match(e.request))
  );
});
