"use client";

import { useState, type DragEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Wrapper drag-and-drop generik untuk kotak upload foto (web teknisi).
 * Tidak mengubah tampilan/ukuran elemen anak — hanya menambah listener drag +
 * highlight visual saat file di-drag di atasnya, dan memanggil onDropFile
 * saat dilepas. Klik tetap bekerja seperti biasa.
 */
export function PhotoDropZone({
  onDropFile,
  disabled,
  className,
  activeClassName = "ring-2 ring-primary ring-offset-1 bg-primary/5",
  children,
}: {
  onDropFile: (file: File) => void;
  disabled?: boolean;
  className?: string;
  activeClassName?: string;
  children: ReactNode;
}) {
  const [isOver, setIsOver] = useState(false);

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) setIsOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
    if (disabled) return;
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (file) onDropFile(file);
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn("rounded-lg transition-shadow", isOver && !disabled && activeClassName, className)}
    >
      {children}
    </div>
  );
}
