const CACHE = 'nickel-crm-v30';
const ASSETS = [
  '/nickel-crm/',
  '/nickel-crm/index.html',
  '/nickel-crm/dashboard-agente.html',
  '/nickel-crm/dashboard-gestor.html',
  '/nickel-crm/app.js',
  '/nickel-crm/firebase.js',
  '/nickel-crm/style.css',
  '/nickel-crm/manifest.json',
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
  // Always fetch from network for Firebase/CDN requests
  if (e.request.url.includes('firebase') || e.request.url.includes('googleapis') || e.request.url.includes('gstatic') || e.request.url.includes('jsdelivr')) {
    return;
  }
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
