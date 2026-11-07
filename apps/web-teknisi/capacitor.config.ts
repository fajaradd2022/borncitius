import type { CapacitorConfig } from "@capacitor/cli";

// Baca env yang sama dengan `next build`, supaya APK tidak pernah tersinkron
// dengan URL API yang salah/kosong (default "/api" hanya berlaku untuk web).
for (const file of [".env.production.local", ".env.production"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file opsional
  }
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
if (!apiUrl.startsWith("https://")) {
  throw new Error(
    "NEXT_PUBLIC_API_URL harus URL https absolut untuk APK (mis. https://fse.fajarsodiq.com/api). " +
      "Isi di apps/web-teknisi/.env.production.local — lihat .env.example.",
  );
}

const config: CapacitorConfig = {
  appId: "id.borncitius.teknisi",
  appName: "BC Teknisi",
  webDir: "out",
};

export default config;
