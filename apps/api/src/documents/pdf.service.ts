import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LayoutBlockType } from '@prisma/client';

/** A4 dalam satuan poin PDF (72 dpi). */
const A4 = { width: 595.28, height: 841.89 };
// Margin halaman sesuai setting cetak: Top 2.54cm, Bottom 2.54cm,
// Left 2.29cm, Right 2.21cm, Gutter 0cm (tidak berpengaruh), Portrait.
// 1 cm = 28.3464567 pt.
const MARGIN = 64.91; // Left — 2.29cm (nama lama dipertahankan sbg margin kiri)
const MARGIN_RIGHT = 62.65; // 2.21cm
const MARGIN_TOP = 72.0; // 2.54cm
const MARGIN_BOTTOM = 72.0; // 2.54cm

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

/** Tipe blok sintetis (dibangun di buildBlocks, bukan di DB) untuk template khusus. */
export type SyntheticBlockType = 'test_info_table' | 'test_result_table' | 'photo_grid_3' | 'justification_table';

export interface RenderBlock {
  type: LayoutBlockType | SyntheticBlockType;
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
  /**
   * Data tabel untuk blok test-call (dari field repeat_table): baris + skema
   * kolom. Diisi oleh buildBlocks dari value JSON field yang dirujuk.
   */
  tableData?: {
    columns?: Array<Record<string, unknown>>;
    rows?: Array<Record<string, unknown>>;
    remarkRules?: Array<{ scenario: string; minDl: number }>;
  };
  /** Konteks site (Site ID / Site Name) untuk header blok test-call. */
  siteInfo?: { siteId?: string; siteName?: string };
  /** Grid foto per sektor (test-call): daftar unit {title, photos[3]}. */
  photoGrid?: Array<{ scenarioTitle?: string; title: string; siteTag?: string; photos: Array<{ absolutePath: string; mimeType: string } | null> }>;
  /** Baris tabel JUSTIFICATION AND DT CHRONOLOGY (date/time/chronology + evidence foto). */
  justRows?: Array<{ date: string; time: string; chronology: string; evidence: { absolutePath: string; mimeType: string } | null; evidences?: Array<{ absolutePath: string; mimeType: string }> }>;
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

