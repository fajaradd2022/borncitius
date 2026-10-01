import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Menghasilkan server mandiri berisi hanya dependency terpakai — image jauh lebih kecil.
  output: "standalone",
  // Di belakang Cloudflare Tunnel, Next.js melihat Host domain publik tetapi
  // koneksi masuk sebagai HTTP. Origin ini harus di-whitelist, jika tidak
  // Server Action (login) ditolak sebagai potensi CSRF.
  experimental: {
    serverActions: {
      allowedOrigins: ["born.fajarsodiq.com", "devborn.fajarsodiq.com", "localhost:8080", "localhost:8081", "localhost:3002"],
    },
  },
  // Dev server (next dev) juga blokir cross-origin request ke resource HMR/
  // static chunks secara default — perlu daftar host yang sama di sini agar
  // akses dev lewat domain publik (Cloudflare Tunnel) tidak diblokir.
  allowedDevOrigins: ["devborn.fajarsodiq.com"],
  /* config options here */
};

export default nextConfig;
