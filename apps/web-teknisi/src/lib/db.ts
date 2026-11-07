"use client";

import Dexie, { type EntityTable } from "dexie";

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

/** Salinan respons GET terakhir per path API — dipakai saat offline. */
export interface CacheEntry {
  key: string;
  data: unknown;
  savedAt: number;
}

class TeknisiDb extends Dexie {
  items!: EntityTable<QueueItem, "id">;
  cache!: EntityTable<CacheEntry, "key">;

  constructor() {
    super("born-citius-teknisi");
    this.version(1).stores({
      items: "++id, status, taskId, [taskId+fieldId], kind",
    });
    this.version(2).stores({
      cache: "key",
    });
  }
}

export const db = new TeknisiDb();
