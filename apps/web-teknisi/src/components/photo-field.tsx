"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { Camera, Check, ImageUp, Loader2, X } from "lucide-react";
import { burnWatermark, compressOnly, formatTimestamp, getPosition } from "@/lib/watermark";
import { enqueue } from "@/lib/offline-queue";
import { CameraCapture } from "./camera-capture";
import { AttachmentLightbox, type LightboxItem } from "./ui/attachment-lightbox";
import type { FormAttachment } from "./task-form";

/**
 * Field foto (PRD 5.5).
 *
 * Dua jalur yang sengaja dibedakan:
 * - "Ambil Foto" (kamera) -> watermark timestamp+GPS+nama dibakar ke gambar.
 * - "Dari Galeri" -> tanpa watermark, karena biasanya sudah ber-timestamp dari
 *   aplikasi pihak ketiga.
 *
 * Hasilnya masuk antrian offline dulu, jadi teknisi tidak perlu menunggu upload
 * selesai dan tidak kehilangan foto saat sinyal hilang.
 *
 * Foto yang sudah tersimpan di server (existingAttachments) ditampilkan
 * sebagai thumbnail dengan tombol hapus — sinkron dengan yang dilihat admin
 * di Dashboard (sumber data sama, tabel Attachment via API).
 */
export function PhotoField({
  taskId,
  fieldId,
  label,
  taskName,
  existingAttachments,
  locked,
}: {
  taskId: string;
  fieldId: string;
  label: string;
  taskName: string;
  existingAttachments: FormAttachment[];
  locked?: boolean;
}) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  // Preview lokal (object URL) supaya foto langsung terlihat begitu diambil —
  // tidak menunggu antrian offline benar-benar terkirim + halaman di-refresh
  // manual (bug lama: user harus refresh-refresh dulu baru foto muncul).
  const [localPreviews, setLocalPreviews] = useState<{ objectUrl: string; fileName: string }[]>([]);
  const [lightbox, setLightbox] = useState<{ items: LightboxItem[]; startIndex: number } | null>(null);

  useEffect(() => {
    return () => {
      localPreviews.forEach((p) => URL.revokeObjectURL(p.objectUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handle(file: File, withWatermark: boolean) {
    setBusy(true);
    try {
      let blob: Blob;
      let watermark: { timestamp: string; gps: string; taskName: string } | undefined;

      if (withWatermark) {
        const [gps] = await Promise.all([getPosition()]);
        watermark = { timestamp: formatTimestamp(), gps, taskName };
        blob = await burnWatermark(file, watermark);
      } else {
        blob = await compressOnly(file);
      }

      const fileName = `${Date.now()}.jpg`;
      setLocalPreviews((prev) => [...prev, { objectUrl: URL.createObjectURL(blob), fileName }]);

      await enqueue({
        kind: "attachment",
        taskId,
        fieldId,
        blob,
        fileName,
        attachmentType: withWatermark ? "photo_taken" : "photo_uploaded",
        watermark,
      });

      toast.success(
        withWatermark ? "Foto disimpan dengan watermark." : "Foto disimpan.",
        { description: "Akan terkirim otomatis saat ada koneksi." },
      );
    } catch (err) {
      toast.error("Gagal memproses foto.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(att: FormAttachment) {
    if (!window.confirm("Hapus foto ini? Tindakan ini permanen.")) return;
    try {
      const res = await fetch(`/api/proxy/tasks/${taskId}/fields/${fieldId}/attachments/${att.id}`, {
        method: "DELETE",
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        toast.error("Gagal menghapus foto.", { description: body?.error });
        return;
      }
      toast.success("Foto dihapus.");
      router.refresh();
    } catch {
      toast.error("Tidak bisa menghubungi server.");
    }
  }

  const total = existingAttachments.length + localPreviews.length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {total > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-success">
            <Check className="size-3.5" />
            {total} foto
          </span>
        )}
      </div>

      {total > 0 && (
        <div className="flex flex-wrap gap-2">
          {existingAttachments.map((att, i) => (
            <div key={att.id} className="group relative">
              <button
                type="button"
                onClick={() =>
                  setLightbox({
                    items: existingAttachments.map((a) => ({
                      id: a.id,
                      url: `/api/proxy/tasks/attachments/${a.id}/file`,
                      alt: a.originalName,
                    })),
                    startIndex: i,
                  })
                }
              >
                <Image
                  src={`/api/proxy/tasks/attachments/${att.id}/file`}
                  alt={att.originalName}
                  width={80}
                  height={80}
                  unoptimized
                  className="size-20 rounded-xl border border-border object-cover"
                />
              </button>
              {!locked && (
                <button
                  type="button"
                  onClick={() => void handleDelete(att)}
                  aria-label="Hapus foto"
                  className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-danger text-white"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ))}
          {localPreviews.map((p, i) => (
            <button
              type="button"
              key={p.objectUrl}
              onClick={() =>
                setLightbox({
                  items: localPreviews.map((lp) => ({ id: lp.objectUrl, url: lp.objectUrl, alt: lp.fileName })),
                  startIndex: i,
                })
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- object URL, next/image tidak bisa optimasi blob: URI */}
              <img
                src={p.objectUrl}
                alt={p.fileName}
                className="size-20 rounded-xl border border-border object-cover"
              />
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy || locked}
          onClick={() => setCameraOpen(true)}
          className="flex h-14 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white active:opacity-90 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
          Ambil Foto
        </button>
        <button
          type="button"
          disabled={busy || locked}
          onClick={() => galleryRef.current?.click()}
          className="flex h-14 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold active:bg-muted disabled:opacity-60"
        >
          <ImageUp className="size-5" />
          Dari Galeri
        </button>
      </div>

      <p className="text-xs text-zinc-400">
        Foto kamera otomatis diberi watermark waktu, lokasi, dan nama task.
      </p>

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => void handle(file, true)}
        onUnavailable={() => {
          setCameraOpen(false);
          // Kamera in-app gagal (izin ditolak / tidak didukung) — jatuh ke
          // input file bawaan browser sebagai fallback, supaya ambil foto
          // tetap bisa dilakukan.
          cameraRef.current?.click();
        }}
      />

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handle(f, true);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handle(f, false);
          e.target.value = "";
        }}
      />

      {lightbox && (
        <AttachmentLightbox
          items={lightbox.items}
          startIndex={lightbox.startIndex}
          open={lightbox !== null}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
