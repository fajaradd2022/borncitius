"use client";

import { useEffect } from "react";

/**
 * Mendaftarkan Service Worker.
 *
 * Registrasi hanya berjalan di secure context — di HTTP biasa browser menolak,
 * dan itu wajar: PWA memang mensyaratkan HTTPS.
 */
export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

    const timer = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        // Kegagalan registrasi tidak boleh mengganggu pemakaian aplikasi.
        console.warn("Service worker gagal didaftarkan:", err);
      });
    }, 1000); // tunda agar tidak bersaing dengan pemuatan awal halaman

    return () => clearTimeout(timer);
  }, []);

  return null;
}
