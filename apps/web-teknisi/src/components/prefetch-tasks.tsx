"use client";

import { useEffect } from "react";
import { apiGet, taskPath } from "@/lib/api";

/**
 * Menyimpan detail tiap tugas ke perangkat lebih awal.
 *
 * Teknisi biasanya membuka aplikasi saat masih ada sinyal (di kantor atau
 * perjalanan), lalu kehilangan koneksi di lokasi. apiGet menyimpan respons ke
 * IndexedDB, sehingga form tetap bisa dibuka saat offline.
 */
export function PrefetchTasks({ taskIds }: { taskIds: string[] }) {
  useEffect(() => {
    if (!navigator.onLine || taskIds.length === 0) return;

    // Ditunda agar tidak bersaing dengan pemuatan halaman daftar itu sendiri.
    const timer = setTimeout(() => {
      for (const id of taskIds) {
        // Kegagalan diabaikan: ini hanya optimasi, bukan jalur kritis.
        void apiGet(taskPath(id)).catch(() => undefined);
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [taskIds]);

  return null;
}
