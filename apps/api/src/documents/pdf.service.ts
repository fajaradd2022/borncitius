import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { readFile } from 'node:fs/promises';
import type { LayoutBlockType } from '@prisma/client';

/** A4 dalam satuan poin PDF (72 dpi). */
const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 56.7; // 20mm

export interface RenderBlock {
  type: LayoutBlockType;
  label: string;
  orderIndex: number;
  displayStyle: string | null;
  config: Record<string, unknown> | null;
  /** Nilai isian untuk blok field. */
  value?: string | null;
  /** Berkas lampiran untuk blok attachment / photo-page. */
  attachments?: Array<{ absolutePath: string; mimeType: string }>;
  /** Caption halaman foto. */
  caption?: string;
}

export interface RenderContext {
  title: string;
  subtitle: string;
  referenceNumber: string;
}

/**
 * Menyusun dokumen akhir (PRD 4.2).
 *
 * Halaman yang di-generate sistem dan halaman hasil scan digabung dalam satu
 * berkas, mengikuti urutan blok di layout — sehingga dokumen customer yang
 * discan bisa berada di depan maupun di belakang, sesuai kebutuhan tiap klien.
 */
@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  async render(blocks: RenderBlock[], ctx: RenderContext): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.setTitle(ctx.title);
    doc.setCreator('Born Citius');

    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    let page = doc.addPage([A4.width, A4.height]);
    let y = A4.height - MARGIN;

    const ensureSpace = (needed: number): void => {
      if (y - needed < MARGIN) {
        page = doc.addPage([A4.width, A4.height]);
        y = A4.height - MARGIN;
      }
    };

    const write = (text: string, size: number, f: PDFFont, gap = 6): void => {
      const maxWidth = A4.width - MARGIN * 2;
      for (const line of wrapText(text, f, size, maxWidth)) {
        ensureSpace(size + gap);
        page.drawText(line, { x: MARGIN, y: y - size, size, font: f, color: rgb(0, 0, 0) });
        y -= size + gap;
      }
    };

    const sorted = [...blocks].sort((a, b) => a.orderIndex - b.orderIndex);

    for (const block of sorted) {
      switch (block.type) {
        case 'header': {
          const cfg = block.config ?? {};
          write(String(cfg.companyName ?? 'Born Citius'), 16, bold, 4);
          write(String(cfg.reportTitle ?? ctx.title), 12, font, 4);
          if (cfg.showReferenceNumber) write(`No. Ref: ${ctx.referenceNumber}`, 9, font, 10);
          ensureSpace(14);
          page.drawLine({
            start: { x: MARGIN, y },
            end: { x: A4.width - MARGIN, y },
            thickness: 0.8,
            color: rgb(0.7, 0.7, 0.7),
          });
          y -= 14;
          break;
        }

        case 'text':
          write(String(block.config?.content ?? block.label), 11, font, 8);
          break;

        case 'field': {
          const value = block.value ?? '-';
          if (block.displayStyle === 'table-row') {
            ensureSpace(20);
            page.drawText(block.label, { x: MARGIN, y: y - 10, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
            const w = font.widthOfTextAtSize(value, 10);
            page.drawText(value, { x: A4.width - MARGIN - w, y: y - 10, size: 10, font: bold });
            y -= 22;
          } else {
            write(block.label, 9, font, 2);
            write(value, 11, bold, 10);
          }
          break;
        }

        case 'photo_page': {
          const photo = block.attachments?.[0];
          // Setiap halaman foto adalah halaman sendiri (PRD 4.2).
          page = doc.addPage([A4.width, A4.height]);
          y = A4.height - MARGIN;

          const caption = block.caption ?? block.label;
          const cfg = block.config ?? {};
          const header = cfg.pageHeader as { show?: boolean; leftText?: string; rightText?: string } | undefined;

          if (header?.show) {
            page.drawRectangle({
              x: MARGIN, y: y - 44, width: A4.width - MARGIN * 2, height: 44,
              borderColor: rgb(0, 0, 0), borderWidth: 1,
            });
            page.drawText(String(header.leftText ?? ''), { x: MARGIN + 8, y: y - 26, size: 9, font });
            const rt = String(header.rightText ?? '');
            page.drawText(rt, {
              x: A4.width / 2, y: y - 26, size: 10, font: bold,
            });
            y -= 58;
          }

          if (photo) {
            try {
              const embedded = await this.embedImage(doc, photo);
              if (embedded) {
                const maxW = A4.width - MARGIN * 2;
                const maxH = y - MARGIN - 40;
                const scale = Math.min(maxW / embedded.width, maxH / embedded.height);
                const w = embedded.width * scale;
                const h = embedded.height * scale;
                page.drawImage(embedded, { x: MARGIN, y: y - h, width: w, height: h });
                page.drawRectangle({
                  x: MARGIN, y: y - h, width: w, height: h,
                  borderColor: rgb(0, 0, 0), borderWidth: 1,
                });
                y -= h + 6;
              }
            } catch (err) {
              this.logger.warn(`Gagal menyisipkan foto "${caption}": ${String(err)}`);
              write('[foto tidak dapat dimuat]', 10, font, 6);
            }
          } else {
            write('[foto belum diunggah]', 10, font, 6);
          }

          const cw = bold.widthOfTextAtSize(caption, 11);
          page.drawText(caption, { x: (A4.width - cw) / 2, y: y - 14, size: 11, font: bold });
          y -= 30;
          break;
        }

        case 'page_break':
          page = doc.addPage([A4.width, A4.height]);
          y = A4.height - MARGIN;
          break;

        case 'footer': {
          const cfg = block.config ?? {};
          ensureSpace(24);
          page.drawLine({
            start: { x: MARGIN, y }, end: { x: A4.width - MARGIN, y },
            thickness: 0.5, color: rgb(0.8, 0.8, 0.8),
          });
          y -= 12;
          if (cfg.footerNote) {
            page.drawText(String(cfg.footerNote), { x: MARGIN, y: y - 8, size: 8, font, color: rgb(0.45, 0.45, 0.45) });
          }
          y -= 20;
          break;
        }

        // attachment ditangani terpisah saat merge — lihat mergeAttachments().
        default:
          break;
      }
    }

    return Buffer.from(await doc.save());
  }

  private async embedImage(doc: PDFDocument, file: { absolutePath: string; mimeType: string }) {
    const bytes = await readFile(file.absolutePath);
    if (file.mimeType === 'image/png') return doc.embedPng(bytes);
    if (file.mimeType === 'image/jpeg') return doc.embedJpg(bytes);
    return null;
  }

  /**
   * Menggabungkan halaman hasil generate dengan halaman lampiran, sesuai urutan
   * blok. Lampiran berupa PDF disalin apa adanya; gambar dijadikan satu halaman.
   */
  async assemble(
    generated: Buffer,
    blocks: RenderBlock[],
    attachmentBefore: boolean,
  ): Promise<Buffer> {
    const attachmentBlocks = blocks
      .filter((b) => b.type === 'attachment')
      .sort((a, b) => a.orderIndex - b.orderIndex);

    if (attachmentBlocks.length === 0) return generated;

    const out = await PDFDocument.create();
    const generatedDoc = await PDFDocument.load(generated);

    const appendAttachments = async (): Promise<void> => {
      for (const block of attachmentBlocks) {
        for (const file of block.attachments ?? []) {
          try {
            if (file.mimeType === 'application/pdf') {
              const src = await PDFDocument.load(await readFile(file.absolutePath));
              const pages = await out.copyPages(src, src.getPageIndices());
              pages.forEach((p) => out.addPage(p));
            } else {
              const img = await this.embedImage(out, file);
              if (!img) continue;
              const p = out.addPage([A4.width, A4.height]);
              const scale = Math.min(
                (A4.width - MARGIN) / img.width,
                (A4.height - MARGIN) / img.height,
              );
              const w = img.width * scale;
              const h = img.height * scale;
              p.drawImage(img, { x: (A4.width - w) / 2, y: (A4.height - h) / 2, width: w, height: h });
            }
          } catch (err) {
            this.logger.warn(`Lampiran dilewati (${file.absolutePath}): ${String(err)}`);
          }
        }
      }
    };

    const copyGenerated = async (): Promise<void> => {
      const pages = await out.copyPages(generatedDoc, generatedDoc.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    };

    if (attachmentBefore) {
      await appendAttachments();
      await copyGenerated();
    } else {
      await copyGenerated();
      await appendAttachments();
    }

    return Buffer.from(await out.save());
  }
}

/** Memotong teks agar muat dalam lebar halaman. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = String(text).split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}
