"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/**
 * Popup transparan untuk melihat foto lampiran, menggantikan buka-tab-baru.
 * Diadaptasi dari komponen "Image Preview" (21st.dev), diperluas dengan
 * navigasi next/prev. App ini tidak punya dependency Radix/shadcn (lihat
 * camera-capture.tsx untuk pola yang sama) — overlay dibangun manual.
 *
 * Cuma untuk gambar — dokumen (PDF/signed_document) tetap buka tab baru.
 */
export interface LightboxItem {
  id: string;
  url: string;
  alt: string;
}

export function AttachmentLightbox({
  items,
  startIndex,
  open,
  onClose,
}: {
  items: LightboxItem[];
  startIndex: number;
  open: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    if (open) setIndex(startIndex);
  }, [open, startIndex]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.min(items.length - 1, i + 1));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, items.length, onClose]);

  if (!open) return null;

  const current = items[index];
  const hasMultiple = items.length > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        onClick={onClose}
        aria-label="Tutup"
        className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white"
      >
        <X className="size-6" />
      </button>

      {hasMultiple && index > 0 && (
        <button
          onClick={() => setIndex((i) => i - 1)}
          aria-label="Foto sebelumnya"
          className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      {hasMultiple && index < items.length - 1 && (
        <button
          onClick={() => setIndex((i) => i + 1)}
          aria-label="Foto berikutnya"
          className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white"
        >
          <ChevronRight className="size-6" />
        </button>
      )}

      {current && (
        <div className="relative max-h-[90vh] max-w-[90vw]">
          <Image
            src={current.url}
            alt={current.alt}
            width={1200}
            height={1200}
            unoptimized
            className="max-h-[90vh] w-auto object-contain"
          />
          {hasMultiple && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
              {index + 1} / {items.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
