"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CloudOff, RefreshCw, Check } from "lucide-react";
import { db, drainQueue, startAutoSync } from "@/lib/offline-queue";

/**
 * Indikator status sinkronisasi (PRD 5.5).
 *
 * Teknisi harus bisa melihat sekilas apakah pekerjaannya sudah sampai ke
 * server — "tersimpan lokal" dan "sudah terkirim" tidak boleh terlihat sama,
 * karena itu menyesatkan saat sinyal buruk.
 *
 * Komponen ini hanya membaca state: jumlah antrian datang langsung dari
 * IndexedDB lewat liveQuery, dan status koneksi lewat useSyncExternalStore.
 * Proses pengirimannya sendiri berjalan di luar React (startAutoSync).
 */
function subscribeOnline(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function SyncIndicator() {
  const [syncing, setSyncing] = useState(false);

  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true, // render di server: anggap online agar markup awal stabil
  );

  const pending = useLiveQuery(
    () => db.items.where("status").anyOf("pending", "failed").count(),
    [],
    0,
  );

  useEffect(startAutoSync, []);

  async function syncNow() {
    setSyncing(true);
    try {
      await drainQueue();
    } finally {
      setSyncing(false);
    }
  }

  if (!online) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800">
        <CloudOff className="size-3.5" />
        Offline{pending > 0 ? ` · ${pending}` : ""}
      </span>
    );
  }

  if (pending > 0 || syncing) {
    return (
      <button
        type="button"
        onClick={() => void syncNow()}
        className="flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1.5 text-xs font-medium text-blue-800"
      >
        <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Mengirim…" : `${pending} menunggu`}
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1.5 text-xs font-medium text-green-800">
      <Check className="size-3.5" />
      Tersinkron
    </span>
  );
}
