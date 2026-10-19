// Çevrimdışı oynamak için: önce ağ, ağ yoksa önbellek. Sürüm değişince eski önbellek silinir.
const CACHE = 'ayi-v8';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'icerik/icerik.json',
  'css/oyun.css', 'css/bulmaca.css', 'css/panel.css',
  'js/main.js', 'js/core/store.js', 'js/core/speech.js', 'js/core/sfx.js', 'js/core/content.js',
  'js/engine/input.js', 'js/engine/physics.js',
  'js/world/bear.js', 'js/world/props.js', 'js/world/world.js',
  'js/world/sky.js', 'js/world/water.js', 'js/world/decor.js', 'js/world/particles.js',
  'js/puzzles/index.js', 'js/parent/panel.js', 'js/ui/gardrop.js', 'css/gardrop.css',
  'ikon/ikon-192.png', 'ikon/ikon-512.png',
  'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
