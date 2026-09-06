import { Injectable, Logger } from '@nestjs/common';
import {
  AlignmentType, BorderStyle, Document, ImageRun, Packer, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign,
  VerticalMergeType, WidthType, HeightRule,
} from 'docx';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RenderBlock, RenderContext } from './pdf.service';

/**
 * Export Word (.docx) — dibuat menyerupai hasil export PDF Test Call:
 * header logo Nokia+Surge, tabel TEST INFORMATION & TEST RESULTS (dengan
 * vMerge Scenario/Distance/Target, super-header RSRP Indoor/Outdoor, Remark
 * auto Pass/Fail, format lat/long S/E), Notes, dan halaman dokumentasi foto
 * per Sector/Cell (banner "SPEEDTEST SCENARIO N" + 3 kolom foto).
 *
 * Sumber blok SAMA dengan PDF (buildBlocks), sehingga isi & urutannya identik.
 */
@Injectable()
export class DocxService {
  private readonly logger = new Logger(DocxService.name);

  // Warna (hex tanpa #) mengikuti template OOXML customer.
  private readonly C_TITLE = '0B769F';   // banner judul tabel
  private readonly C_HEADER = 'C1E4F5';  // header kolom tabel
  private readonly C_EVID = 'DAE9F7';    // banner/ header evidence

