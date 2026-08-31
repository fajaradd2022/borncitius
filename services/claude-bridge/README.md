# Claude Bridge

Jembatan HTTP dari n8n/aplikasi ke **Claude CLI** yang berjalan di host.

## Kenapa ada

Credential Claude (langganan claude.ai) tersimpan di `~/.claude` milik user host,
sedangkan n8n dan API berjalan di dalam container. Bridge ini berjalan di host
sebagai pemilik credential, jadi credential tidak perlu disalin ke container.

## Keamanan

- Wajib header `X-Bridge-Token`, dibandingkan konstan-waktu (`timingSafeEqual`).
- Claude dijalankan dengan tool berbahaya dimatikan — hanya `Read` yang aktif.
- Akses berkas dibatasi ke `BRIDGE_ALLOWED_DIR`; path divalidasi **setelah**
  `resolve()` sehingga `../` tidak bisa keluar dari direktori itu.
- Argumen dikirim sebagai array ke `spawn` (tidak lewat shell); prompt lewat stdin.

## Menjalankan

```bash
cp ../../.env.example .env     # isi BRIDGE_TOKEN: openssl rand -hex 24
node server.mjs
```

Cek: `curl localhost:8787/health`

## Catatan langganan

Langganan claude.ai ditujukan untuk pemakaian interaktif oleh pemegang akun.
Beban fitur ini kecil (hanya Admin, sesekali), tapi bila aplikasi nanti melayani
banyak pengguna, jalur resminya adalah API key berbayar — cukup ganti adapter di
`apps/web-admin/src/lib/ai/`.
