import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { RegisterSW } from "@/components/register-sw";
import "./globals.css";

export const metadata: Metadata = {
  title: "Born Citius Teknisi",
  description: "Aplikasi lapangan untuk mengisi job card dan BAST",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "BC Teknisi" },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  // Zoom tidak dikunci — mengunci zoom menyulitkan pengguna dengan gangguan penglihatan.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster position="top-center" richColors />
        <RegisterSW />
      </body>
    </html>
  );
}