  async render(
    blocks: RenderBlock[],
    ctx: RenderContext,
    opts: { stampPageNumbers?: boolean; headerReserve?: number } = {},
  ): Promise<Buffer> {
    const doc = await PDFDocument.create();
    doc.setTitle(ctx.title);
    doc.setCreator('Born Citius');

    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
    const boldItalic = await doc.embedFont(StandardFonts.HelveticaBoldOblique);

    // Ruang atas yang dicadangkan untuk header per-halaman (digambar di compose()).
    const headerReserve = opts.headerReserve ?? 0;
    const topY = A4.height - MARGIN_TOP - headerReserve;

    let page = doc.addPage([A4.width, A4.height]);
    let y = topY;
    const contentWidth = A4.width - MARGIN - MARGIN_RIGHT;

    const ensureSpace = (needed: number): void => {
      if (y - needed < MARGIN_BOTTOM) {
        page = doc.addPage([A4.width, A4.height]);
        y = topY;
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
            x = A4.width - MARGIN_RIGHT - f.widthOfTextAtSize(line, size);
          }
          page.drawText(line, { x, y: y - size, size, font: f, color });
          y -= size + gap;
        }
      }
    };

    // write sederhana (kompat lama) — dipakai untuk fallback pesan.
    const write = (text: string, size: number, f: PDFFont, gap = 6): void =>
      writeStyled(text, { size, f, gap });

    // Halaman dianggap "fresh" bila belum ada yang digambar (y masih di atas).
    // Dipakai agar page_break dan photo_page tidak menambah halaman kosong
    // ketika halaman aktif memang masih kosong (mis. page_break tepat sebelum
    // photo_page — keduanya ingin memulai halaman baru, cukup satu).
    const pageIsFresh = (): boolean => y === topY;
    const startFreshPage = (): void => {
      if (!pageIsFresh()) {
        page = doc.addPage([A4.width, A4.height]);
        y = topY;
      }
    };

    // State untuk mode foto "2-up" (dua foto per halaman, seperti form BAST).
    // twoUpSlot: 0 = slot atas (memicu header+note & hitung geometri), 1 = bawah.
    let twoUpSlot = 0;
    let twoUpBoxH = 0; // tinggi kotak foto tiap slot
    const TWO_UP_CAP_H = 20; // tinggi kotak caption
    const TWO_UP_GAP = 12; // jarak antar unit

    const sorted = [...blocks].sort((a, b) => a.orderIndex - b.orderIndex);

    for (const block of sorted) {
      const ts = block.textStyle ?? undefined;
      const bd = block.border ?? undefined;

      switch (block.type) {
        case 'header': {
          // Header digambar per-halaman oleh compose() (drawHeaderOnPage), agar
          // muncul di SETIAP halaman. Di sini tidak menggambar apa pun; ruang
          // atas sudah dicadangkan lewat headerReserve.
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
                else if (ts?.align === 'right') x = A4.width - MARGIN_RIGHT - w;
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
            page.drawText(value, { x: A4.width - MARGIN_RIGHT - w, y: y - 10, size: 10, font: bold });
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
          const cfg = block.config ?? {};
          const bClr = colorOf(bd?.color);
          const bW = bd?.width ?? 1;
          const caption = block.caption ?? block.label;
          const photo = block.attachments?.[0];

          // ---- MODE 2-UP: dua foto per halaman (form BAST) ----
          if (cfg.twoUp) {
            const header = cfg.pageHeader as { show?: boolean; leftText?: string; rightText?: string } | undefined;
            const noteText = typeof cfg.noteText === 'string' ? cfg.noteText : '';

            const drawImageInBox = (boxTopY: number, boxH: number) => {
              // kotak foto
              page.drawRectangle({ x: MARGIN, y: boxTopY - boxH, width: contentWidth, height: boxH, borderColor: bClr, borderWidth: bW });
              return (async () => {
                if (photo) {
                  try {
                    const embedded = await this.embedImage(doc, photo);
                    if (embedded) {
                      // contain: rasio asli dipertahankan, tanpa stretch/crop.
                      const pad = 4;
                      const scale = Math.min((contentWidth - pad * 2) / embedded.width, (boxH - pad * 2) / embedded.height);
                      const w = embedded.width * scale;
                      const h = embedded.height * scale;
                      page.drawImage(embedded, { x: MARGIN + (contentWidth - w) / 2, y: boxTopY - boxH + (boxH - h) / 2, width: w, height: h });
                      return;
                    }
                  } catch (err) {
                    this.logger.warn(`Gagal menyisipkan foto "${caption}": ${String(err)}`);
                  }
                }
                const msg = photo ? '[foto tidak dapat dimuat]' : '[foto belum diunggah]';
                const mw = italic.widthOfTextAtSize(msg, 10);
                page.drawText(msg, { x: MARGIN + (contentWidth - mw) / 2, y: boxTopY - boxH / 2, size: 10, font: italic, color: rgb(0.5, 0.5, 0.5) });
              })();
            };

            const drawCaptionBox = (topY: number) => {
              page.drawRectangle({ x: MARGIN, y: topY - TWO_UP_CAP_H, width: contentWidth, height: TWO_UP_CAP_H, borderColor: bClr, borderWidth: bW });
              const cw = bold.widthOfTextAtSize(caption, 11);
              page.drawText(caption, { x: MARGIN + (contentWidth - cw) / 2, y: topY - 14, size: 11, font: bold });
            };

            if (twoUpSlot === 0) {
              // Slot atas: mulai halaman baru, gambar header + note, hitung geometri.
              startFreshPage();

              // Header grid 1fr:2fr (kiri store multi-line, kanan judul).
              if (header?.show) {
                const leftLines = String(header.leftText ?? '').split('\n').filter((l) => l.length > 0);
                const boxH = Math.max(44, 16 + leftLines.length * 12);
                const leftW = contentWidth / 3;
                const rightW = contentWidth - leftW;
                const top = y;
                page.drawRectangle({ x: MARGIN, y: top - boxH, width: leftW, height: boxH, borderColor: bClr, borderWidth: bW });
                leftLines.forEach((ln, i) => page.drawText(ln, { x: MARGIN + 6, y: top - 16 - i * 12, size: 9, font: bold }));
                page.drawRectangle({ x: MARGIN + leftW, y: top - boxH, width: rightW, height: boxH, borderColor: bClr, borderWidth: bW });
                const rtLines = wrapText(String(header.rightText ?? ''), bold, 11, rightW - 12);
                const startY = top - boxH / 2 + (rtLines.length * 12) / 2 - 8;
                rtLines.forEach((ln, i) => {
                  const w = bold.widthOfTextAtSize(ln, 11);
                  page.drawText(ln, { x: MARGIN + leftW + (rightW - w) / 2, y: startY - i * 12, size: 11, font: bold });
                });
                y = top - boxH - 8;
              }
              if (noteText) {
                writeStyled(noteText, { size: 10, f: bold, align: 'center', gap: 8 });
              }

              // Hitung tinggi kotak foto tiap slot dari sisa ruang untuk 2 unit.
                const avail = y - MARGIN_BOTTOM;
              twoUpBoxH = Math.max(80, (avail - 2 * TWO_UP_CAP_H - TWO_UP_GAP) / 2);

              // Unit 1 (atas)
              const boxTop = y;
              await drawImageInBox(boxTop, twoUpBoxH);
              drawCaptionBox(boxTop - twoUpBoxH);
              y = boxTop - twoUpBoxH - TWO_UP_CAP_H - TWO_UP_GAP;
              twoUpSlot = 1;
            } else {
              // Slot bawah: pakai geometri yang sudah dihitung, tanpa header ulang.
              const boxTop = y;
              await drawImageInBox(boxTop, twoUpBoxH);
              drawCaptionBox(boxTop - twoUpBoxH);
              y = boxTop - twoUpBoxH - TWO_UP_CAP_H - TWO_UP_GAP;
              twoUpSlot = 0;
            }
            break;
          }
          // ---- MODE 1-UP (default): satu foto per halaman ----
          // Setiap halaman foto dimulai di halaman sendiri — tapi jika halaman
          // aktif masih kosong (mis. tepat setelah page_break), pakai halaman
          // itu agar tidak muncul halaman kosong.
          startFreshPage();

          const header = cfg.pageHeader as { show?: boolean; leftText?: string; rightText?: string } | undefined;
          const captionPos = cfg.captionPosition === 'above' ? 'above' : 'below';
          const noteText = typeof cfg.noteText === 'string' ? cfg.noteText : '';
          const notePos = cfg.notePosition === 'above' ? 'above' : 'below';

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
                const maxH = y - MARGIN_BOTTOM - 40;
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

        case 'test_info_table':
        case 'test_result_table': {
          const isResult = block.type === 'test_result_table';
          const td = block.tableData ?? {};
          const rows = Array.isArray(td.rows) ? td.rows : [];
          const rules = td.remarkRules ?? [];
          const site = block.siteInfo ?? {};

          // Judul tabel + site info (di atas tabel pertama saja bila diinginkan).
          const title = isResult ? 'TEST RESULTS' : 'TEST INFORMATION';
          ensureSpace(40);
          // Banner judul — warna 0B769F (sesuai template OOXML).
          page.drawRectangle({ x: MARGIN, y: y - 22, width: contentWidth, height: 22, color: hexToRgb('#0B769F') ?? rgb(0.04, 0.46, 0.62) });
          const tw = bold.widthOfTextAtSize(title, 13);
          page.drawText(title, { x: MARGIN + (contentWidth - tw) / 2, y: y - 16, size: 13, font: bold, color: rgb(1, 1, 1) });
          y -= 22;

          // Definisi kolom per jenis tabel (lebar = twip dari template OOXML).
          const infoCols = [
            { key: 'scenario', header: 'Scenario', w: 1131 },
            { key: 'distance', header: 'Distance to BTS (mtr)', w: 1276 },
            { key: 'target', header: 'Target (Mbps)', w: 992 },
            { key: 'sectorCell', header: 'Sector/Cell', w: 709 },
            { key: 'position', header: 'Position', w: 1134 },
            { key: 'testLocationCategory', header: 'Test Location Category', w: 2409 },
            { key: 'latitude', header: 'Latitude', w: 993 },
            { key: 'longitude', header: 'Longitude', w: 1341 },
          ];
          const resultCols = [
            { key: 'scenario', header: 'Scenario', w: 805 },
            { key: 'distance', header: 'Distance to BTS (mtr)', w: 810 },
            { key: 'target', header: 'Target (Mbps)', w: 630 },
            { key: 'sectorCell', header: 'Sector/Cell', w: 727 },
            { key: 'dlTput', header: 'DL Tput (Mbps)', w: 803 },
            { key: 'ulTput', header: 'UL Tput (Mbps)', w: 630 },
            { key: 'pci', header: 'PCI', w: 450 },
            { key: 'rsrpIndoor', header: 'Indoor', w: 810, group: 'RSRP (dBm)' },
            { key: 'rsrpOutdoor', header: 'Outdoor', w: 900, group: 'RSRP (dBm)' },
            { key: 'sinr', header: 'SINR (dB)', w: 540 },
            { key: 'rsrq', header: 'RSRQ (dB)', w: 810 },
            { key: 'jitter', header: 'Jitter (ms)', w: 630 },
            { key: 'latency', header: 'Latency (ms)', w: 720 },
            { key: 'remark', header: 'Remark', w: 720 },
          ];
          const cols = isResult ? resultCols : infoCols;
          const totalW = cols.reduce((s, c) => s + c.w, 0);
          const colW = cols.map((c) => (c.w / totalW) * contentWidth);
          // Border sel hitam (bukan abu-abu), header C1E4F5 dgn teks hitam.
          const bClr = rgb(0, 0, 0);
          const hdrBg = hexToRgb('#C1E4F5') ?? rgb(0.76, 0.89, 0.96);
          const hdrText = rgb(0, 0, 0);

          const computeRemark = (row: Record<string, unknown>): string => {
            const rule = rules.find((r) => r.scenario === row.scenario);
            const dl = Number(row.dlTput);
            if (!rule || !isFinite(dl) || row.dlTput === undefined || row.dlTput === '') return String(row.remark ?? '');
            return dl >= rule.minDl ? 'Pass' : 'Fail';
          };

          const rowH = 13;
          // Header dua-tingkat bila ada kolom ber-group (mis. RSRP Indoor/Outdoor).
          const groups = cols.map((c) => (c as { group?: string }).group);
          const hasGroups = groups.some(Boolean);
          const tier1H = 11; // baris super-header (RSRP)
          const baseHdrH = isResult ? 22 : 16;
          const headerH = baseHdrH + (hasGroups ? tier1H : 0);

          const drawHeader = () => {
            ensureSpace(headerH);
            const top = y;
            let x = MARGIN;
            cols.forEach((c, i) => {
              const grp = (c as { group?: string }).group;
              if (hasGroups && grp) {
                // Sel super-header digambar sekali (span) — lihat blok di bawah;
                // di sini gambar hanya sub-header di tier bawah.
                page.drawRectangle({ x, y: top - headerH, width: colW[i], height: baseHdrH, color: hdrBg });
                page.drawRectangle({ x, y: top - headerH, width: colW[i], height: baseHdrH, borderColor: bClr, borderWidth: 0.5 });
                const hs = 6;
                const w = bold.widthOfTextAtSize(c.header, hs);
                page.drawText(c.header, { x: x + (colW[i] - w) / 2, y: top - headerH + baseHdrH / 2 - hs / 2 + 1, size: hs, font: bold, color: hdrText });
              } else {
                // Kolom biasa mengisi seluruh tinggi header (tier1 + base).
                page.drawRectangle({ x, y: top - headerH, width: colW[i], height: headerH, color: hdrBg });
                page.drawRectangle({ x, y: top - headerH, width: colW[i], height: headerH, borderColor: bClr, borderWidth: 0.5 });
                const hs = 6;
                const lines = wrapText(c.header, bold, hs, colW[i] - 3);
                const startY = top - headerH / 2 + (lines.length * (hs + 1)) / 2 - hs + 1;
                lines.forEach((ln, li) => {
                  const w = bold.widthOfTextAtSize(ln, hs);
                  page.drawText(ln, { x: x + (colW[i] - w) / 2, y: startY - li * (hs + 1), size: hs, font: bold, color: hdrText });
                });
              }
              x += colW[i];
            });
            // Super-header spans untuk kolom ber-group (mis. "RSRP (dBm)").
            if (hasGroups) {
              let gx = MARGIN;
              let i = 0;
              while (i < cols.length) {
                const grp = (cols[i] as { group?: string }).group;
                if (grp) {
                  let spanW = 0;
                  let j = i;
                  while (j < cols.length && (cols[j] as { group?: string }).group === grp) { spanW += colW[j]; j++; }
                  page.drawRectangle({ x: gx, y: top - tier1H, width: spanW, height: tier1H, color: hdrBg });
                  page.drawRectangle({ x: gx, y: top - tier1H, width: spanW, height: tier1H, borderColor: bClr, borderWidth: 0.5 });
                  const w = bold.widthOfTextAtSize(grp, 6.5);
                  page.drawText(grp, { x: gx + (spanW - w) / 2, y: top - tier1H / 2 - 2, size: 6.5, font: bold, color: hdrText });
                  for (let k = i; k < j; k++) gx += colW[k];
                  i = j;
                } else {
                  gx += colW[i];
                  i++;
                }
              }
            }
            y -= headerH;
          };
          drawHeader();

          // Baris data dengan vMerge SEBENARNYA pada kolom scenario/distance/target:
          // sel digambar sekali per blok skenario, teks di tengah vertikal blok.
          const mergeKeys = ['scenario', 'distance', 'target'];
          const fs = 6.5;
          let r = 0;
          while (r < rows.length) {
            // Tentukan panjang blok skenario (baris berturut dgn scenario sama).
            const scen = String(rows[r].scenario ?? '');
            let blockLen = 1;
            while (r + blockLen < rows.length && String(rows[r + blockLen].scenario ?? '') === scen) blockLen++;
            // Bila blok tak muat di sisa halaman, pindah halaman + ulang header.
            if (y - blockLen * rowH < MARGIN_BOTTOM) { startFreshPage(); drawHeader(); }
            const blockTop = y;
            const blockH = blockLen * rowH;
            // Gambar sel merge (satu sel tinggi) + teksnya di tengah vertikal.
            let mx = MARGIN;
            cols.forEach((c, i) => {
              if (mergeKeys.includes(c.key)) {
                page.drawRectangle({ x: mx, y: blockTop - blockH, width: colW[i], height: blockH, borderColor: bClr, borderWidth: 0.5 });
                const val = clipText(String(rows[r][c.key] ?? ''), bold, fs, colW[i] - 4);
                page.drawText(val, { x: mx + (colW[i] - bold.widthOfTextAtSize(val, fs)) / 2, y: blockTop - blockH / 2 - fs / 2 + 1, size: fs, font: bold, color: rgb(0, 0, 0) });
              }
              mx += colW[i];
            });
            // Gambar sel non-merge tiap baris dalam blok.
            for (let br = 0; br < blockLen; br++) {
              const row = rows[r + br];
              const top = blockTop - br * rowH;
              const rowRemark = isResult ? computeRemark(row) : '';
              let x = MARGIN;
              cols.forEach((c, i) => {
                if (mergeKeys.includes(c.key)) { x += colW[i]; return; }
                page.drawRectangle({ x, y: top - rowH, width: colW[i], height: rowH, borderColor: bClr, borderWidth: 0.5 });
                let val = '';
                if (c.key === 'remark') val = rowRemark;
                else val = row[c.key] === undefined || row[c.key] === null ? '' : String(row[c.key]);
                if (c.key === 'latitude') val = formatLatLon(val, 'lat');
                if (c.key === 'longitude') val = formatLatLon(val, 'lon');
                if ((c.key === 'rsrpIndoor' || c.key === 'rsrpOutdoor') && val === '') val = '-';
                const clipped = clipText(val, font, fs, colW[i] - 4);
                const f = c.key === 'remark' ? bold : font;
                page.drawText(clipped, { x: x + (colW[i] - f.widthOfTextAtSize(clipped, fs)) / 2, y: top - rowH / 2 - fs / 2 + 1, size: fs, font: f, color: rgb(0, 0, 0) });
                x += colW[i];
              });
            }
            y = blockTop - blockH;
            r += blockLen;
          }
          // Jarak antar tabel = 1 spasi (± satu baris).
          y -= 13;

          // Notes hanya di bawah TEST RESULTS. Teks PERSIS sesuai template
          // (perhatikan spasi/koma — jangan "dirapikan").
          if (isResult) {
            const notesLines = [
              'Notes:',
              '• Test points All Scenario and sector tests are already achieved with target',
              '      o  Scenario 1 Near 100m > 315 Mbps, ',
              '      o  Scenario 2 Middle 300m >150 Mbps ',
              '      o  Scenario 3 Far 500m >50 Mbps',
              '• Indoor Test point can be done in: ',
              '      Restaurant (Warteg), Mosque, Minimart (Indomaret, Alfamart, etc)',
            ];
            ensureSpace(notesLines.length * 11 + 6);
            notesLines.forEach((ln, i) => {
              page.drawText(ln, { x: MARGIN, y: y - 9 - i * 11, size: i === 0 ? 8 : 7.5, font: i === 0 ? bold : font, color: rgb(0, 0, 0) });
            });
            y -= notesLines.length * 11 + 6;
          }
          break;
        }

        case 'photo_grid_3': {
          // Grid foto: SATU sektor per lembar. Struktur (persis template):
          //   Banner "SPEEDTEST SCENARIO N" (teal 0B769F, teks putih)
          //   Banner "SCENx_SECy (range m) SITE_ID" (biru muda DAE9F7, teks hitam)
          //   Header 3 kolom SPEEDTEST / YOUTUBE/DETIK / LOCATION (DAE9F7)
          //   3 kotak foto (contain, rasio asli)
          const units = block.photoGrid ?? [];
          const colHeaders = ['SPEEDTEST', 'YOUTUBE/DETIK', 'LOCATION'];
          const bClr = rgb(0, 0, 0);
          const bW = bd?.width ?? 1;
          const scenBg = hexToRgb('#0B769F') ?? rgb(0.04, 0.46, 0.62);
          const gridHdrBg = hexToRgb('#DAE9F7') ?? rgb(0.85, 0.91, 0.97);
          const siteTag = (block.siteInfo?.siteId && block.siteInfo?.siteName)
            ? `${block.siteInfo.siteId}_${block.siteInfo.siteName}`
            : (block.siteInfo?.siteId ?? '');
          const scenH = 22, titleH = 16, colHdrH = 16;
          for (const unit of units) {
            // Tiap sektor = satu lembar penuh sendiri.
            startFreshPage();
            const top = y;
            // Foto mengisi ± setengah tinggi konten (seperti proporsi template).
            const photoH = (topY - MARGIN_BOTTOM) * 0.5;

            // Banner 1: SPEEDTEST SCENARIO N (teal, teks putih)
            const scenTitle = unit.scenarioTitle ?? 'SPEEDTEST';
            page.drawRectangle({ x: MARGIN, y: top - scenH, width: contentWidth, height: scenH, color: scenBg, borderColor: bClr, borderWidth: bW });
            const stw = bold.widthOfTextAtSize(scenTitle, 12);
            page.drawText(scenTitle, { x: MARGIN + (contentWidth - stw) / 2, y: top - 16, size: 12, font: bold, color: rgb(1, 1, 1) });

            // Banner 2: sector + site (biru muda, teks hitam)
            const titY = top - scenH;
            page.drawRectangle({ x: MARGIN, y: titY - titleH, width: contentWidth, height: titleH, color: gridHdrBg, borderColor: bClr, borderWidth: bW });
            const unitSiteTag = unit.siteTag ?? siteTag;
            const fullTitle = unitSiteTag ? `${unit.title} ${unitSiteTag}` : unit.title;
            const tw2 = bold.widthOfTextAtSize(fullTitle, 10);
            page.drawText(fullTitle, { x: MARGIN + (contentWidth - tw2) / 2, y: titY - 11, size: 10, font: bold, color: rgb(0, 0, 0) });

            // Header 3 kolom (biru muda, teks hitam)
            const cw = contentWidth / 3;
            const hdrY = titY - titleH;
            colHeaders.forEach((h, i) => {
              page.drawRectangle({ x: MARGIN + i * cw, y: hdrY - colHdrH, width: cw, height: colHdrH, color: gridHdrBg, borderColor: bClr, borderWidth: bW });
              const w = bold.widthOfTextAtSize(h, 9);
              page.drawText(h, { x: MARGIN + i * cw + (cw - w) / 2, y: hdrY - 11, size: 9, font: bold, color: rgb(0, 0, 0) });
            });

            // 3 kotak foto
            const photoY = hdrY - colHdrH;
            for (let i = 0; i < 3; i++) {
              const cellX = MARGIN + i * cw;
              page.drawRectangle({ x: cellX, y: photoY - photoH, width: cw, height: photoH, borderColor: bClr, borderWidth: bW });
              const ph = unit.photos[i];
              if (ph) {
                try {
                  const embedded = await this.embedImage(doc, ph);
                  if (embedded) {
                    const pad = 4;
                    const scale = Math.min((cw - pad * 2) / embedded.width, (photoH - pad * 2) / embedded.height);
                    const w = embedded.width * scale;
                    const h = embedded.height * scale;
                    page.drawImage(embedded, { x: cellX + (cw - w) / 2, y: photoY - photoH + (photoH - h) / 2, width: w, height: h });
                  }
                } catch (err) {
                  this.logger.warn(`Grid foto gagal (${unit.title}): ${String(err)}`);
                }
              }
            }
            y = photoY - photoH;
          }
          break;
        }

        case 'justification_table': {
          // Tabel JUSTIFICATION AND DT CHRONOLOGY di halaman terakhir.
          // Kolom: Date | Time | Chronology | Evidance (foto). Selalu mulai
          // halaman baru agar tabel utuh.
          const jrows = block.justRows ?? [];
          startFreshPage();
          const titleH = 20;
          const hdrH = 16;
          const rowH = 90; // tinggi baris cukup untuk foto evidence
          // Lebar kolom (proporsional contoh): Date, Time, Chronology, Evidance.
          const wDate = 70, wTime = 60, wEvid = 150;
          const wChron = contentWidth - wDate - wTime - wEvid;
          const cols = [
            { key: 'date', header: 'Date', w: wDate },
            { key: 'time', header: 'Time', w: wTime },
            { key: 'chronology', header: 'Chronology', w: wChron },
            { key: 'evidence', header: 'Evidance', w: wEvid },
          ];
          const bClr = rgb(0, 0, 0);
          const titleBg = rgb(0x0b / 255, 0x76 / 255, 0x9f / 255);
          const hdrBg = rgb(0xc1 / 255, 0xe4 / 255, 0xf5 / 255);

          // Banner judul (teal, teks putih).
          ensureSpace(titleH + hdrH + rowH);
          page.drawRectangle({ x: MARGIN, y: y - titleH, width: contentWidth, height: titleH, color: titleBg, borderColor: bClr, borderWidth: 1 });
          const tTxt = 'JUSTIFICATION AND DT CHRONOLOGY';
          const tW = bold.widthOfTextAtSize(tTxt, 11);
          page.drawText(tTxt, { x: MARGIN + (contentWidth - tW) / 2, y: y - 14, size: 11, font: bold, color: rgb(1, 1, 1) });
          y -= titleH;

          // Header kolom (biru muda, teks hitam).
          let hx = MARGIN;
          for (const c of cols) {
            page.drawRectangle({ x: hx, y: y - hdrH, width: c.w, height: hdrH, color: hdrBg, borderColor: bClr, borderWidth: 1 });
            const w = bold.widthOfTextAtSize(c.header, 8);
            page.drawText(c.header, { x: hx + (c.w - w) / 2, y: y - 11, size: 8, font: bold, color: rgb(0, 0, 0) });
            hx += c.w;
          }
          y -= hdrH;

          // Baris data.
          for (const jr of jrows) {
            // Tinggi baris menyesuaikan jumlah foto evidence (multi-foto).
            const evList = (jr.evidences && jr.evidences.length > 0)
              ? jr.evidences
              : (jr.evidence ? [jr.evidence] : []);
            const nEv = Math.max(1, evList.length);
            // Susun foto vertikal di kolom Evidance; tiap foto ± 84pt tinggi.
            const perPhotoH = 84;
            const dynRowH = Math.max(rowH, nEv * perPhotoH + 6);
      if (y - dynRowH < MARGIN_BOTTOM + 20) {
              startFreshPage();
              // Ulang header kolom di halaman baru.
              let hx2 = MARGIN;
              for (const c of cols) {
                page.drawRectangle({ x: hx2, y: y - hdrH, width: c.w, height: hdrH, color: hdrBg, borderColor: bClr, borderWidth: 1 });
                const w = bold.widthOfTextAtSize(c.header, 8);
                page.drawText(c.header, { x: hx2 + (c.w - w) / 2, y: y - 11, size: 8, font: bold, color: rgb(0, 0, 0) });
                hx2 += c.w;
              }
              y -= hdrH;
            }
            let cx = MARGIN;
            const rowTop = y;
            for (const c of cols) {
              page.drawRectangle({ x: cx, y: rowTop - dynRowH, width: c.w, height: dynRowH, borderColor: bClr, borderWidth: 1 });
              if (c.key === 'evidence') {
                // Tampilkan SEMUA foto evidence, ditumpuk vertikal.
                let py = rowTop - 3;
                const cellH = dynRowH / nEv;
                for (const ev of evList) {
                  try {
                    const embedded = await this.embedImage(doc, ev);
                    if (embedded) {
                      const pad = 3;
                      const scale = Math.min((c.w - pad * 2) / embedded.width, (cellH - pad * 2) / embedded.height);
                      const w = embedded.width * scale;
                      const h = embedded.height * scale;
                      page.drawImage(embedded, { x: cx + (c.w - w) / 2, y: py - (cellH - h) / 2 - h, width: w, height: h });
                    }
                  } catch (err) {
                    this.logger.warn(`Evidence foto gagal: ${String(err)}`);
                  }
                  py -= cellH;
                }
              } else {
                const raw = String((jr as Record<string, unknown>)[c.key] ?? '');
                const align = c.key === 'chronology' ? 'left' : 'center';
                const lines = wrapText(raw, font, 8, c.w - 8);
                let ty = rowTop - 12;
                for (const ln of lines.slice(0, Math.floor((dynRowH - 8) / 10))) {
                  const lw = font.widthOfTextAtSize(ln, 8);
                  const tx = align === 'center' ? cx + (c.w - lw) / 2 : cx + 4;
                  page.drawText(ln, { x: tx, y: ty, size: 8, font, color: rgb(0, 0, 0) });
                  ty -= 10;
                }
              }
              cx += c.w;
            }
            y = rowTop - dynRowH;
          }
          break;
        }

        case 'page_break':
          // Mulai halaman baru hanya bila halaman aktif sudah terisi, agar
          // page_break yang berdampingan dengan photo_page tidak menghasilkan
          // halaman kosong.
          startFreshPage();
          break;

        case 'footer': {
          const cfg = block.config ?? {};
          ensureSpace(24);
          page.drawLine({
            start: { x: MARGIN, y }, end: { x: A4.width - MARGIN_RIGHT, y },
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
    // tulis "n / total" di kanan-bawah tiap halaman. Saat dipanggil dari
    // compose(), stamping ini dilewati dan dilakukan sekali untuk seluruh
    // dokumen gabungan (agar total & nomor benar lintas segmen + lampiran).
    const footerBlock = blocks.find((b) => b.type === 'footer');
    const footerCfg = (footerBlock?.config ?? {}) as Record<string, unknown>;
    if (opts.stampPageNumbers !== false && footerBlock && footerCfg.showPageNumber) {
      const pages = doc.getPages();
      const total = pages.length;
      pages.forEach((p, i) => {
        const label = `${i + 1} / ${total}`;
        const w = font.widthOfTextAtSize(label, 8);
        p.drawText(label, {
          x: A4.width - MARGIN_RIGHT - w,
          y: MARGIN_BOTTOM - 14,
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
   * Menyusun dokumen final dengan MENYISIPKAN lampiran tepat di posisi urutan
   * bloknya (interleaved), bukan hanya di depan/belakang. Contoh: bila blok
   * attachment "BAST" ada di awal layout, halaman BAST muncul di awal; bila di
   * tengah, muncul di tengah.
   *
   * Cara kerja: blok non-lampiran dikelompokkan menjadi "segmen" yang di-render
   * jadi PDF, dan tiap blok attachment menjadi satu unit lampiran. Semua unit
   * (segmen + lampiran) diurutkan berdasarkan orderIndex, lalu digabung.
   *
   * Setiap halaman lampiran (PDF hasil scan / gambar) dinormalisasi ke ukuran
   * A4: kontennya diletakkan utuh (preserve aspect ratio, TIDAK di-stretch /
   * TIDAK dipotong) dan di-tengah-kan pada kanvas A4 putih.
   */
  async compose(blocks: RenderBlock[], ctx: RenderContext): Promise<Buffer> {
    const sorted = [...blocks].sort((a, b) => a.orderIndex - b.orderIndex);

    // Header (bila ada) digambar di SETIAP halaman; cadangkan ruang atas.
    const headerBlock = sorted.find((b) => b.type === 'header');
    const HEADER_H = headerBlock ? 44 : 0; // tinggi area header per halaman

    // Bangun daftar unit sesuai urutan: segmen render + lampiran.
    type Unit =
      | { kind: 'render'; blocks: RenderBlock[] }
      | { kind: 'attach'; block: RenderBlock };
    const units: Unit[] = [];
    let currentSegment: RenderBlock[] = [];
    const flush = () => {
      if (currentSegment.length > 0) {
        units.push({ kind: 'render', blocks: currentSegment });
        currentSegment = [];
      }
    };
    for (const b of sorted) {
      if (b.type === 'attachment') {
        // Buang page_break di ekor segmen: page_break tepat sebelum lampiran
        // hanya akan menghasilkan halaman kosong (lampiran memulai halaman
        // A4 sendiri). Ini mencegah blank page di batas segmen↔lampiran.
        while (currentSegment.length > 0 && currentSegment[currentSegment.length - 1].type === 'page_break') {
          currentSegment.pop();
        }
        flush();
        units.push({ kind: 'attach', block: b });
      } else {
        currentSegment.push(b);
      }
    }
    flush();

    const out = await PDFDocument.create();
    out.setTitle(ctx.title);
    out.setCreator('Born Citius');

    for (const unit of units) {
      if (unit.kind === 'render') {
        // Render segmen ini (tanpa stamping nomor halaman — dilakukan di akhir).
        const segPdf = await this.render(unit.blocks, ctx, { stampPageNumbers: false, headerReserve: HEADER_H });
        const segDoc = await PDFDocument.load(segPdf);
        const pages = await out.copyPages(segDoc, segDoc.getPageIndices());
        pages.forEach((p) => out.addPage(p));
      } else {
        await this.appendAttachmentA4(out, unit.block);
      }
    }

    // Gambar HEADER di setiap halaman (logo Nokia kiri + Surge kanan).
    if (headerBlock) {
      await this.drawHeaderAllPages(out);
    }

    // Stamping nomor halaman untuk SELURUH dokumen bila footer memintanya.
    const footerBlock = blocks.find((b) => b.type === 'footer');
    const footerCfg = (footerBlock?.config ?? {}) as Record<string, unknown>;
    if (footerBlock && footerCfg.showPageNumber) {
      const font = await out.embedFont(StandardFonts.Helvetica);
      const pages = out.getPages();
      const total = pages.length;
      pages.forEach((p, i) => {
        const label = `${i + 1} / ${total}`;
        const w = font.widthOfTextAtSize(label, 8);
        p.drawText(label, {
          x: A4.width - MARGIN_RIGHT - w,
          y: MARGIN_BOTTOM - 14,
          size: 8,
          font,
          color: rgb(0.45, 0.45, 0.45),
        });
      });
    }

    return Buffer.from(await out.save());
  }

  /**
   * Menggambar header (logo Nokia kiri + Surge kanan) di SETIAP halaman dokumen.
   * Nokia dibuat sedikit lebih besar & proporsional terhadap Surge (tinggi
   * berbeda agar bobot visual seimbang). Fallback teks bila aset tak ada.
   */
  private async drawHeaderAllPages(out: PDFDocument): Promise<void> {
    const loadLogo = async (file: string) => {
      try {
        const buf = await readFile(join(process.cwd(), 'assets', 'logos', file));
        return await out.embedPng(buf);
      } catch {
        return null;
      }
    };
    const nokiaImg = await loadLogo('nokia.png');
    const surgeImg = await loadLogo('surge.png');

    // Tinggi target tiap logo — sesuai proporsi template OOXML:
    // Nokia ± 0.618" (≈44 pt), Surge ± 0.5" (≈36 pt). Nokia lebih besar.
    const NOKIA_H = 38;
    const SURGE_H = 30;
    const topPad = 18; // jarak dari tepi atas ke logo
    const bold = !nokiaImg || !surgeImg ? await out.embedFont(StandardFonts.HelveticaBold) : null;

    for (const p of out.getPages()) {
      const pageTop = A4.height - topPad;
      if (nokiaImg) {
        const w = (nokiaImg.width / nokiaImg.height) * NOKIA_H;
        p.drawImage(nokiaImg, { x: MARGIN, y: pageTop - NOKIA_H, width: w, height: NOKIA_H });
      } else if (bold) {
        p.drawText('NOKIA', { x: MARGIN, y: pageTop - 16, size: 16, font: bold, color: rgb(0.07, 0.29, 0.65) });
      }
      if (surgeImg) {
        const w = (surgeImg.width / surgeImg.height) * SURGE_H;
        p.drawImage(surgeImg, { x: A4.width - MARGIN_RIGHT - w, y: pageTop - SURGE_H, width: w, height: SURGE_H });
      } else if (bold) {
        const rw = bold.widthOfTextAtSize('Surge', 16);
        p.drawText('Surge', { x: A4.width - MARGIN_RIGHT - rw, y: pageTop - 16, size: 16, font: bold, color: rgb(0.12, 0.2, 0.5) });
      }
    }
  }

  /**
   * Menambahkan lampiran (semua berkas pada satu blok attachment) ke dokumen,
   * dengan menormalkan setiap halaman ke A4 preserve-aspect (tanpa stretch).
   */
  private async appendAttachmentA4(out: PDFDocument, block: RenderBlock): Promise<void> {
    for (const file of block.attachments ?? []) {
      try {
        if (file.mimeType === 'application/pdf') {
          const src = await PDFDocument.load(await readFile(file.absolutePath));
          const indices = src.getPageIndices();
          // Embed tiap halaman sumber sebagai objek, lalu gambar utuh ke A4.
          const embeddedPages = await out.embedPdf(src, indices);
          for (const ep of embeddedPages) {
            const a4 = out.addPage([A4.width, A4.height]);
            const { width: sw, height: sh } = ep;
            // Skala agar muat penuh dalam A4 (dengan margin kecil), preserve ratio.
            const pad = 8; // sisakan sedikit tepi agar tidak menempel pinggir
            const scale = Math.min((A4.width - pad * 2) / sw, (A4.height - pad * 2) / sh);
            const w = sw * scale;
            const h = sh * scale;
            a4.drawPage(ep, {
              x: (A4.width - w) / 2,
              y: (A4.height - h) / 2,
              width: w,
              height: h,
            });
          }
        } else {
          const img = await this.embedImage(out, file);
          if (!img) continue;
          const a4 = out.addPage([A4.width, A4.height]);
          const pad = 8;
          const scale = Math.min((A4.width - pad * 2) / img.width, (A4.height - pad * 2) / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          a4.drawImage(img, {
            x: (A4.width - w) / 2,
            y: (A4.height - h) / 2,
            width: w,
            height: h,
          });
        }
      } catch (err) {
        this.logger.warn(`Lampiran dilewati (${file.absolutePath}): ${String(err)}`);
      }
    }
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

/**
 * Format Latitude/Longitude gaya template: derajat desimal (6 desimal) TANPA
 * tanda minus + huruf hemisfer. lat: negatif→S, positif→N. lon: negatif→W,
 * positif→E. Bila sudah ada huruf hemisfer atau bukan angka, kembalikan apa adanya.
 */
function formatLatLon(raw: string, kind: 'lat' | 'lon'): string {
  const s = String(raw ?? '').trim();
  if (s === '') return '';
  // Sudah ada hemisfer (mis. "6.205649S") → biarkan.
  if (/[NSEW]$/i.test(s)) return s.toUpperCase();
  const num = parseFloat(s.replace(/,/g, '.'));
  if (!isFinite(num)) return s;
  const hemi = kind === 'lat' ? (num < 0 ? 'S' : 'N') : (num < 0 ? 'W' : 'E');
  return `${Math.abs(num).toFixed(6)}${hemi}`;
}

