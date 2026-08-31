import { Injectable } from '@nestjs/common';
import {
  AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun,
} from 'docx';
import type { RenderBlock, RenderContext } from './pdf.service';

/**
 * Export Word (PRD 4.2 — format opsional untuk data mentah).
 *
 * Berbeda dari PDF, keluaran ini sengaja hanya berisi teks: lampiran hasil
 * scan dan foto tidak disertakan, karena Word dipakai saat isian perlu
 * disunting ulang, bukan sebagai dokumen final yang ditandatangani.
 */
@Injectable()
export class DocxService {
  async render(blocks: RenderBlock[], ctx: RenderContext): Promise<Buffer> {
    const children: Paragraph[] = [];
    const sorted = [...blocks].sort((a, b) => a.orderIndex - b.orderIndex);

    for (const block of sorted) {
      const cfg = block.config ?? {};

      switch (block.type) {
        case 'header':
          children.push(
            new Paragraph({
              text: String(cfg.companyName ?? 'Born Citius'),
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({ text: String(cfg.reportTitle ?? ctx.title) }),
          );
          if (cfg.showReferenceNumber) {
            children.push(new Paragraph({ text: `No. Ref: ${ctx.referenceNumber}`, spacing: { after: 200 } }));
          }
          break;

        case 'text':
          children.push(new Paragraph({ text: String(cfg.content ?? block.label), spacing: { after: 120 } }));
          break;

        case 'field':
          children.push(
            new Paragraph({
              spacing: { after: 120 },
              children: [
                new TextRun({ text: `${block.label}: `, bold: false }),
                new TextRun({ text: block.value ?? '-', bold: true }),
              ],
            }),
          );
          break;

        case 'photo_page':
          // Foto tidak disertakan; keberadaannya tetap dicatat agar pembaca
          // tahu dokumen final (PDF) memuat halaman ini.
          children.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 160, after: 160 },
              children: [
                new TextRun({ text: `[Lampiran foto: ${block.caption ?? block.label}]`, italics: true }),
              ],
            }),
          );
          break;

        case 'attachment':
          children.push(
            new Paragraph({
              spacing: { before: 160, after: 160 },
              children: [
                new TextRun({ text: `[Lampiran scan: ${block.label} — lihat versi PDF]`, italics: true }),
              ],
            }),
          );
          break;

        case 'footer':
          if (cfg.footerNote) {
            children.push(new Paragraph({ text: String(cfg.footerNote), spacing: { before: 240 } }));
          }
          break;

        default:
          break;
      }
    }

    const doc = new Document({ sections: [{ children }] });
    return Packer.toBuffer(doc);
  }
}