  async render(blocks: RenderBlock[], ctx: RenderContext): Promise<Buffer> {
    const sorted = [...blocks].sort((a, b) => a.orderIndex - b.orderIndex);
    const children: (Paragraph | Table)[] = [];

    // Header (logo) digambar sebagai gambar di awal + akan diulang via section
    // header. Untuk kesederhanaan & kompatibilitas, kita taruh logo di header
    // section (muncul tiap halaman).
    const headerBlock = sorted.find((b) => b.type === 'header');

    for (const block of sorted) {
      switch (block.type) {
        case 'header':
          // Ditangani lewat section header (lihat bawah). Lewati di body.
          break;

        case 'text':
          children.push(new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: String(block.config?.content ?? block.label) })],
          }));
          break;

        case 'field':
          children.push(new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({ text: `${block.label}: ` }),
              new TextRun({ text: block.value ?? '-', bold: true }),
            ],
          }));
          break;

        case 'test_info_table':
        case 'test_result_table':
          children.push(this.buildTestTable(block));
          children.push(new Paragraph({ text: '', spacing: { after: 120 } }));
          if (block.type === 'test_result_table') {
            for (const p of this.buildNotes()) children.push(p);
          }
          break;

        case 'photo_grid_3':
          for (const el of await this.buildPhotoGrid(block)) children.push(el);
          break;

        case 'justification_table':
          children.push(new Paragraph({ pageBreakBefore: true, children: [] }));
          children.push(await this.buildJustificationTable(block));
          break;

        case 'footer':
          if (block.config?.footerNote) {
            children.push(new Paragraph({ text: String(block.config.footerNote), spacing: { before: 240 } }));
          }
          break;

        default:
          break;
      }
    }

    const headerImages = headerBlock ? await this.buildHeaderParagraph() : undefined;

    const doc = new Document({
      sections: [{
        properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        headers: headerImages ? { default: headerImages } : undefined,
        children,
      }],
    });
    return Packer.toBuffer(doc);
  }

  // ---- Header (logo Nokia kiri + Surge kanan) ----
  private async loadLogo(file: string): Promise<Buffer | null> {
    try {
      return await readFile(join(process.cwd(), 'assets', 'logos', file));
    } catch {
      return null;
    }
  }

  private async buildHeaderParagraph() {
    const { Header } = await import('docx');
    const nokia = await this.loadLogo('nokia.png');
    const surge = await this.loadLogo('surge.png');
    const runs: ImageRun[] = [];
    // Nokia sedikit lebih besar (proporsional dgn PDF).
    if (nokia) runs.push(new ImageRun({ data: nokia, transformation: { width: 120, height: 44 }, type: 'png' }));
    // Spacer via tab; Surge di kanan.
    const children: (ImageRun | TextRun)[] = [];
    if (nokia) children.push(new ImageRun({ data: nokia, transformation: { width: 118, height: 40 }, type: 'png' }));
    children.push(new TextRun({ text: '\t\t\t\t\t\t\t\t\t' }));
    if (surge) children.push(new ImageRun({ data: surge, transformation: { width: 92, height: 34 }, type: 'png' }));
    if (!nokia && !surge) children.push(new TextRun({ text: 'NOKIA', bold: true, color: '124A94', size: 32 }));
    return new Header({
      children: [
        new Paragraph({
          tabStops: [{ type: AlignmentType.RIGHT as unknown as 'right', position: 10800 }],
          children,
        }),
      ],
    });
  }

  // ---- Tabel TEST INFORMATION / TEST RESULTS ----
  private infoCols() {
    return [
      { key: 'scenario', header: 'Scenario', w: 1131, merge: true, bold: true },
      { key: 'distance', header: 'Distance to BTS (mtr)', w: 1276, merge: true, bold: true },
      { key: 'target', header: 'Target (Mbps)', w: 992, merge: true, bold: true },
      { key: 'sectorCell', header: 'Sector/Cell', w: 709 },
      { key: 'position', header: 'Position', w: 1134 },
      { key: 'testLocationCategory', header: 'Test Location Category', w: 2409 },
      { key: 'latitude', header: 'Latitude', w: 993 },
      { key: 'longitude', header: 'Longitude', w: 1341 },
    ];
  }
  private resultCols() {
    return [
      { key: 'scenario', header: 'Scenario', w: 805, merge: true, bold: true },
      { key: 'distance', header: 'Distance to BTS (mtr)', w: 810, merge: true, bold: true },
      { key: 'target', header: 'Target (Mbps)', w: 630, merge: true, bold: true },
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
  }

  private noBorders() {
    const b = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
    return { top: b, bottom: b, left: b, right: b };
  }

  private cellText(text: string, opts: { bold?: boolean; fill?: string; align?: 'center' | 'left'; size?: number } = {}) {
    return new TableCell({
      verticalAlign: VerticalAlign.CENTER,
      shading: opts.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.fill } : undefined,
      borders: this.noBorders(),
      children: [new Paragraph({
        alignment: (opts.align === 'left' ? AlignmentType.LEFT : AlignmentType.CENTER),
        children: [new TextRun({ text: text ?? '', bold: opts.bold, size: opts.size ?? 14 })],
      })],
    });
  }

  private mergedCell(text: string, rowSpan: number) {
    // Sel vMerge (restart) berisi teks, membentang rowSpan baris.
    return new TableCell({
      verticalAlign: VerticalAlign.CENTER,
      verticalMerge: VerticalMergeType.RESTART,
      rowSpan,
      borders: this.noBorders(),
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: text ?? '', bold: true, size: 14 })] })],
    });
  }

  private computeRemark(row: Record<string, unknown>, rules: Array<{ scenario: string; minDl: number }>): string {
    const rule = rules.find((r) => r.scenario === row.scenario);
    const dl = Number(row.dlTput);
    if (!rule || !isFinite(dl) || row.dlTput === undefined || row.dlTput === '') return String(row.remark ?? '');
    return dl >= rule.minDl ? 'Pass' : 'Fail';
  }

  private fmtLatLon(raw: unknown, kind: 'lat' | 'lon'): string {
    const s = String(raw ?? '').trim();
    if (s === '') return '';
    if (/[NSEW]$/i.test(s)) return s.toUpperCase();
    const num = parseFloat(s.replace(/,/g, '.'));
    if (!isFinite(num)) return s;
    const hemi = kind === 'lat' ? (num < 0 ? 'S' : 'N') : (num < 0 ? 'W' : 'E');
    return `${Math.abs(num).toFixed(6)}${hemi}`;
  }

  private buildTestTable(block: RenderBlock): Table {
    const isResult = block.type === 'test_result_table';
    const cols = isResult ? this.resultCols() : this.infoCols();
    const td = block.tableData ?? {};
    const rows = Array.isArray(td.rows) ? td.rows : [];
    const rules = td.remarkRules ?? [];
    const title = isResult ? 'TEST RESULTS' : 'TEST INFORMATION';
    const totalW = cols.reduce((s, c) => s + c.w, 0);
    const hasGroups = cols.some((c) => (c as { group?: string }).group);

    const tableRows: TableRow[] = [];

    // Baris judul (span semua kolom) — fill teal, teks putih.
    tableRows.push(new TableRow({
      tableHeader: true,
      children: [new TableCell({
        columnSpan: cols.length,
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: this.C_TITLE },
        borders: this.noBorders(),
        verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: title, bold: true, color: 'FFFFFF', size: 24 })] })],
      })],
    }));

    // Header kolom. Bila ada group (RSRP), buat 2 tingkat.
    if (hasGroups) {
      // Tier 1: kolom non-group vMerge 2 baris; group jadi satu sel span.
      const tier1: TableCell[] = [];
      let i = 0;
      while (i < cols.length) {
        const grp = (cols[i] as { group?: string }).group;
        if (grp) {
          let span = 0; let j = i;
          while (j < cols.length && (cols[j] as { group?: string }).group === grp) { span++; j++; }
          tier1.push(new TableCell({
            columnSpan: span,
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: this.C_HEADER },
            borders: this.noBorders(), verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: grp, bold: true, size: 14 })] })],
          }));
          i = j;
        } else {
          tier1.push(new TableCell({
            verticalMerge: VerticalMergeType.RESTART,
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: this.C_HEADER },
            borders: this.noBorders(), verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: cols[i].header, bold: true, size: 14 })] })],
          }));
          i++;
        }
      }
      tableRows.push(new TableRow({ tableHeader: true, children: tier1 }));
      // Tier 2: hanya sub-kolom group + continue untuk non-group.
      const tier2: TableCell[] = [];
      i = 0;
      while (i < cols.length) {
        const grp = (cols[i] as { group?: string }).group;
        if (grp) {
          tier2.push(new TableCell({
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: this.C_HEADER },
            borders: this.noBorders(), verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: cols[i].header, bold: true, size: 14 })] })],
          }));
          i++;
        } else {
          tier2.push(new TableCell({
            verticalMerge: VerticalMergeType.CONTINUE,
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: this.C_HEADER },
            borders: this.noBorders(),
            children: [new Paragraph({ text: '' })],
          }));
          i++;
        }
      }
      tableRows.push(new TableRow({ tableHeader: true, children: tier2 }));
    } else {
      tableRows.push(new TableRow({
        tableHeader: true,
        children: cols.map((c) => this.cellText(c.header, { bold: true, fill: this.C_HEADER })),
      }));
    }

    // Baris data dengan vMerge scenario/distance/target per blok skenario.
    let r = 0;
    while (r < rows.length) {
      const scen = String(rows[r].scenario ?? '');
      let blockLen = 1;
      while (r + blockLen < rows.length && String(rows[r + blockLen].scenario ?? '') === scen) blockLen++;
      for (let br = 0; br < blockLen; br++) {
        const row = rows[r + br];
        const cells: TableCell[] = [];
        for (const c of cols) {
          const isMerge = (c as { merge?: boolean }).merge;
          if (isMerge) {
            if (br === 0) {
              cells.push(this.mergedCell(String(row[c.key] ?? ''), blockLen));
            } else {
              cells.push(new TableCell({
                verticalMerge: VerticalMergeType.CONTINUE,
                borders: this.noBorders(),
                children: [new Paragraph({ text: '' })],
              }));
            }
            continue;
          }
          let val = '';
          if (c.key === 'remark') val = this.computeRemark(row, rules);
          else val = row[c.key] === undefined || row[c.key] === null ? '' : String(row[c.key]);
          if (c.key === 'latitude') val = this.fmtLatLon(val, 'lat');
          if (c.key === 'longitude') val = this.fmtLatLon(val, 'lon');
          if ((c.key === 'rsrpIndoor' || c.key === 'rsrpOutdoor') && val === '') val = '-';
          cells.push(this.cellText(val, { bold: c.key === 'remark' }));
        }
        tableRows.push(new TableRow({ children: cells }));
      }
      r += blockLen;
    }

    return new Table({
      width: { size: totalW, type: WidthType.DXA },
      columnWidths: cols.map((c) => c.w),
      rows: tableRows,
    });
  }

  private buildNotes(): Paragraph[] {
    const lines = [
      { t: 'Notes:', bold: true, size: 16 },
      { t: '• Test points All Scenario and sector tests are already achieved with target', size: 15 },
      { t: '      o  Scenario 1 Near 100m > 315 Mbps, ', size: 14 },
      { t: '      o  Scenario 2 Middle 300m >150 Mbps ', size: 14 },
      { t: '      o  Scenario 3 Far 500m >50 Mbps', size: 14 },
      { t: '• Indoor Test point can be done in: ', size: 15 },
      { t: '      Restaurant (Warteg), Mosque, Minimart (Indomaret, Alfamart, etc)', size: 14 },
    ];
    return lines.map((l) => new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: l.t, bold: l.bold, size: l.size })] }));
  }

  // ---- Photo grid per sektor (1 sektor per unit) ----
  private async imageCell(photo: { absolutePath: string; mimeType: string } | null): Promise<TableCell> {
    let img: ImageRun | TextRun;
    if (photo) {
      try {
        const data = await readFile(photo.absolutePath);
        const ext = photo.mimeType.includes('png') ? 'png' : 'jpg';
        img = new ImageRun({ data, transformation: { width: 168, height: 224 }, type: ext as 'png' | 'jpg' });
      } catch {
        img = new TextRun({ text: '[foto tidak dapat dimuat]', italics: true, size: 14 });
      }
    } else {
      img = new TextRun({ text: '—', size: 14 });
    }
    return new TableCell({
      verticalAlign: VerticalAlign.CENTER,
      borders: this.noBorders(),
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [img] })],
    });
  }

  /** Sel berisi BANYAK foto (evidence Justification) — ditumpuk vertikal. */
  private async multiImageCell(photos: Array<{ absolutePath: string; mimeType: string }>): Promise<TableCell> {
    if (!photos || photos.length === 0) {
      return new TableCell({
        verticalAlign: VerticalAlign.CENTER,
        borders: this.noBorders(),
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '—', size: 14 })] })],
      });
    }
    const paras: Paragraph[] = [];
    for (const p of photos) {
      let run: ImageRun | TextRun;
      try {
        const data = await readFile(p.absolutePath);
        const ext = p.mimeType.includes('png') ? 'png' : 'jpg';
        run = new ImageRun({ data, transformation: { width: 150, height: 200 }, type: ext as 'png' | 'jpg' });
      } catch {
        run = new TextRun({ text: '[foto tidak dapat dimuat]', italics: true, size: 14 });
      }
      paras.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [run] }));
    }
    return new TableCell({
      verticalAlign: VerticalAlign.CENTER,
      borders: this.noBorders(),
      children: paras,
    });
  }

  private async buildPhotoGrid(block: RenderBlock): Promise<(Paragraph | Table)[]> {
    const out: (Paragraph | Table)[] = [];
    const units = block.photoGrid ?? [];
    const siteTag = (block.siteInfo?.siteId && block.siteInfo?.siteName)
      ? `${block.siteInfo.siteId}_${block.siteInfo.siteName}`
      : (block.siteInfo?.siteId ?? '');
    const colHeaders = ['SPEEDTEST', 'YOUTUBE/DETIK', 'LOCATION'];

    for (let u = 0; u < units.length; u++) {
      const unit = units[u];
      // Tiap sektor mulai di halaman baru (kecuali yg pertama).
      if (u > 0) out.push(new Paragraph({ pageBreakBefore: true, children: [] }));

      const unitSiteTag = unit.siteTag ?? siteTag;
      const fullTitle = unitSiteTag ? `${unit.title} ${unitSiteTag}` : unit.title;
      const scenTitle = unit.scenarioTitle ?? 'SPEEDTEST';

      const rows: TableRow[] = [];
      // Banner scenario (teal, teks putih)
      rows.push(new TableRow({ children: [new TableCell({
        columnSpan: 3,
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: this.C_TITLE },
        borders: this.noBorders(), verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: scenTitle, bold: true, color: 'FFFFFF', size: 22 })] })],
      })] }));
      // Banner sektor + site (biru muda, teks hitam)
      rows.push(new TableRow({ children: [new TableCell({
        columnSpan: 3,
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: this.C_EVID },
        borders: this.noBorders(), verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: fullTitle, bold: true, size: 18 })] })],
      })] }));
      // Header 3 kolom (biru muda, teks hitam)
      rows.push(new TableRow({ children: colHeaders.map((h) => this.cellText(h, { bold: true, fill: this.C_EVID, size: 16 })) }));
      // Baris foto
      const imgCells: TableCell[] = [];
      for (let i = 0; i < 3; i++) imgCells.push(await this.imageCell(unit.photos[i] ?? null));
      rows.push(new TableRow({ children: imgCells }));

      out.push(new Table({ width: { size: 9600, type: WidthType.DXA }, columnWidths: [3200, 3200, 3200], rows }));
    }
    return out;
  }

  // ---- Tabel JUSTIFICATION AND DT CHRONOLOGY ----
  private async buildJustificationTable(block: RenderBlock): Promise<Table> {
    const jrows = block.justRows ?? [];
    const cols = [
      { key: 'date', header: 'Date', w: 1200 },
      { key: 'time', header: 'Time', w: 1000 },
      { key: 'chronology', header: 'Chronology', w: 4800 },
      { key: 'evidence', header: 'Evidance', w: 2600 },
    ];
    const rows: TableRow[] = [];
    // Banner judul (teal, teks putih)
    rows.push(new TableRow({
      tableHeader: true,
      children: [new TableCell({
        columnSpan: cols.length,
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: this.C_TITLE },
        borders: this.noBorders(), verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'JUSTIFICATION AND DT CHRONOLOGY', bold: true, color: 'FFFFFF', size: 22 })] })],
      })],
    }));
    // Header kolom (biru muda)
    rows.push(new TableRow({
      tableHeader: true,
      children: cols.map((c) => this.cellText(c.header, { bold: true, fill: this.C_HEADER, size: 16 })),
    }));
    // Baris data
    for (const jr of jrows) {
      const cells: TableCell[] = [];
      for (const c of cols) {
        if (c.key === 'evidence') {
          const evList = (jr.evidences && jr.evidences.length > 0)
            ? jr.evidences
            : (jr.evidence ? [jr.evidence] : []);
          cells.push(await this.multiImageCell(evList));
        } else {
          const val = String((jr as Record<string, unknown>)[c.key] ?? '');
          cells.push(this.cellText(val, { align: c.key === 'chronology' ? 'left' : 'center', size: 16 }));
        }
      }
      rows.push(new TableRow({ children: cells }));
    }
    return new Table({
      width: { size: cols.reduce((s, c) => s + c.w, 0), type: WidthType.DXA },
      columnWidths: cols.map((c) => c.w),
      rows,
    });
  }
}
