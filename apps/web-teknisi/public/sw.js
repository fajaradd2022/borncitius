/**
 * Service Worker PWA Teknisi (PRD 5.4).
 *
 * Tujuannya membuat aplikasi tetap terbuka saat teknisi berada di lokasi tanpa
 * sinyal. Pengiriman data sendiri sudah ditangani antrian IndexedDB di aplikasi;
 * yang ditangani di sini adalah agar halaman dan asetnya tetap bisa dimuat.
 *
 * Strategi:
 * - Aset statis (_next/static, ikon): cache-first — isinya ber-hash, tidak berubah.
 * - Navigasi halaman: network-first dengan fallback ke halaman offline, supaya
 *   data yang tampil selalu yang terbaru saat ada sinyal.
 * - Permintaan API (/api/*): TIDAK di-cache. Menyajikan data task basi dari
 *   cache lebih berbahaya daripada menampilkan error yang jujur.
 */

const VERSION = "v3";
const STATIC_CACHE = `bc-static-${VERSION}`;
const PAGE_CACHE = `bc-pages-${VERSION}`;
const OFFLINE_URL = "/offline";

// "/" ikut di-precache agar daftar tugas tetap bisa dibuka tanpa sinyal.
// Halaman detail tugas hanya tersedia offline bila sudah pernah dimuat lewat
// navigasi penuh — di luar itu, fallback offline yang jujur lebih baik
// daripada menampilkan data task yang mungkin sudah basi.
const PRECACHE = ["/", OFFLINE_URL, "/manifest.json", "/icon-192.png", "/icon-512.png"];

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

  // Data task tidak pernah disajikan dari cache — lihat catatan di atas.
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

  // Halaman tugas di-cache HANYA bila seluruh JS pendukungnya juga tersedia
  // offline. Menyajikan HTML tanpa JS menghasilkan form yang terlihat normal
  // tetapi tidak menyimpan apa pun — kegagalan diam-diam yang jauh lebih
  // berbahaya bagi teknisi daripada pesan "tidak ada koneksi" yang jujur.
  // Sampai pemuatan chunk offline terjamin, hanya halaman daftar yang dilayani
  // dari cache.
  if (url.pathname === "/") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(PAGE_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request, { ignoreSearch: true });
          return cached ?? caches.match(OFFLINE_URL);
        }),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGE_CACHE).then((c) => c.put(request, copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached ?? caches.match(OFFLINE_URL);
        }),
    );
  }
});
