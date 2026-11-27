// Офлайн: всё приложение кэшируется на телефоне. При изменении файлов поднимать VERSION.
const VERSION = "jp-v4";
const MEDIA = "jp-media";   // картинки и звук — отдельный кэш, не стирается при обновлении версии
const FILES = ["./", "index.html", "style.css", "words.js", "images.js", "srs.js", "app.js", "manifest.webmanifest",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];
try { importScripts("images.js"); } catch (e) { self.IMAGES = {}; }
// докачать все картинки заранее, чтобы без интернета были все; по одной, ошибки не мешают установке
async function warmMedia() {
  const c = await caches.open(MEDIA);
  for (const p of Object.values(self.IMAGES || {})) {
    if (!(await c.match(p))) { try { await c.add(p); } catch (e) {} }
  }
}
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== MEDIA).map(k => caches.delete(k))))
    .then(() => self.clients.claim()).then(warmMedia));
});
// Сначала сеть (чтобы обновления приходили сразу), без сети — из кэша. Картинки и звук — сначала из кэша.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  const media = /\.(webp|png|jpg|mp3|m4a)$/i.test(url.pathname);
  if (media) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const copy = res.clone(); caches.open(MEDIA).then(c => c.put(e.request, copy)); return res;
    })));
    return;
  }
  e.respondWith(fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
