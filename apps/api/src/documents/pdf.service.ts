import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { readFile } from 'node:fs/promises';
import type { LayoutBlockType } from '@prisma/client';

/** A4 dalam satuan poin PDF (72 dpi). */
const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 56.7; // 20mm

export interface BorderStyle {
  outer?: boolean;
  inner?: boolean;
  width?: number;
  color?: string;
}

export interface TextStyle {
  fontSize?: 'sm' | 'base' | 'lg' | 'xl' | '2xl';
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
}

export interface RenderBlock {
  type: LayoutBlockType;
  label: string;
  orderIndex: number;
  displayStyle: string | null;
  config: Record<string, unknown> | null;
  /** Gaya teks per-blok (fontSize/bold/italic/align/color). */
  textStyle?: TextStyle | null;
  /** Gaya garis per-blok (outer/inner/width/color). */
  border?: BorderStyle | null;
  /** Nilai isian untuk blok field. */
  value?: string | null;
  /** Berkas lampiran untuk blok attachment / photo-page. */
  attachments?: Array<{ absolutePath: string; mimeType: string }>;
  /** Caption halaman foto. */
  caption?: string;
  /**
   * Nilai isian untuk field-field yang dirujuk field_grid, dipetakan per label.
   * Diisi oleh buildBlocks agar renderer tidak perlu akses DB.
   */
  gridValues?: Array<{ label: string; value: string }>;
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
    const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
    const boldItalic = await doc.embedFont(StandardFonts.HelveticaBoldOblique);

    let page = doc.addPage([A4.width, A4.height]);
    let y = A4.height - MARGIN;
    const contentWidth = A4.width - MARGIN * 2;

    const ensureSpace = (needed: number): void => {
      if (y - needed < MARGIN) {
        page = doc.addPage([A4.width, A4.height]);
        y = A4.height - MARGIN;
      }
    };

    // Peta ukuran font builder (Tailwind) → poin PDF, agar mendekati WYSIWYG.
    const fontSizePt = (s?: string): number =>
      ({ sm: 9, base: 11, lg: 13, xl: 15, '2xl': 20 }[s ?? 'base'] ?? 11);

    const pickFont = (ts?: TextStyle | null): PDFFont => {
      if (ts?.bold && ts?.italic) return boldItalic;
      if (ts?.bold) return bold;
      if (ts?.italic) return italic;
      return font;
    };

    const colorOf = (hex?: string) => {
      const c = hexToRgb(hex);
      return c ?? rgb(0, 0, 0);
    };

