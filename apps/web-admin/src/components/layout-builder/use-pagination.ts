"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LayoutBlock } from "@/lib/types";

/** A4 @96dpi = 794 x 1123 px; dikurangi margin 20mm (76px) di atas & bawah. */
export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1123;
export const A4_CONTENT_HEIGHT_PX = A4_HEIGHT_PX - 152;

/** Blok yang selalu menempati satu halaman penuh sendiri. */
function isFullPageBlock(block: LayoutBlock): boolean {
  return block.type === "photo-page" || block.type === "attachment";
}

function computePages(
  blocks: LayoutBlock[],
  heights: Map<string, number>,
): LayoutBlock[][] {
  const pages: LayoutBlock[][] = [];
  let current: LayoutBlock[] = [];
  let used = 0;

  const flush = () => {
    if (current.length > 0) {
      pages.push(current);
      current = [];
      used = 0;
    }
  };

  for (const block of blocks) {
    if (block.type === "page-break") {
      flush();
      continue;
    }
    if (isFullPageBlock(block)) {
      flush();
      pages.push([block]);
      continue;
    }

    const height = heights.get(block.id) ?? 40;
    if (used > 0 && used + height > A4_CONTENT_HEIGHT_PX) flush();
    current.push(block);
    used += height + 12; // 12px = jarak antar-blok
  }
  flush();
  return pages;
}

function sameGrouping(a: LayoutBlock[][], b: LayoutBlock[][]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (page, i) =>
        page.length === b[i]?.length && page.every((blk, j) => blk.id === b[i][j]?.id),
    )
  );
}

/**
 * Membagi blok menjadi halaman A4 berdasarkan tinggi nyata tiap blok di DOM.
 *
 * Pengukuran memakai ResizeObserver dan pembaruan state terjadi di dalam
 * callback observer — bukan di badan effect — sehingga tidak memicu cascading
 * render. Pengelompokan hanya di-set ulang bila benar-benar berubah.
 */
export function usePagination(blocks: LayoutBlock[]): {
  pages: LayoutBlock[][];
  registerBlock: (id: string) => (el: HTMLElement | null) => void;
} {
  const heights = useRef(new Map<string, number>());
  const elements = useRef(new Map<string, HTMLElement>());
  const observer = useRef<ResizeObserver | null>(null);
  const latestBlocks = useRef<LayoutBlock[]>(blocks);

  const [pages, setPages] = useState<LayoutBlock[][]>(() =>
    blocks.length > 0 ? computePages(blocks, new Map()) : [],
  );

  const recompute = useCallback(() => {
    const next = computePages(latestBlocks.current, heights.current);
    setPages((prev) => (sameGrouping(prev, next) ? prev : next));
  }, []);

  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.blockId;
        if (!id) continue;
        const h = entry.contentRect.height;
        if (heights.current.get(id) !== h) {
          heights.current.set(id, h);
          changed = true;
        }
      }
      if (changed) recompute();
    });

    observer.current = obs;
    for (const el of elements.current.values()) obs.observe(el);

    return () => {
      obs.disconnect();
      observer.current = null;
    };
  }, [recompute]);

  // Susunan blok berubah (tambah/hapus/geser) — simpan rujukan terbaru untuk
  // dipakai callback observer, lalu hitung ulang dengan tinggi yang sudah ada.
  useEffect(() => {
    latestBlocks.current = blocks;
    recompute();
  }, [blocks, recompute]);

  const registerBlock = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      const prev = elements.current.get(id);
      if (prev && prev !== el) observer.current?.unobserve(prev);

      if (el) {
        el.dataset.blockId = id;
        elements.current.set(id, el);
        observer.current?.observe(el);
      } else {
        elements.current.delete(id);
        heights.current.delete(id);
      }
    },
    [],
  );

  return { pages, registerBlock };
}
