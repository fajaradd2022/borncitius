import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export → folder out/. Disajikan nginx untuk versi web, dan dibungkus
  // Capacitor menjadi APK. Semua data diambil klien dari API (src/lib/api.ts).
  output: "export",
  // Optimasi gambar butuh server Next — tidak tersedia di static export.
  images: { unoptimized: true },
};

export default nextConfig;