    // Menulis teks (dengan wrap + dukungan newline eksplisit) memakai gaya blok.
    const writeStyled = (
      text: string,
      opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; align?: string; gap?: number } = {},
    ): void => {
      const size = opts.size ?? 11;
      const f = opts.f ?? font;
      const color = opts.color ?? rgb(0, 0, 0);
      const gap = opts.gap ?? 6;
      // Hormati newline eksplisit dulu, lalu wrap tiap paragraf.
      const paragraphs = String(text).split('\n');
      for (const para of paragraphs) {
        const lines = para === '' ? [''] : wrapText(para, f, size, contentWidth);
        for (const line of lines) {
          ensureSpace(size + gap);
          let x = MARGIN;
          if (opts.align === 'center') {
            x = MARGIN + (contentWidth - f.widthOfTextAtSize(line, size)) / 2;
          } else if (opts.align === 'right') {
            x = A4.width - MARGIN - f.widthOfTextAtSize(line, size);
          }
          page.drawText(line, { x, y: y - size, size, font: f, color });
          y -= size + gap;
        }
      }
    };

    // write sederhana (kompat lama) — dipakai untuk fallback pesan.
    const write = (text: string, size: number, f: PDFFont, gap = 6): void =>
      writeStyled(text, { size, f, gap });

    const sorted = [...blocks].sort((a, b) => a.orderIndex - b.orderIndex);

    for (const block of sorted) {
      const ts = block.textStyle ?? undefined;
      const bd = block.border ?? undefined;

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
          writeStyled(String(block.config?.content ?? block.label), {
            size: fontSizePt(ts?.fontSize),
            f: pickFont(ts),
            color: colorOf(ts?.color),
            align: ts?.align,
            gap: 8,
          });
          break;

        case 'image': {
          const cfg = block.config ?? {};
          const photo = block.attachments?.[0];
          if (photo) {
            try {
              const embedded = await this.embedImage(doc, photo);
              if (embedded) {
                const wantW = typeof cfg.imageWidth === 'number' ? Number(cfg.imageWidth) : Math.min(embedded.width, contentWidth);
                const w = Math.min(wantW, contentWidth);
                const h = (embedded.height / embedded.width) * w;
                ensureSpace(h + 8);
                let x = MARGIN;
                if (ts?.align === 'center') x = MARGIN + (contentWidth - w) / 2;
                else if (ts?.align === 'right') x = A4.width - MARGIN - w;
                page.drawImage(embedded, { x, y: y - h, width: w, height: h });
                y -= h + 8;
              }
            } catch (err) {
              this.logger.warn(`Gagal menyisipkan gambar "${block.label}": ${String(err)}`);
              write('[gambar tidak dapat dimuat]', 10, font, 6);
            }
          } else {
            write('[gambar belum diunggah]', 10, italic, 6);
          }
          break;
        }

        case 'field': {
          const value = block.value ?? '-';
          if (block.displayStyle === 'table-row') {
            ensureSpace(20);
            page.drawText(block.label, { x: MARGIN, y: y - 10, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
            const w = font.widthOfTextAtSize(value, 10);
            page.drawText(value, { x: A4.width - MARGIN - w, y: y - 10, size: 10, font: bold });
            y -= 22;
          } else if (block.displayStyle === 'inline') {
            ensureSpace(16);
            page.drawText(`${block.label}: `, { x: MARGIN, y: y - 11, size: 11, font, color: rgb(0.35, 0.35, 0.35) });
            const lw = font.widthOfTextAtSize(`${block.label}: `, 11);
            page.drawText(value, { x: MARGIN + lw, y: y - 11, size: 11, font: bold });
            y -= 18;
          } else {
            write(block.label, 9, font, 2);
            write(value, 11, bold, 10);
          }
          break;
        }

        case 'field_grid': {
          const cfg = block.config ?? {};
          const cols = Number(cfg.gridColumns) === 1 ? 1 : 2;
          const items = block.gridValues ?? [];
          if (items.length === 0) {
            write('(field grid tanpa field)', 9, italic, 6);
            break;
          }
          const drawBorder = bd?.outer !== false; // default tampil
          const bClr = colorOf(bd?.color);
          const bW = bd?.width ?? 1;
          const rowH = 20;
          const colW = contentWidth / cols;
          const rowsCount = Math.ceil(items.length / cols);
          ensureSpace(rowsCount * rowH + 4);
          const gridTop = y;
          items.forEach((it, i) => {
            const r = Math.floor(i / cols);
            const c = i % cols;
            const cellX = MARGIN + c * colW;
            const cellY = gridTop - (r + 1) * rowH;
            if (drawBorder || bd?.inner) {
              page.drawRectangle({ x: cellX, y: cellY, width: colW, height: rowH, borderColor: bClr, borderWidth: bW });
            }
            page.drawText(`${it.label}`, { x: cellX + 5, y: cellY + rowH / 2 - 4, size: 8, font, color: rgb(0.35, 0.35, 0.35) });
            const lblW = font.widthOfTextAtSize(`${it.label}  `, 8);
            page.drawText(it.value || '-', { x: cellX + 5 + lblW, y: cellY + rowH / 2 - 4, size: 8, font: bold });
          });
          y = gridTop - rowsCount * rowH - 8;
          break;
        }

        case 'table': {
          const cfg = block.config ?? {};
          const columns = (Array.isArray(cfg.columns) ? cfg.columns : []) as Array<{ header?: string; width?: number }>;
          const rows = (Array.isArray(cfg.rows) ? cfg.rows : []) as string[][];
          const emptyRows = Number(cfg.emptyRows) || 0;
          if (columns.length === 0) {
            write('(tabel tanpa kolom)', 9, italic, 6);
            break;
          }
          const bClr = colorOf(bd?.color);
          const bW = bd?.width ?? 1;
          const headerBg = hexToRgb(String(cfg.headerBgColor ?? '#1e3a5f')) ?? rgb(0.12, 0.23, 0.37);
          const headerFg = hexToRgb(String(cfg.headerTextColor ?? '#ffffff')) ?? rgb(1, 1, 1);
          // lebar kolom: proporsional bila ada width, jika tidak rata.
          const totalW = columns.reduce((s, c) => s + (c.width ?? 0), 0);
          const colWidths = columns.map((c) =>
            totalW > 0 && c.width ? (c.width / totalW) * contentWidth : contentWidth / columns.length,
          );
          const rowH = 18;
          const drawRow = (cells: string[], opts: { headerRow?: boolean }) => {
            ensureSpace(rowH);
            let x = MARGIN;
            const rowY = y - rowH;
            columns.forEach((_, ci) => {
              const cw = colWidths[ci];
              if (opts.headerRow) {
                page.drawRectangle({ x, y: rowY, width: cw, height: rowH, color: headerBg });
              }
              page.drawRectangle({ x, y: rowY, width: cw, height: rowH, borderColor: bClr, borderWidth: bW });
              const txt = String(cells[ci] ?? '');
              const f = opts.headerRow ? bold : font;
              const size = opts.headerRow ? 9 : 8.5;
              const clr = opts.headerRow ? headerFg : rgb(0, 0, 0);
              // clip sederhana: potong teks agar muat kolom.
              const clipped = clipText(txt, f, size, cw - 8);
              const tx = opts.headerRow ? x + (cw - f.widthOfTextAtSize(clipped, size)) / 2 : x + 4;
              page.drawText(clipped, { x: tx, y: rowY + rowH / 2 - size / 2 + 1, size, font: f, color: clr });
              x += cw;
            });
            y -= rowH;
          };
          drawRow(columns.map((c) => String(c.header ?? '')), { headerRow: true });
          for (const row of rows) drawRow(row, {});
          for (let i = 0; i < emptyRows; i++) drawRow([], {});
          y -= 8;
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
          const captionPos = cfg.captionPosition === 'above' ? 'above' : 'below';
          const noteText = typeof cfg.noteText === 'string' ? cfg.noteText : '';
          const notePos = cfg.notePosition === 'above' ? 'above' : 'below';
          const bClr = colorOf(bd?.color);
          const bW = bd?.width ?? 1;

          // Header foto: grid 1fr:2fr (kiri store multi-line, kanan judul) —
          // meniru tampilan builder. Tinggi menyesuaikan jumlah baris kiri.
          const drawPhotoHeader = () => {
            if (!header?.show) return;
            const leftLines = String(header.leftText ?? '').split('\n').filter((l) => l.length > 0);
            const boxH = Math.max(44, 16 + leftLines.length * 12);
            const leftW = contentWidth / 3;
            const rightW = contentWidth - leftW;
            const top = y;
            // kotak kiri
            page.drawRectangle({ x: MARGIN, y: top - boxH, width: leftW, height: boxH, borderColor: bClr, borderWidth: bW });
            leftLines.forEach((ln, i) => {
              page.drawText(ln, { x: MARGIN + 6, y: top - 16 - i * 12, size: 9, font: bold });
            });
            // kotak kanan (judul, center)
            page.drawRectangle({ x: MARGIN + leftW, y: top - boxH, width: rightW, height: boxH, borderColor: bClr, borderWidth: bW });
            const rt = String(header.rightText ?? '');
            const rtLines = wrapText(rt, bold, 11, rightW - 12);
            const startY = top - boxH / 2 + (rtLines.length * 12) / 2 - 8;
            rtLines.forEach((ln, i) => {
              const w = bold.widthOfTextAtSize(ln, 11);
              page.drawText(ln, { x: MARGIN + leftW + (rightW - w) / 2, y: startY - i * 12, size: 11, font: bold });
            });
            y = top - boxH - 10;
          };

          const drawCaption = () => {
            const cw = bold.widthOfTextAtSize(caption, 11);
            ensureSpace(24);
            // kotak caption tipis (meniru builder yang berbingkai)
            page.drawRectangle({ x: MARGIN, y: y - 20, width: contentWidth, height: 20, borderColor: bClr, borderWidth: bW });
            page.drawText(caption, { x: (A4.width - cw) / 2, y: y - 14, size: 11, font: bold });
            y -= 26;
          };

          const drawNote = () => {
            if (!noteText) return;
            writeStyled(noteText, { size: 10, f: bold, align: 'center', gap: 6 });
          };

          drawPhotoHeader();
          if (notePos === 'above') drawNote();
          if (captionPos === 'above') drawCaption();

          if (photo) {
            try {
              const embedded = await this.embedImage(doc, photo);
              if (embedded) {
                const maxW = contentWidth;
                const maxH = y - MARGIN - 40;
                const scale = Math.min(maxW / embedded.width, maxH / embedded.height);
                const w = embedded.width * scale;
                const h = embedded.height * scale;
                const x = MARGIN + (contentWidth - w) / 2; // center horizontal
                page.drawImage(embedded, { x, y: y - h, width: w, height: h });
                page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: bClr, borderWidth: bW });
                y -= h + 6;
              }
            } catch (err) {
              this.logger.warn(`Gagal menyisipkan foto "${caption}": ${String(err)}`);
              write('[foto tidak dapat dimuat]', 10, font, 6);
            }
          } else {
            write('[foto belum diunggah]', 10, italic, 6);
          }

          if (captionPos === 'below') drawCaption();
          if (notePos === 'below') drawNote();
          y -= 6;
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
          const noteTxt = cfg.footerNote ? String(cfg.footerNote) : '';
          if (noteTxt) {
            page.drawText(noteTxt, { x: MARGIN, y: y - 8, size: 8, font, color: rgb(0.45, 0.45, 0.45) });
          }
          // Nomor halaman di kanan bila diaktifkan. Placeholder {n}/{total}
          // pada footerNote juga akan diisi pada langkah stamping di bawah.
          y -= 20;
          break;
        }


        // attachment ditangani terpisah saat merge — lihat mergeAttachments().
        default:
          break;
      }
    }

    // Stamping nomor halaman: bila ada blok footer dengan showPageNumber,
    // tulis "n / total" di kanan-bawah tiap halaman generate. Placeholder
    // {n}/{total} pada footerNote juga diganti bila ada.
    const footerBlock = blocks.find((b) => b.type === 'footer');
    const footerCfg = (footerBlock?.config ?? {}) as Record<string, unknown>;
    if (footerBlock && footerCfg.showPageNumber) {
      const pages = doc.getPages();
      const total = pages.length;
      pages.forEach((p, i) => {
        const label = `${i + 1} / ${total}`;
        const w = font.widthOfTextAtSize(label, 8);
        p.drawText(label, {
          x: A4.width - MARGIN - w,
          y: MARGIN - 14,
          size: 8,
          font,
          color: rgb(0.45, 0.45, 0.45),
        });
      });
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

/** Memotong satu baris teks agar muat dalam lebar tertentu (dengan elipsis). */
function clipText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const t = String(text);
  if (maxWidth <= 0) return '';
  if (font.widthOfTextAtSize(t, size) <= maxWidth) return t;
  const ell = '…';
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(t.slice(0, mid) + ell, size) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? t.slice(0, lo) + ell : ell;
}

/** Konversi warna hex (#rgb / #rrggbb) → objek rgb pdf-lib. */
function hexToRgb(hex?: string): ReturnType<typeof rgb> | null {
  if (!hex || typeof hex !== 'string') return null;
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return rgb(r, g, b);
}
