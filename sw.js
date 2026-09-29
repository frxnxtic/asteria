// Офлайн-кэш Астерии: cache-first, обновление по версии.
// ВАЖНО: при каждом деплое поднимать версию, иначе игроки останутся на старых файлах.
const CACHE = "asteria-v4";
const ASSETS = [
  "./", "./index.html", "./manifest.webmanifest",
  "./vendor/three.module.js", "./vendor/three.core.js",
  "./src/main.js", "./src/input.js", "./src/player.js", "./src/world.js",
  "./src/entities.js", "./src/combat.js", "./src/story.js", "./src/audio.js",
  "./src/puzzles.js", "./src/events.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(hit => hit ||
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => hit)
    )
  );
});
