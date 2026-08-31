import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Di belakang Cloudflare Tunnel, Next.js melihat Host domain publik tetapi
  // koneksi masuk sebagai HTTP. Origin ini harus di-whitelist, jika tidak
  // Server Action (login) ditolak sebagai potensi CSRF.
  experimental: {
    serverActions: {
      allowedOrigins: ["fse.fajarsodiq.com", "localhost:8080", "localhost:8081"],
    },
  },
  /* config options here */
};

export default nextConfig;
