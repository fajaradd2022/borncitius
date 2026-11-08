# BC Teknisi (web-teknisi)

Aplikasi lapangan teknisi Born Citius. Satu kode, dua target:

- **Web/PWA**: https://fse.fajarsodiq.com, disajikan nginx (lihat `Dockerfile`, `nginx.conf`).
- **APK Android**: dibungkus [Capacitor 8](https://capacitorjs.com/docs). Proyek native ada di `android/`.

Next.js 16 dengan `output: "export"`, jadi tidak ada server Node, Route Handler,
middleware, maupun Server Action. Semua data diambil klien dari API.

## Arsitektur singkat

| File | Peran |
|---|---|
| `src/lib/api.ts` | `apiFetch`/`apiGet`: Bearer token, refresh otomatis saat 401, cache GET ke IndexedDB untuk offline |
| `src/lib/db.ts` | Database Dexie: antrian kirim (`items`) dan cache respons (`cache`) |
| `src/lib/offline-queue.ts` | Antrian isian/foto, terkirim otomatis saat online |
| `src/app/tugas/page.tsx` | Detail tugas, route `/tugas?id=…` (query, bukan dynamic route, agar bisa di-export statis) |
| `public/sw.js` | Service Worker, hanya untuk web. APK tidak memakainya |
| `capacitor.config.ts` | Konfigurasi APK; build gagal bila URL API bukan https |

Alamat API dibakar saat build lewat `NEXT_PUBLIC_API_URL`:

| Target | Nilai | Tempat |
|---|---|---|
| Web/Docker | `/api` (default, diteruskan nginx) | tidak perlu diisi |
| APK | `https://fse.fajarsodiq.com/api` | `.env.production.local` |
| Dev lokal | `http://localhost:4000/api` | `.env.local` |

Contoh lengkap ada di `.env.example`. API harus mengizinkan origin APK
`https://localhost` dan, untuk dev, `http://localhost:3003` di `CORS_ORIGIN`.

## Pengembangan

Jalankan dari root monorepo:

```bash
pnpm install
pnpm --filter web-teknisi dev         # http://localhost:3003
pnpm --filter web-teknisi lint
pnpm --filter web-teknisi typecheck
```

## Build APK

Kebutuhan: Android Studio (JDK bawaan + Android SDK), dan `.env.production.local`
berisi URL API https.

```bash
cp .env.example .env.production.local          # sekali saja
pnpm --filter web-teknisi build:android        # next build + cap sync android
pnpm --filter web-teknisi open:android         # buka di Android Studio
```

Di Android Studio: **Run** untuk mencoba di HP/emulator, atau
**Build → Generate Signed App Bundle / APK** untuk rilis. Ulangi `build:android`
setiap kali kode web berubah.

Spesifikasi: `appId` `id.borncitius.teknisi`, minSdk 24, targetSdk 36. Izin yang
dipakai: kamera dan lokasi (untuk watermark foto), diminta saat pertama dipakai.

### Catatan

- **WebView minimal Chrome 111.** Next.js 16 dan Tailwind v4 tidak jalan di
  WebView lama. Pada perangkat seperti itu aplikasi menampilkan
  `public/webview-update.html`, berisi petunjuk update Android System WebView
  lewat Play Store. Untuk emulator, pakai image API 33 ke atas.
- **API wajib https.** APK tidak mengizinkan HTTP biasa.
- **Lampiran PDF** belum bisa dibuka di dalam APK, karena WebView tidak punya
  penampil PDF. Foto tetap tampil normal.

## Logo dan ikon

Sumber logo: `assets/logo-source.png`. Dari file itu dibuat ikon launcher
Android (`android/app/src/main/res/mipmap-*`), splash
(`res/drawable*/splash.png`), warna latar ikon adaptif
(`res/values/ic_launcher_background.xml`, `#0A58F2`), favicon dan
`apple-icon.png` (`src/app/`), ikon PWA (`public/icon-192.png`,
`public/icon-512.png`), dan logo halaman login (`public/logo.png`).

Untuk mengganti logo, buat ulang semua file tersebut dari sumber baru, misalnya
dengan Image Asset Studio di Android Studio (**File → New → Image Asset**) untuk
bagian Android.
