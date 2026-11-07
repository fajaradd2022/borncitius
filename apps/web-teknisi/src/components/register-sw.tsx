"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Mendaftarkan Service Worker untuk versi web (PWA).
 *
 * Di APK (Capacitor) aset sudah terpasang di perangkat, jadi SW tidak perlu.
 * Registrasi juga hanya berjalan di secure context — PWA mensyaratkan HTTPS.
 */
export function RegisterSW() {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
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
