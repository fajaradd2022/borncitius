# Born Citius

Sistem digital job card / BAST teknisi lapangan. Lihat [`prd.md`](./prd.md) untuk
requirement, ERD, dan keputusan desain lengkap.

## Struktur

| Path | Isi |
|---|---|
| `apps/web-admin` | Dashboard Admin/SPV (Next.js + Tailwind + shadcn/ui) |
| `apps/web-teknisi` | Aplikasi teknisi (PWA + APK Android via Capacitor): daftar tugas, isi form, foto ber-watermark, antrian offline. Lihat [README-nya](./apps/web-teknisi/README.md) |
| `apps/api` | Backend NestJS + Prisma + PostgreSQL |
| `services/claude-bridge` | Jembatan HTTP ke Claude CLI di host (fitur AI layout) |

## Menjalankan (pengembangan)

```bash
# 1. Infrastruktur (Postgres :5433, Redis :6380 — digeser agar tidak bentrok)
docker compose up -d

# 2. Dependency
corepack enable && pnpm install

# 3. Database
cp .env.example apps/api/.env      # isi JWT_SECRET, GDRIVE_ROOT_FOLDER_ID
pnpm --filter api db:migrate
pnpm --filter api db:seed

# 4. Jalankan
pnpm --filter api dev              # http://localhost:4000/api
pnpm --filter web-admin dev        # http://localhost:3002
pnpm --filter web-teknisi dev      # http://localhost:3003
```

Web teknisi memanggil API langsung dari browser. Untuk dev lokal, isi
`apps/web-teknisi/.env.local` dengan `NEXT_PUBLIC_API_URL=http://localhost:4000/api`
dan tambahkan `http://localhost:3003` ke `CORS_ORIGIN` di `apps/api/.env`.

Akun seed: `itopscitius@gmail.com` (admin), `dian.spv@borncitius.id` (SPV),
`rizky@borncitius.id` / `agus@borncitius.id` (teknisi). Password ada di keluaran
perintah seed.

## Alur penyimpanan berkas

Storage lokal adalah **primary** (cepat, tanpa rate limit); Google Drive adalah
**mirror** untuk arsip dan berbagi ke klien. Kegagalan sync Drive tidak pernah
memblokir kerja teknisi — job di-retry, dan bila tetap gagal statusnya menjadi
`failed` beserta pesannya.

Struktur folder di Drive:

```
BORN CITIUS/{Nama Folder Klien}/{SiteID}_{taskId}/{Judul Field Foto}/{berkas}
```

## Fitur AI Output Layout

```
web-admin  →  n8n webhook  →  Claude Bridge (host)  →  Claude CLI
```

n8n berperan sebagai orkestrator: menyusun prompt, retry, dan menyimpan riwayat
eksekusi. Prompt bisa disetel dari n8n tanpa deploy ulang aplikasi. Hasil AI
selalu ditampilkan sebagai **usulan** yang harus disetujui admin, dan bisa
dibatalkan setelah diterapkan.

Tanpa `AI_ENABLED`/`AI_N8N_WEBHOOK_URL`, endpoint AI membalas 503 dengan pesan
jelas — fitur tidak berpura-pura berhasil.

## Build & lint

```bash
pnpm build
pnpm lint
```

## Deployment produksi (server ini)

Stack produksi berjalan lewat `docker-compose.prod.yml` dan sudah aktif:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.prod -f docker-compose.prod.yml exec api \
  node node_modules/prisma/build/index.js migrate deploy
```

| Komponen | Alamat | Catatan |
|---|---|---|
| Web Admin | **https://born.fajarsodiq.com** (lokal: `:8080`) | Dashboard Admin/SPV |
| PWA Teknisi | **https://fse.fajarsodiq.com** (lokal: `:8081`) | Static export disajikan nginx; `/api/` diteruskan ke `api:4000` |
| APK Teknisi | — | Memanggil `https://fse.fajarsodiq.com/api`; origin `https://localhost` wajib ada di `CORS_ORIGIN` |
| API | internal `api:4000` | Sengaja tidak dipublikasikan ke host |
| PostgreSQL / Redis | internal | Tidak terekspos |
| Claude Bridge | `127.0.0.1:8787` | systemd user service di host |

**Publikasi lewat Cloudflare Tunnel.** Port 80 di server sudah dipakai
`onyx-nginx`, dan IP publik kemungkinan dinamis — tunnel menghindari kedua
masalah itu sekaligus: tidak perlu membuka port, dan TLS ditangani Cloudflare.

Routing tunnel diatur dari dashboard Cloudflare Zero Trust (tunnel ini
remote-managed):

| Public hostname | Service |
|---|---|
| `born.fajarsodiq.com` | `http://localhost:8080` |
| `fse.fajarsodiq.com` | `http://localhost:8081` |

Kedua subdomain perlu WAF rule **Skip** — tanpa itu Cloudflare menantang
(`cf-mitigated: challenge`) request `fetch()` dari antrian offline PWA dan
sinkronisasi gagal diam-diam.

Karena web-admin berada di belakang proxy, domainnya didaftarkan di
`experimental.serverActions.allowedOrigins`; tanpa itu login (Server Action)
ditolak sebagai potensi CSRF. Web teknisi tidak memakai Server Action — login
dan semua request memakai Bearer token langsung ke API.

Secret produksi ada di `.env.prod` (tidak masuk git, permission 600); password
akun seed ada di `.seed-password.txt`. **Ganti password akun seed setelah login
pertama.**

### Layanan bridge

```bash
systemctl --user status claude-bridge
journalctl --user -u claude-bridge -f
```

## Alur end-to-end yang sudah berjalan

```
Teknisi (PWA :8081 / APK)              Admin (:8080)
   isi form + foto                        review per field
   ↓ antrian offline (IndexedDB)          ↓ approve / reject / revisi langsung
   ↓ auto-sync saat online                ↓ approve semua
API ──► storage lokal ──► mirror Google Drive
                     └──► generate PDF (halaman sistem + merge lampiran scan)
```

**Watermark**: foto dari kamera otomatis dibakar timestamp + GPS + nama teknisi;
foto dari galeri tidak diberi watermark (dianggap sudah ber-timestamp).

**Offline**: isian dan foto masuk IndexedDB dulu, terkirim otomatis saat ada
koneksi. Indikator di header membedakan "menunggu kirim" dan "tersinkron".
Web teknisi adalah static export: halamannya hanya shell, datanya diambil klien
dari API. Respons GET terakhir disimpan di IndexedDB dan dipakai **hanya saat
request gagal karena jaringan**; saat online data selalu diambil segar. Service
Worker (versi web saja) menyimpan shell halaman dan aset statis yang pernah
dimuat, sehingga daftar dan detail tugas yang pernah dibuka tetap bisa dibuka
tanpa sinyal. APK tidak memakai Service Worker karena aset sudah ada di dalam
paket.

**Output Layout** tersimpan di database: builder menyimpan lewat API, dan
dokumen PDF dibuat mengikuti layout default template atau override per folder.

**Membuat task**: dari halaman Folder, tombol *Assign Task* (satuan) atau
*Import Excel* (massal, maks 500 baris/unggahan). Struktur field di-snapshot
dari template saat task dibuat, jadi perubahan template tidak mengubah task
yang sudah berjalan. Baris Excel yang tidak valid dilewati dan dilaporkan
alasannya, tanpa membatalkan baris lain.

**Dokumen akhir**: disusun mengikuti urutan blok layout — blok `attachment`
menyisipkan halaman hasil scan, sehingga dokumen customer bisa ditaruh di depan
maupun di belakang halaman yang di-generate sistem.
