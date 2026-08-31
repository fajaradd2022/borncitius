"use client";

import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/**
 * Popup transparan untuk melihat foto lampiran, menggantikan buka-tab-baru.
 * Diadaptasi dari komponen "Image Preview" (21st.dev), diperluas dengan
 * navigasi next/prev untuk field yang punya lebih dari satu foto.
 *
 * Cuma untuk gambar — signed_document/file yang bukan image/* tetap buka
 * tab baru seperti biasa (next/image tidak bisa render PDF).
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
  onOpenChange,
}: {
  items: LightboxItem[];
  startIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    if (open) setIndex(startIndex);
  }, [open, startIndex]);

  const current = items[index];
  const hasMultiple = items.length > 1;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-auto max-w-[90vw] -translate-x-1/2 -translate-y-1/2 border-0 bg-transparent p-0 outline-none"
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" && index > 0) setIndex((i) => i - 1);
            if (e.key === "ArrowRight" && index < items.length - 1) setIndex((i) => i + 1);
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {current?.alt ?? "Pratinjau foto"}
          </DialogPrimitive.Title>

          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/75 focus:outline-none"
          >
            <X className="size-6" />
            <span className="sr-only">Tutup</span>
          </button>

          {hasMultiple && index > 0 && (
            <button
              onClick={() => setIndex((i) => i - 1)}
              className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/75 focus:outline-none"
              aria-label="Foto sebelumnya"
            >
              <ChevronLeft className="size-6" />
            </button>
          )}
          {hasMultiple && index < items.length - 1 && (
            <button
              onClick={() => setIndex((i) => i + 1)}
              className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/75 focus:outline-none"
              aria-label="Foto berikutnya"
            >
              <ChevronRight className="size-6" />
            </button>
          )}

          {current && (
            <div className="relative">
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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
