"use client";

import { useEffect } from "react";

/**
 * Menghangatkan cache halaman tugas.
 *
 * Teknisi biasanya membuka aplikasi saat masih ada sinyal (di kantor atau
 * perjalanan), lalu kehilangan koneksi di lokasi. Dengan mengambil halaman
 * detail tiap tugas lebih awal, Service Worker sempat menyimpannya sehingga
 * form tetap bisa dibuka saat offline.
 */
export function PrefetchTasks({ taskIds }: { taskIds: string[] }) {
  useEffect(() => {
    if (!navigator.onLine || taskIds.length === 0) return;

    // Ditunda agar tidak bersaing dengan pemuatan halaman daftar itu sendiri.
    const timer = setTimeout(() => {
      for (const id of taskIds) {
        // Kegagalan diabaikan: ini hanya optimasi, bukan jalur kritis.
        void fetch(`/tugas/${id}`, { credentials: "same-origin" }).catch(() => undefined);
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [taskIds]);

  return null;
}
