/**
 * Service Worker PWA Teknisi (PRD 5.4) — hanya untuk versi web; APK tidak memakainya.
 *
 * Halaman adalah shell statis (static export); data tugas diambil klien dari
 * API dan disimpan sendiri di IndexedDB. Jadi SW cukup memastikan shell dan
 * asetnya bisa dimuat saat offline.
 *
 * Strategi:
 * - Aset statis (_next/static, ikon): cache-first — isinya ber-hash, tidak berubah.
 * - Navigasi halaman: network-first; saat offline pakai shell tersimpan
 *   (query diabaikan, karena /tugas?id=A dan /tugas?id=B berbagi shell yang sama).
 * - Permintaan API (/api/*): TIDAK di-cache di sini.
 */

const VERSION = "v5";
const STATIC_CACHE = `bc-static-${VERSION}`;
const PAGE_CACHE = `bc-pages-${VERSION}`;
const OFFLINE_URL = "/offline";

const PRECACHE = [OFFLINE_URL, "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("bc-") && !k.endsWith(VERSION))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(url.pathname)) ?? caches.match(OFFLINE_URL)),
    );
  }
});
