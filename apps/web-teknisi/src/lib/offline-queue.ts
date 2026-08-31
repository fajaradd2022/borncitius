"use client";

import Dexie, { type EntityTable } from "dexie";

/**
 * Antrian offline (PRD 5.4 & 5.5).
 *
 * Teknisi sering bekerja di lokasi tanpa sinyal. Semua perubahan — isian field
 * maupun foto — ditulis dulu ke IndexedDB, lalu dikirim ke server begitu
 * koneksi tersedia. Kiriman yang gagal tetap tersimpan dan dicoba lagi, jadi
 * pekerjaan tidak pernah hilang hanya karena jaringan putus.
 */

export type QueueKind = "field-value" | "attachment";
export type QueueStatus = "pending" | "sending" | "failed";

export interface QueueItem {
  id?: number;
  kind: QueueKind;
  taskId: string;
  fieldId: string;
  status: QueueStatus;
  attempts: number;
  lastError?: string;
  createdAt: number;

  /** kind: "field-value" */
  value?: string;

  /** kind: "attachment" */
  blob?: Blob;
  fileName?: string;
  attachmentType?: "photo_taken" | "photo_uploaded" | "signed_document";
  watermark?: { timestamp: string; gps: string; taskName: string };
}

class QueueDb extends Dexie {
  items!: EntityTable<QueueItem, "id">;

  constructor() {
    super("born-citius-teknisi");
    this.version(1).stores({
      items: "++id, status, taskId, [taskId+fieldId], kind",
    });
  }
}

export const db = new QueueDb();

export async function enqueue(item: Omit<QueueItem, "id" | "status" | "attempts" | "createdAt">) {
  // Untuk isian field, cukup simpan nilai terakhir — tidak perlu menumpuk
  // riwayat ketikan yang sudah tidak relevan.
  if (item.kind === "field-value") {
    const existing = await db.items
      .where("[taskId+fieldId]")
      .equals([item.taskId, item.fieldId])
      .filter((i) => i.kind === "field-value" && i.status !== "sending")
      .first();

    if (existing?.id !== undefined) {
      await db.items.update(existing.id, {
        value: item.value,
        status: "pending",
        attempts: 0,
        lastError: undefined,
      });
      return existing.id;
    }
  }

  return db.items.add({ ...item, status: "pending", attempts: 0, createdAt: Date.now() });
}

export async function pendingCount(): Promise<number> {
  return db.items.where("status").anyOf("pending", "failed").count();
}

export async function itemsForTask(taskId: string): Promise<QueueItem[]> {
  return db.items.where("taskId").equals(taskId).toArray();
}

async function send(item: QueueItem): Promise<void> {
  if (item.kind === "field-value") {
    const res = await fetch(`/api/proxy/tasks/${item.taskId}/fields/${item.fieldId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: item.value ?? "" }),
    });
    if (!res.ok) throw new Error(`Server menolak (HTTP ${res.status}).`);
    return;
  }

  if (!item.blob) throw new Error("Berkas tidak ditemukan di antrian.");

  const form = new FormData();
  form.append("file", item.blob, item.fileName ?? "foto.jpg");
  form.append("type", item.attachmentType ?? "photo_taken");
  if (item.watermark) form.append("watermark", JSON.stringify(item.watermark));

  const res = await fetch(`/api/proxy/tasks/${item.taskId}/fields/${item.fieldId}/attachments`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`Upload ditolak (HTTP ${res.status}).`);
}

let draining = false;
let rerunRequested = false;

/**
 * Mengirim seluruh antrian. Dipanggil saat online kembali, saat halaman dibuka,
 * dan berkala. Aman dipanggil bersamaan — eksekusi ganda dicegah.
 *
 * Panggilan yang datang selagi drain lain berjalan TIDAK di-drop begitu saja:
 * item yang di-enqueue tepat di jendela waktu itu bisa saja tidak ikut
 * ter-scan oleh drain yang sedang berjalan (query snapshot diambil di awal),
 * jadi kita tandai "jalankan sekali lagi setelah ini selesai" alih-alih
 * membiarkannya menunggu trigger berikutnya (interval 20 detik / event
 * online) — penting terutama untuk handleSubmit() di task-form.tsx, yang
 * mengandalkan drainQueue() benar-benar mengosongkan antrian sebelum submit.
 */
export async function drainQueue(): Promise<{ sent: number; failed: number }> {
  if (draining) {
    rerunRequested = true;
    return { sent: 0, failed: 0 };
  }
  if (!navigator.onLine) return { sent: 0, failed: 0 };
  draining = true;
  rerunRequested = false;

  let sent = 0;
  let failed = 0;

  try {
    const queue = await db.items.where("status").anyOf("pending", "failed").sortBy("createdAt");

    for (const item of queue) {
      if (item.id === undefined) continue;
      await db.items.update(item.id, { status: "sending" });

      try {
        await send(item);
        await db.items.delete(item.id);
        sent += 1;
      } catch (err) {
        failed += 1;
        await db.items.update(item.id, {
          status: "failed",
          attempts: item.attempts + 1,
          lastError: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    draining = false;
  }

  if (rerunRequested) {
    rerunRequested = false;
    const more = await drainQueue();
    sent += more.sent;
    failed += more.failed;
  }

  return { sent, failed };
}

/**
 * Auto-sync dijalankan di tingkat modul, bukan di dalam komponen.
 *
 * Dengan begitu pengiriman antrian tidak terikat siklus hidup komponen mana
 * pun — antrian tetap terkirim walau indikator sedang tidak ter-render.
 */
let autoSyncStarted = false;

export function startAutoSync(): void {
  if (autoSyncStarted || typeof window === "undefined") return;
  autoSyncStarted = true;

  const attempt = () => void drainQueue();
  window.addEventListener("online", attempt);
  // Interval menangkap kasus sinyal pulih tanpa memicu event "online".
  setInterval(attempt, 20_000);
  attempt();
}
