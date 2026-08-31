"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { toast } from "sonner";

/**
 * Kamera in-app (PRD 5.5 — perbaikan kamera belakang).
 *
 * <input capture="environment"> hanya hint standar — sebagian browser
 * mobile tidak selalu mematuhinya dan membuka kamera depan. Komponen ini
 * meminta stream kamera langsung lewat getUserMedia dengan facingMode
 * "environment" supaya kamera belakang benar-benar terpakai, dengan preview
 * langsung + tombol jepret sendiri di dalam app.
 *
 * Kalau getUserMedia gagal/tidak tersedia (izin ditolak, browser lama,
 * konteks tidak aman), pemanggil diberi tahu lewat onUnavailable supaya bisa
 * jatuh ke <input capture="environment"> sebagai fallback — kamera tidak
 * boleh sampai benar-benar tidak bisa dipakai.
 */
export function CameraCapture({
  open,
  onCapture,
  onClose,
  onUnavailable,
}: {
  open: boolean;
  onCapture: (file: File) => void;
  onClose: () => void;
  onUnavailable: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setReady(false);

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Kamera tidak didukung browser ini.");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            // Tanpa ini browser sering negosiasi resolusi rendah secara
            // default utk live stream, jauh di bawah kemampuan sensor kamera
            // — hasil jepretan jadi blur/kecil dibanding <input capture>
            // (yang delegasi ke app kamera native) sebelumnya. "ideal", bukan
            // exact/min, supaya tetap graceful di kamera yang tidak sanggup 1080p.
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        toast.error("Tidak bisa mengakses kamera.", {
          description: err instanceof Error ? err.message : undefined,
        });
        onUnavailable();
      }
    }

    void start();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function stopAndClose() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onClose();
  }

  function shoot() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast.error("Gagal mengambil foto.");
          return;
        }
        const file = new File([blob], `${Date.now()}.jpg`, { type: "image/jpeg" });
        stopAndClose();
        onCapture(file);
      },
      "image/jpeg",
      0.92,
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <video ref={videoRef} playsInline muted className="min-h-0 flex-1 object-cover" />

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="size-8 animate-spin text-white" />
        </div>
      )}

      <button
        type="button"
        onClick={stopAndClose}
        aria-label="Tutup kamera"
        className="absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-black/50 text-white"
      >
        <X className="size-5" />
      </button>

      <div className="flex shrink-0 items-center justify-center bg-black py-6">
        <button
          type="button"
          disabled={!ready}
          onClick={shoot}
          aria-label="Jepret"
          className="flex size-16 items-center justify-center rounded-full border-4 border-white bg-white/20 disabled:opacity-40"
        >
          <Camera className="size-7 text-white" />
        </button>
      </div>
    </div>
  );
}
